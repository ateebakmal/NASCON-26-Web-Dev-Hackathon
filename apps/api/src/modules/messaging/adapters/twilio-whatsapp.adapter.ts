import { createHmac, timingSafeEqual } from "crypto";
import { Injectable, Logger } from "@nestjs/common";
import type {
  MessagingPort,
  ParsedWebhook,
  SendResult,
  StandardInboundMessage,
  StandardStatusUpdate,
  WebhookContext,
} from "../messaging.port";

const STATUS_MAP: Record<string, StandardStatusUpdate["status"]> = {
  sent: "SENT",
  delivered: "DELIVERED",
  read: "READ",
  failed: "FAILED",
  undelivered: "FAILED",
};

/** Twilio prefixes WhatsApp addresses; downstream only wants the digits. */
function stripChannel(address: string): string {
  return (address ?? "").replace(/^whatsapp:/, "").replace(/^\+/, "");
}

@Injectable()
export class TwilioWhatsAppAdapter implements MessagingPort {
  readonly provider = "TWILIO_WHATSAPP" as const;
  private readonly logger = new Logger(TwilioWhatsAppAdapter.name);

  /**
   * Twilio signs the exact public URL concatenated with every POST field,
   * sorted by key, as HMAC-SHA1 keyed with the Auth Token -- NOT the raw
   * body. Behind a tunnel the request's own host is wrong, so the caller
   * must pass the public URL from configuration rather than from the request.
   */
  verifySignature(ctx: WebhookContext, authToken: string): boolean {
    const header = (ctx.headers["x-twilio-signature"] ??
      ctx.headers["X-Twilio-Signature"]) as string | undefined;
    if (!header) return false;

    const payload =
      ctx.url +
      Object.keys(ctx.params)
        .sort()
        .map((key) => key + ctx.params[key])
        .join("");

    const expected = createHmac("sha1", authToken).update(Buffer.from(payload, "utf-8")).digest("base64");

    const a = Buffer.from(header);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }

  parseWebhook(ctx: WebhookContext): ParsedWebhook {
    const p = ctx.params;
    const messages: StandardInboundMessage[] = [];
    const statuses: StandardStatusUpdate[] = [];

    // Twilio posts one message per request, not a batch.
    if (p.MessageSid && p.From && p.Body !== undefined && !p.MessageStatus) {
      messages.push({
        providerMessageId: p.MessageSid,
        fromPhone: stripChannel(p.From),
        fromName: p.ProfileName || undefined,
        body: p.Body ?? "",
        sentAt: new Date(),
      });
    }

    // Status callbacks arrive on the same shape with MessageStatus set.
    if (p.MessageSid && p.MessageStatus) {
      const mapped = STATUS_MAP[p.MessageStatus.toLowerCase()];
      if (mapped) {
        statuses.push({
          providerMessageId: p.MessageSid,
          status: mapped,
          failureReason: p.ErrorMessage || (p.ErrorCode ? `Twilio error ${p.ErrorCode}` : undefined),
        });
      }
    }

    return { messages, statuses };
  }

  async sendText({
    toPhone,
    body,
    credentials,
  }: {
    toPhone: string;
    body: string;
    credentials: Record<string, string>;
  }): Promise<SendResult> {
    const accountSid = credentials.accountSid;
    const authToken = credentials.authToken;
    const from = credentials.whatsappFrom || "whatsapp:+14155238886";

    const to = `whatsapp:+${stripChannel(toPhone)}`;
    const form = new URLSearchParams({ From: from, To: to, Body: body });

    const res = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form.toString(),
      }
    );

    const json = (await res.json().catch(() => ({}))) as {
      sid?: string;
      message?: string;
      code?: number;
      more_info?: string;
    };

    if (!res.ok || !json.sid) {
      // Twilio's own wording is far more useful than a status code -- e.g.
      // error 63015 means the recipient has not joined the sandbox.
      const reason = json.message ?? `HTTP ${res.status}`;
      throw new Error(json.code ? `${reason} (Twilio ${json.code})` : reason);
    }

    return { providerMessageId: json.sid };
  }
}
