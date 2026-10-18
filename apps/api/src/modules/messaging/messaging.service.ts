import { BadRequestException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AssignmentEngineService } from "../assignment-engine/assignment-engine.service";
import { RealtimeGateway } from "../realtime/realtime.gateway";
import { WhatsAppCloudAdapter } from "./adapters/whatsapp-cloud.adapter";
import type {
  StandardInboundMessage,
  StandardStatusUpdate,
  WhatsAppCredentials,
} from "./messaging.port";

function stripEmpty<T extends object>(o: T): Partial<T> {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== "")) as Partial<T>;
}

/** Digits only, so "+92 300 1234567" and "923001234567" compare equal. */
function digits(phone: string): string {
  return phone.replace(/\D/g, "");
}

@Injectable()
export class MessagingService {
  private readonly logger = new Logger(MessagingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly assignmentEngine: AssignmentEngineService,
    private readonly realtime: RealtimeGateway,
    private readonly adapter: WhatsAppCloudAdapter
  ) {}

  // ---------------------------------------------------------------- connection

  async getConnection(workspaceId: string) {
    return this.prisma.integrationConnection.findFirst({
      where: { workspaceId, provider: "WHATSAPP_CLOUD" },
    });
  }

  async findConnectionByWebhookKey(webhookKey: string) {
    return this.prisma.integrationConnection.findUnique({ where: { webhookKey } });
  }

  credentialsOf(connection: { credentials: Prisma.JsonValue }): WhatsAppCredentials {
    const c = (connection.credentials ?? {}) as Record<string, string>;
    return {
      phoneNumberId: c.phoneNumberId ?? "",
      accessToken: c.accessToken ?? "",
      appSecret: c.appSecret ?? "",
      verifyToken: c.verifyToken ?? "",
      apiVersion: c.apiVersion || "v21.0",
    };
  }

  verifySignature(rawBody: Buffer, headers: Record<string, unknown>, appSecret: string) {
    return this.adapter.verifySignature(rawBody, headers, appSecret);
  }

  parseWebhook(payload: unknown) {
    return this.adapter.parseWebhook(payload);
  }

