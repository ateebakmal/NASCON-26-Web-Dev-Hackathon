import {
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request, Response } from "express";
import { PaymentsService } from "./payments.service";
import { PrismaService } from "../../prisma/prisma.service";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { Public } from "../../common/decorators/public.decorator";

type Caller = { workspaceId: string; userId: string; userName: string };

@Controller()
export class PaymentsController {
  constructor(
    private readonly payments: PaymentsService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService
  ) {}

  @Get("opportunities/:id/payments")
  @RequirePermission("payments:view")
  list(@CurrentUser() user: Caller, @Param("id") id: string) {
    return this.payments.listForOpportunity(user.workspaceId, id);
  }

  /** The "Send payment link" action: create the session and WhatsApp it over. */
  @Post("opportunities/:id/payment-link")
  @RequirePermission("payments:create")
  send(
    @CurrentUser() user: Caller,
    @Param("id") id: string,
    @Body() body: { amount: number; currency?: string; send?: boolean }
  ) {
    const actor = { userId: user.userId, actorLabel: user.userName };
    if (body.send === false) {
      return this.payments.createPaymentRequest(user.workspaceId, id, body, actor);
    }
    return this.payments.createAndSendOnWhatsApp(user.workspaceId, id, body, actor);
  }

  @Post("payments/:id/expire")
  @RequirePermission("payments:edit")
  expire(@CurrentUser() user: Caller, @Param("id") id: string) {
    return this.payments.expirePayment(user.workspaceId, id, {
      userId: user.userId,
      actorLabel: user.userName,
    });
  }

  @Get("integrations/stripe/events")
  @RequirePermission("integrations:view")
  events(@CurrentUser() user: Caller) {
    return this.payments.recentEvents(user.workspaceId);
  }

  /**
   * Stripe's webhook. Public because Stripe is the caller -- authenticity
   * comes from the signature, not a session (I2.3). The :webhookKey resolves
   * the workspace, so one tenant's Stripe account can never write into
   * another's data (I5.2).
   */
  @Public()
  @Post("webhooks/stripe/:webhookKey")
  async webhook(
    @Param("webhookKey") webhookKey: string,
    @Headers("stripe-signature") signature: string,
    @Req() req: Request,
    @Res() res: Response
  ) {
    const connection = await this.prisma.integrationConnection.findUnique({
      where: { webhookKey },
    });
    if (!connection) return res.status(404).send();

    const creds = (connection.credentials ?? {}) as Record<string, string>;
    const secret = creds.webhookSecret || this.config.get<string>("STRIPE_WEBHOOK_SECRET", "");
    if (!secret) return res.status(500).send("Stripe webhook secret not configured");

    // The signature is computed over the RAW body; the parsed JSON would not
    // reproduce the same bytes.
    const rawBody = (req as Request & { rawBody?: Buffer }).rawBody ?? Buffer.alloc(0);

    let event;
    try {
      event = this.payments.verifyAndParse(rawBody, signature, secret);
    } catch (err) {
      // Rejected signatures are recorded, not silently dropped, so a forged
      // webhook is visible in the sync history.
      await this.prisma.integrationEvent.create({
        data: {
          workspaceId: connection.workspaceId,
          provider: "STRIPE",
          direction: "INBOUND",
          eventType: "webhook.signature_rejected",
          success: false,
          error: err instanceof Error ? err.message : "invalid signature",
        },
      });
      return res.status(400).send("Invalid signature");
    }

    // Acknowledge fast, then process -- Stripe retries anything slow.
    res.status(200).send();
    await this.payments.applyEvent(connection.workspaceId, event);
  }
}
