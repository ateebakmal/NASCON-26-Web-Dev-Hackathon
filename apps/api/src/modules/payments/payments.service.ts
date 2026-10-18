import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma, type PaymentStatus } from "@prisma/client";
// stripe exports the constructor directly on module.exports with no
// `.default`, so a default import compiles to undefined under CommonJS.
// This form also keeps the Stripe.* namespace types available.
import Stripe = require("stripe");
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { MessagingService } from "../messaging/messaging.service";

type Actor = { userId: string; actorLabel: string };

/**
 * Stripe is reached only through this service, so swapping the provider
 * touches one file (Q14). We use hosted Checkout Sessions rather than Payment
 * Links because each payment needs its own metadata (workspace, deal,
 * payment), a short expiry, and programmatic early expiry.
 */
@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  private readonly stripe: Stripe | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeGateway,
    private readonly messaging: MessagingService,
    private readonly config: ConfigService
  ) {
    const key = this.config.get<string>("STRIPE_SECRET_KEY");
    // Missing key must not crash the app -- one provider being unconfigured
    // never takes down the rest of the platform (I5.8).
    this.stripe = key ? new Stripe(key) : null;
  }

  private client(): Stripe {
    if (!this.stripe) {
      throw new BadRequestException("Stripe is not configured for this server.");
    }
    return this.stripe;
  }

  /** Stripe works in the smallest currency unit. */
  private toMinorUnits(amount: number, currency: string): number {
    const ZERO_DECIMAL = new Set(["jpy", "krw", "vnd", "clp", "isk", "ugx"]);
    return ZERO_DECIMAL.has(currency.toLowerCase())
      ? Math.round(amount)
      : Math.round(amount * 100);
  }

  // ------------------------------------------------------------------ create

  async createPaymentRequest(
    workspaceId: string,
    opportunityId: string,
    input: { amount: number; currency?: string },
    actor: Actor
  ) {
    const opportunity = await this.prisma.opportunity.findFirst({
      where: { id: opportunityId, workspaceId },
      include: { contact: true },
    });
    if (!opportunity) throw new NotFoundException("Deal not found");
    if (input.amount <= 0) throw new BadRequestException("Amount must be greater than zero");

    const currency = (input.currency ?? opportunity.currency ?? "PKR").toLowerCase();
    const base = this.config.get<string>("PUBLIC_BASE_URL", "http://localhost:5180");
    const web = this.config.get<string>("WEB_ORIGIN", "http://localhost:5180");

    // Record our side first so a Stripe failure still leaves a visible,
    // retryable payment rather than nothing at all.
    const payment = await this.prisma.payment.create({
      data: {
        workspaceId,
        opportunityId,
        amount: new Prisma.Decimal(input.amount),
        currency: currency.toUpperCase(),
        status: "PENDING",
        provider: "stripe",
        requestedBy: actor.userId,
      },
    });

    try {
      const session = await this.client().checkout.sessions.create(
        {
          mode: "payment",
          // price_data rather than a stored Product: each deal is a one-off
          // amount, so there is no catalogue to keep in Stripe.
          line_items: [
            {
              quantity: 1,
              price_data: {
                currency,
                unit_amount: this.toMinorUnits(input.amount, currency),
                product_data: {
                  name: opportunity.name,
                  description: `${opportunity.contact.name} · SunPeak Solar`,
                },
              },
            },
          ],
          // Metadata is what makes every payment traceable back to the deal,
          // contact and requesting employee (I2.7), and is what the webhook
          // uses to find the record without trusting anything client-side.
          metadata: {
            workspaceId,
            opportunityId,
            paymentId: payment.id,
            contactId: opportunity.contactId,
            requestedBy: actor.userId,
          },
          client_reference_id: payment.id,
          customer_email: opportunity.contact.email ?? undefined,
          // Minimum allowed is 30 minutes; we use exactly that so an abandoned
          // checkout surfaces as expired quickly. For the demo we expire early
          // through the API instead of waiting.
          expires_at: Math.floor(Date.now() / 1000) + 30 * 60,
          success_url: `${web}/payment-complete?status=paid&payment=${payment.id}`,
          cancel_url: `${web}/payment-complete?status=cancelled&payment=${payment.id}`,
        },
        // Idempotency key: a retried create never produces a second session
        // for the same payment.
        { idempotencyKey: `payment-create-${payment.id}` }
      );

      const updated = await this.prisma.payment.update({
        where: { id: payment.id },
        data: {
          providerRef: session.id,
          checkoutUrl: session.url,
          expiresAt: session.expires_at ? new Date(session.expires_at * 1000) : null,
        },
      });

      await Promise.all([
        this.recordEvent({
          workspaceId,
          direction: "OUTBOUND",
          eventType: "checkout_session.created",
          providerEventId: session.id,
          reference: session.id,
        }),
        this.audit.record({
          workspaceId,
          actorId: actor.userId,
          actorLabel: actor.actorLabel,
          eventType: "payment.requested",
          targetType: "Payment",
          targetId: payment.id,
          after: { amount: input.amount, currency, opportunityId },
        }),
      ]);

      this.realtime.emitToWorkspace(workspaceId, "payment:changed", updated);
      return updated;
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Stripe rejected the request";
      await this.prisma.payment.update({
        where: { id: payment.id },
        data: { status: "FAILED" },
      });
      await this.recordEvent({
        workspaceId,
        direction: "OUTBOUND",
        eventType: "checkout_session.create_failed",
        success: false,
        error: reason,
      });
      throw new BadRequestException(reason);
    }
  }

  /**
   * Creates the link then sends it to the customer on WhatsApp -- the
   * "send payment link" action the salesperson actually performs.
   */
  async createAndSendOnWhatsApp(
    workspaceId: string,
    opportunityId: string,
    input: { amount: number; currency?: string },
    actor: Actor
  ) {
    const payment = await this.createPaymentRequest(workspaceId, opportunityId, input, actor);

    const opportunity = await this.prisma.opportunity.findFirstOrThrow({
      where: { id: opportunityId, workspaceId },
      include: { contact: true },
    });

    const conversation = await this.prisma.conversation.findFirst({
      where: { workspaceId, contactId: opportunity.contactId, channel: "WHATSAPP" },
    });

    if (!conversation) {
      // No WhatsApp thread exists, so the link cannot be delivered that way.
      // The payment is still valid and its URL is shown in the UI to copy.
      return { payment, accepted: false, reason: "No WhatsApp conversation with this contact yet." };
    }

    const body =
      `Hi ${opportunity.contact.name}, here is your payment link for ` +
      `${payment.currency} ${Number(payment.amount).toLocaleString()} ` +
      `(${opportunity.name}):\n\n${payment.checkoutUrl}\n\nThis link expires in 30 minutes.`;

    try {
      await this.messaging.sendMessage(workspaceId, conversation.id, body, actor.userId);
      // "accepted", not "delivered": the provider only acknowledges receipt
      // here. Real delivery (or failure) arrives later on a status webhook,
      // so the message row is the source of truth, not this return value.
      return { payment, accepted: true };
    } catch (err) {
      return {
        payment,
        accepted: false,
        reason: err instanceof Error ? err.message : "Could not send on WhatsApp",
      };
    }
  }

  /** Expires an open session immediately -- used to demo the expired state. */
  async expirePayment(workspaceId: string, paymentId: string, actor: Actor) {
    const payment = await this.prisma.payment.findFirst({
      where: { id: paymentId, workspaceId },
    });
    if (!payment?.providerRef) throw new NotFoundException("Payment not found");
    if (payment.status !== "PENDING") {
      throw new BadRequestException(`Only a pending payment can be expired (it is ${payment.status}).`);
    }

    await this.client().checkout.sessions.expire(payment.providerRef);
    await this.audit.record({
      workspaceId,
      actorId: actor.userId,
      actorLabel: actor.actorLabel,
      eventType: "payment.expired_manually",
      targetType: "Payment",
      targetId: paymentId,
    });
    // The status flips when Stripe's checkout.session.expired webhook lands,
    // so the webhook stays the single source of truth for payment state.
    return { success: true };
  }

  // ----------------------------------------------------------------- webhook

  verifyAndParse(rawBody: Buffer, signature: string, webhookSecret: string): Stripe.Event {
    return this.client().webhooks.constructEvent(rawBody, signature, webhookSecret);
  }

  /**
   * Applies a Stripe event. Deduped on Stripe's own event id, so the same
   * event delivered more than once records the payment exactly once (I2.4).
   */
  async applyEvent(workspaceId: string, event: Stripe.Event) {
    const { duplicate } = await this.recordEvent({
      workspaceId,
      direction: "INBOUND",
      eventType: event.type,
      providerEventId: event.id,
      reference: event.id,
    });
    if (duplicate) {
      this.logger.log(`Ignored duplicate Stripe event ${event.id}`);
      return { duplicate: true };
    }

    switch (event.type) {
      case "checkout.session.completed":
        await this.onSessionCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case "checkout.session.expired":
        await this.onSessionStatus(event.data.object as Stripe.Checkout.Session, "EXPIRED");
        break;
      case "checkout.session.async_payment_failed":
        await this.onSessionStatus(event.data.object as Stripe.Checkout.Session, "FAILED");
        break;
      case "charge.refunded":
        await this.onChargeRefunded(event.data.object as Stripe.Charge);
        break;
      default:
        break;
    }
    return { duplicate: false };
  }

  private async onSessionCompleted(session: Stripe.Checkout.Session) {
    const payment = await this.findPaymentForSession(session);
    if (!payment) return;

    // Stripe can deliver events out of order, so never downgrade a payment
    // that is already settled.
    if (payment.status === "PAID" || payment.status === "REFUNDED") return;

    const updated = await this.prisma.payment.update({
      where: { id: payment.id },
      data: { status: "PAID", paidAt: new Date() },
    });

    await this.audit.record({
      workspaceId: payment.workspaceId,
      actorId: null,
      actorLabel: "system:stripe",
      eventType: "payment.paid",
      targetType: "Payment",
      targetId: payment.id,
      after: { amount: Number(updated.amount), currency: updated.currency },
    });

    this.realtime.emitToWorkspace(payment.workspaceId, "payment:changed", updated);
  }

  private async onSessionStatus(session: Stripe.Checkout.Session, status: PaymentStatus) {
    const payment = await this.findPaymentForSession(session);
    if (!payment) return;
    // A session that was already paid cannot later become expired/failed.
    if (payment.status !== "PENDING") return;

    const updated = await this.prisma.payment.update({
      where: { id: payment.id },
      data: { status },
    });
    this.realtime.emitToWorkspace(payment.workspaceId, "payment:changed", updated);
  }

  /** A refund issued from the Stripe dashboard is reflected here (I2.5). */
  private async onChargeRefunded(charge: Stripe.Charge) {
    const paymentIntentId =
      typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
    if (!paymentIntentId) return;

    // The charge carries no session id, so find the session it belongs to.
    const sessions = await this.client().checkout.sessions.list({
      payment_intent: paymentIntentId,
      limit: 1,
    });
    const sessionId = sessions.data[0]?.id;
    if (!sessionId) return;

    const payment = await this.prisma.payment.findFirst({ where: { providerRef: sessionId } });
    if (!payment) return;

    const refunded = charge.amount_refunded / 100;
    const updated = await this.prisma.payment.update({
      where: { id: payment.id },
      data: {
        refundedAmount: new Prisma.Decimal(refunded),
        // A partial refund leaves the payment PAID with a refunded amount;
        // only a full refund flips the status.
        status: charge.amount_refunded >= charge.amount ? "REFUNDED" : payment.status,
      },
    });

    await this.audit.record({
      workspaceId: payment.workspaceId,
      actorId: null,
      actorLabel: "system:stripe",
      eventType: "payment.refunded",
      targetType: "Payment",
      targetId: payment.id,
      after: { refundedAmount: refunded },
    });

    this.realtime.emitToWorkspace(payment.workspaceId, "payment:changed", updated);
  }

  private async findPaymentForSession(session: Stripe.Checkout.Session) {
    const byMetadata = session.metadata?.paymentId;
    if (byMetadata) {
      const p = await this.prisma.payment.findUnique({ where: { id: byMetadata } });
      if (p) return p;
    }
    return this.prisma.payment.findFirst({ where: { providerRef: session.id } });
  }

  // ------------------------------------------------------------------- reads

  async listForOpportunity(workspaceId: string, opportunityId: string) {
    return this.prisma.payment.findMany({
      where: { workspaceId, opportunityId },
      orderBy: { createdAt: "desc" },
    });
  }

  async recentEvents(workspaceId: string) {
    return this.prisma.integrationEvent.findMany({
      where: { workspaceId, provider: "STRIPE" },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  private async recordEvent(params: {
    workspaceId: string;
    direction: "INBOUND" | "OUTBOUND";
    eventType: string;
    providerEventId?: string | null;
    success?: boolean;
    error?: string | null;
    reference?: string | null;
  }): Promise<{ duplicate: boolean }> {
    try {
      await this.prisma.integrationEvent.create({
        data: {
          workspaceId: params.workspaceId,
          provider: "STRIPE",
          direction: params.direction,
          eventType: params.eventType,
          providerEventId: params.providerEventId ?? null,
          success: params.success ?? true,
          error: params.error ?? null,
          reference: params.reference ?? null,
        },
      });
      return { duplicate: false };
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return { duplicate: true };
      }
      throw err;
    }
  }
}