  /** Records an integration event, ignoring a replayed provider event id (I5.4, I1.8). */
  async recordEvent(params: {
    workspaceId: string;
    direction: "INBOUND" | "OUTBOUND";
    eventType: string;
    providerEventId?: string | null;
    payload?: unknown;
    success?: boolean;
    error?: string | null;
    reference?: string | null;
  }): Promise<{ duplicate: boolean }> {
    try {
      await this.prisma.integrationEvent.create({
        data: {
          workspaceId: params.workspaceId,
          provider: "WHATSAPP_CLOUD",
          direction: params.direction,
          eventType: params.eventType,
          providerEventId: params.providerEventId ?? null,
          payload: (params.payload ?? null) as Prisma.InputJsonValue,
          success: params.success ?? true,
          error: params.error ?? null,
          reference: params.reference ?? null,
        },
      });
      return { duplicate: false };
    } catch (err) {
      // Unique violation on (workspaceId, provider, providerEventId) means the
      // provider delivered this event before -- that is expected, not an error.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        return { duplicate: true };
      }
      throw err;
    }
  }

  /**
   * Connect (or re-connect) WhatsApp for a workspace. Credentials come from
   * env by default so a developer never has to paste secrets into the UI,
   * but can be overridden per workspace (I5.2).
   */
  async connect(
    workspaceId: string,
    creds: Partial<WhatsAppCredentials>,
    actor: { userId: string; actorLabel: string }
  ) {
    const existing = await this.getConnection(workspaceId);
    const merged = { ...(existing ? this.credentialsOf(existing) : {}), ...stripEmpty(creds) };

    const missing = (["phoneNumberId", "accessToken", "appSecret", "verifyToken"] as const).filter(
      (k) => !merged[k]
    );
    if (missing.length) {
      throw new BadRequestException(`Missing credential(s): ${missing.join(", ")}`);
    }

    const connection = await this.prisma.integrationConnection.upsert({
      where: { workspaceId_provider: { workspaceId, provider: "WHATSAPP_CLOUD" } },
      create: {
        workspaceId,
        provider: "WHATSAPP_CLOUD",
        status: "CONNECTED",
        credentials: merged as unknown as Prisma.InputJsonValue,
      },
      update: {
        status: "CONNECTED",
        lastError: null,
        credentials: merged as unknown as Prisma.InputJsonValue,
      },
    });

    await this.recordEvent({
      workspaceId,
      direction: "OUTBOUND",
      eventType: "integration.connected",
      reference: actor.actorLabel,
    });

    return connection;
  }

  // ------------------------------------------------------------------- inbound

  /**
   * The capture station: turn a provider message into a contact, a
   * conversation, a stored message and -- when the contact has no open lead
   * -- a brand new lead that the assignment engine immediately routes.
   */
  async handleInboundMessage(workspaceId: string, msg: StandardInboundMessage) {
    const contact = await this.matchOrCreateContact(workspaceId, msg);
    const conversation = await this.upsertConversation(workspaceId, contact.id, msg.sentAt);

    await this.prisma.message.create({
      data: {
        workspaceId,
        conversationId: conversation.id,
        direction: "INBOUND",
        body: msg.body,
        status: "RECEIVED",
        providerRef: msg.providerMessageId,
        createdAt: msg.sentAt,
      },
    });

    // A message from someone who already has a live lead joins that lead
    // rather than spawning a second one (A3.6).
    // Only match on identifiers the contact actually has; a NUL/sentinel
    // placeholder would be both meaningless and rejected by Postgres.
    const identifiers: Prisma.LeadWhereInput[] = [];
    if (contact.phone) identifiers.push({ phone: contact.phone });
    if (contact.email) identifiers.push({ email: contact.email });

    const openLead = identifiers.length
      ? await this.prisma.lead.findFirst({
          where: {
            workspaceId,
            status: { in: ["NEW", "ASSIGNED", "ESCALATED"] },
            OR: identifiers,
          },
          orderBy: { createdAt: "desc" },
        })
      : null;

    let lead = openLead;
    if (!openLead) {
      lead = await this.assignmentEngine.createLeadAndAssign(
        workspaceId,
        {
          source: "WHATSAPP",
          name: contact.name,
          phone: contact.phone ?? undefined,
          email: contact.email ?? undefined,
          notes: msg.body.slice(0, 500),
        },
        { userId: null, actorLabel: "system:whatsapp" }
      );
    }

    this.realtime.emitToWorkspace(workspaceId, "message:received", {
      conversationId: conversation.id,
      contactId: contact.id,
      body: msg.body,
    });

    return { contact, conversation, lead, createdLead: !openLead };
  }

  private async matchOrCreateContact(workspaceId: string, msg: StandardInboundMessage) {
    const d = digits(msg.fromPhone);
    // Match on the last 9 digits so country-code and formatting differences
    // ("+92 300 1234567" vs "923001234567") still find the same person (I1.5).
    const suffix = d.slice(-9);

    const existing = await this.prisma.contact.findFirst({
      where: { workspaceId, phone: { contains: suffix } },
    });
    if (existing) return existing;

    return this.prisma.contact.create({
      data: {
        workspaceId,
        name: msg.fromName?.trim() || `WhatsApp +${d}`,
        phone: `+${d}`,
        tags: ["whatsapp"],
      },
    });
  }

  private async upsertConversation(workspaceId: string, contactId: string, at: Date) {
    return this.prisma.conversation.upsert({
      where: {
        workspaceId_contactId_channel: { workspaceId, contactId, channel: "WHATSAPP" },
      },
      create: {
        workspaceId,
        contactId,
        channel: "WHATSAPP",
        lastMessageAt: at,
        lastInboundAt: at,
      },
      update: { lastMessageAt: at, lastInboundAt: at },
    });
  }

  /** Delivery receipts only ever move forward, never backwards (I1.4). */
  async applyStatusUpdate(workspaceId: string, update: StandardStatusUpdate) {
    const message = await this.prisma.message.findFirst({
      where: { workspaceId, providerRef: update.providerMessageId },
    });
    if (!message) return;

    const RANK: Record<string, number> = {
      QUEUED: 0,
      SENT: 1,
      DELIVERED: 2,
      READ: 3,
      FAILED: 4,
      RECEIVED: 0,
    };
    if (RANK[update.status] <= RANK[message.status] && update.status !== "FAILED") return;

    const updated = await this.prisma.message.update({
      where: { id: message.id },
      data: { status: update.status, failureReason: update.failureReason ?? null },
    });

    this.realtime.emitToWorkspace(workspaceId, "message:status", {
      messageId: updated.id,
      status: updated.status,
    });
  }

  // ------------------------------------------------------------------ outbound

  async listConversations(workspaceId: string) {
    return this.prisma.conversation.findMany({
      where: { workspaceId },
      orderBy: { lastMessageAt: "desc" },
      include: {
        contact: { select: { id: true, name: true, phone: true, optedOut: true } },
        messages: { orderBy: { createdAt: "desc" }, take: 1 },
      },
    });
  }

  async getConversation(workspaceId: string, id: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id, workspaceId },
      include: {
        contact: true,
        messages: { orderBy: { createdAt: "asc" }, take: 200 },
      },
    });
    if (!conversation) throw new NotFoundException("Conversation not found");
    return conversation;
  }

  async sendMessage(workspaceId: string, conversationId: string, body: string, userId: string) {
    const conversation = await this.prisma.conversation.findFirst({
      where: { id: conversationId, workspaceId },
      include: { contact: true },
    });
    if (!conversation) throw new NotFoundException("Conversation not found");

    // An opted-out contact is never messaged, and the caller is told why (I1.9).
    if (conversation.contact.optedOut) {
      throw new BadRequestException(
        "This contact has opted out of messages and cannot be contacted."
      );
    }

    const connection = await this.getConnection(workspaceId);
    if (!connection || connection.status !== "CONNECTED") {
      throw new BadRequestException("WhatsApp is not connected for this workspace.");
    }

    // Record the attempt first so a provider failure still leaves a visible
    // message the employee can retry, rather than vanishing (I1.7).
    const pending = await this.prisma.message.create({
      data: {
        workspaceId,
        conversationId,
        direction: "OUTBOUND",
        body,
        status: "QUEUED",
        sentByUserId: userId,
      },
    });

    try {
      const result = await this.adapter.sendText({
        toPhone: conversation.contact.phone ?? "",
        body,
        credentials: this.credentialsOf(connection),
      });

      const sent = await this.prisma.message.update({
        where: { id: pending.id },
        data: { status: "SENT", providerRef: result.providerMessageId },
      });

      await Promise.all([
        this.prisma.conversation.update({
          where: { id: conversationId },
          data: { lastMessageAt: new Date() },
        }),
        this.prisma.integrationConnection.update({
          where: { id: connection.id },
          data: { lastSuccessAt: new Date(), lastError: null, status: "CONNECTED" },
        }),
        this.recordEvent({
          workspaceId,
          direction: "OUTBOUND",
          eventType: "message.sent",
          providerEventId: result.providerMessageId,
          reference: result.providerMessageId,
        }),
      ]);

      this.realtime.emitToWorkspace(workspaceId, "message:sent", { conversationId });
      return sent;
    } catch (err) {
      const reason = err instanceof Error ? err.message : "Send failed";

      const failed = await this.prisma.message.update({
        where: { id: pending.id },
        data: { status: "FAILED", failureReason: reason },
      });

      await Promise.all([
        this.prisma.integrationConnection.update({
          where: { id: connection.id },
          data: { status: "ERROR", lastError: reason },
        }),
        this.recordEvent({
          workspaceId,
          direction: "OUTBOUND",
          eventType: "message.send_failed",
          success: false,
          error: reason,
        }),
      ]);

      this.realtime.emitToWorkspace(workspaceId, "message:status", {
        messageId: failed.id,
        status: "FAILED",
      });
      throw new BadRequestException(reason);
    }
  }

  /** Recent sync history for the integrations page (I5.1, I5.4). */
  async recentEvents(workspaceId: string) {
    return this.prisma.integrationEvent.findMany({
      where: { workspaceId, provider: "WHATSAPP_CLOUD" },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  }

  async retryMessage(workspaceId: string, messageId: string, userId: string) {
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, workspaceId, status: "FAILED" },
    });
    if (!message) throw new NotFoundException("No failed message to retry");
    return this.sendMessage(workspaceId, message.conversationId, message.body, userId);
  }
}
