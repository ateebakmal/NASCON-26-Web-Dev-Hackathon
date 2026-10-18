import { Body, Controller, Get, Headers, Param, Post, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { ConfigService } from "@nestjs/config";
import type { Prisma } from "@prisma/client";
import { Public } from "../../common/decorators/public.decorator";
import { MessagingService } from "./messaging.service";
import type { WebhookContext } from "./messaging.port";

/**
 * Meta's webhook endpoint. Public because the caller is Meta, not a logged-in
 * user -- authenticity comes from the X-Hub-Signature-256 HMAC instead of a
 * session (I1.2). The :webhookKey in the path resolves which workspace the
 * event belongs to, so one tenant's provider can never deliver into another's
 * data (I5.2).
 */
@Controller("webhooks/whatsapp")
export class WebhooksController {
  constructor(
    private readonly messaging: MessagingService,
    private readonly config: ConfigService
  ) {}

  /**
   * Meta's subscription handshake: it GETs with a challenge and expects the
   * challenge echoed back as plain text, but only if our verify token matches.
   */
  @Public()
  @Get(":webhookKey")
  async verify(
    @Param("webhookKey") webhookKey: string,
    @Query("hub.mode") mode: string,
    @Query("hub.verify_token") verifyToken: string,
    @Query("hub.challenge") challenge: string,
    @Res() res: Response
  ) {
    const connection = await this.messaging.findConnectionByWebhookKey(webhookKey);
    if (!connection) return res.status(404).send("Unknown webhook key");

    const creds = this.messaging.credentialsOf(connection);
    if (mode !== "subscribe" || verifyToken !== creds.verifyToken) {
      await this.messaging.recordEvent({
        workspaceId: connection.workspaceId,
        direction: "INBOUND",
        eventType: "webhook.verify_rejected",
        success: false,
        error: "verify token mismatch",
      });
      return res.status(403).send("Verification failed");
    }

    return res.status(200).send(challenge);
  }

  @Public()
  @Post(":webhookKey")
  async receive(
    @Param("webhookKey") webhookKey: string,
    @Headers() headers: Record<string, string>,
    @Body() body: unknown,
    @Req() req: Request,
    @Res() res: Response
  ) {
    const connection = await this.messaging.findConnectionByWebhookKey(webhookKey);
    if (!connection) return res.status(404).send();

    // rawBody is captured by the verify hook in main.ts -- re-serialising the
    // parsed JSON would change the bytes and Meta's HMAC would never match.
    // Twilio instead signs the public URL plus the sorted form fields, which
    // is why the public base comes from config: behind a tunnel the request's
    // own host is the internal one and would never match.
    const base = this.config.get<string>("PUBLIC_BASE_URL", "");
    const ctx = {
      rawBody: (req as Request & { rawBody?: Buffer }).rawBody ?? Buffer.alloc(0),
      headers,
      url: `${base}${req.originalUrl}`,
      params: (body ?? {}) as Record<string, string>,
    };

    if (!this.messaging.verifySignature(connection, ctx)) {
      // A forged or altered request is rejected AND recorded, so a rejected
      // signature is visible in the sync history rather than silent (I1.2).
      await this.messaging.recordEvent({
        workspaceId: connection.workspaceId,
        direction: "INBOUND",
        eventType: "webhook.signature_rejected",
        success: false,
        error: "X-Hub-Signature-256 did not match",
        payload: { headers: { "x-hub-signature-256": headers["x-hub-signature-256"] } },
      });
      return res.status(401).send();
    }

    // Acknowledge fast; Meta retries anything it considers slow or failed.
    res.status(200).send();

    try {
      await this.process(connection.workspaceId, connection, ctx);
    } catch (err) {
      await this.messaging.recordEvent({
        workspaceId: connection.workspaceId,
        direction: "INBOUND",
        eventType: "webhook.processing_failed",
        success: false,
        error: err instanceof Error ? err.message : "unknown error",
      });
    }
  }

  private async process(
    workspaceId: string,
    connection: { credentials: Prisma.JsonValue },
    ctx: WebhookContext
  ) {
    const { messages, statuses } = this.messaging.parseWebhook(connection, ctx);

    for (const msg of messages) {
      // The provider's message id is the dedupe key: a redelivered webhook
      // records nothing twice, so no duplicate message and no duplicate
      // lead (I1.8).
      const { duplicate } = await this.messaging.recordEvent({
        workspaceId,
        direction: "INBOUND",
        eventType: "message.received",
        providerEventId: msg.providerMessageId,
        payload: msg,
        reference: msg.providerMessageId,
      });
      if (duplicate) continue;

      await this.messaging.handleInboundMessage(workspaceId, msg);
    }

    for (const status of statuses) {
      const { duplicate } = await this.messaging.recordEvent({
        workspaceId,
        direction: "INBOUND",
        eventType: `message.${status.status.toLowerCase()}`,
        providerEventId: `${status.providerMessageId}:${status.status}`,
        reference: status.providerMessageId,
      });
      if (duplicate) continue;

      await this.messaging.applyStatusUpdate(workspaceId, status);
    }
  }
}
