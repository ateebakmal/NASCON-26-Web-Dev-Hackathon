import { createHmac, timingSafeEqual } from "crypto";
import { Injectable, Logger } from "@nestjs/common";
import type {
  MessagingPort,
  ParsedWebhook,
  SendResult,
  StandardInboundMessage,
  StandardStatusUpdate,
  WhatsAppCredentials,
} from "../messaging.port";

// Shape of the slice of Meta's webhook payload we actually read.
interface CloudApiPayload {
  entry?: Array<{
    changes?: Array<{
      value?: {
        contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
        messages?: Array<{
          id?: string;
          from?: string;
          timestamp?: string;
          type?: string;
          text?: { body?: string };
        }>;
        statuses?: Array<{
          id?: string;
          status?: string;
          errors?: Array<{ title?: string; message?: string }>;
        }>;
      };
    }>;
  }>;
}

@Injectable()
export class WhatsAppCloudAdapter implements MessagingPort {
  readonly provider = "WHATSAPP_CLOUD" as const;
  private readonly logger = new Logger(WhatsAppCloudAdapter.name);

  /**
   * Meta signs the RAW request body with the app secret as
   * X-Hub-Signature-256: sha256=<hex>. The comparison is timing-safe so the
   * endpoint doesn't leak signature bytes through response timing.
   */
  verifySignature(rawBody: Buffer, headers: Record<string, unknown>, appSecret: string): boolean {
    const header = (headers["x-hub-signature-256"] ?? headers["X-Hub-Signature-256"]) as
      | string
      | undefined;
    if (!header?.startsWith("sha256=") || !rawBody?.length) return false;

    const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
    const received = header.slice("sha256=".length);
    if (received.length !== expected.length) return false;

    return timingSafeEqual(Buffer.from(received, "hex"), Buffer.from(expected, "hex"));
  }

  parseWebhook(payload: unknown): ParsedWebhook {
    const body = payload as CloudApiPayload;
    const messages: StandardInboundMessage[] = [];
    const statuses: StandardStatusUpdate[] = [];

    for (const entry of body?.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const value = change.value;
        if (!value) continue;

        // Meta sends the sender's profile name alongside, keyed by wa_id.
        const nameByWaId = new Map<string, string>();
        for (const c of value.contacts ?? []) {
          if (c.wa_id && c.profile?.name) nameByWaId.set(c.wa_id, c.profile.name);
        }

        for (const m of value.messages ?? []) {
          if (!m.id || !m.from) continue;
          // Non-text messages (image, audio, location...) still create a lead,
          // with a placeholder body so nothing is silently dropped.
          const body =
            m.type === "text"
              ? (m.text?.body ?? "")
              : `[${m.type ?? "unsupported"} message]`;
          messages.push({
            providerMessageId: m.id,
            fromPhone: m.from,
            fromName: nameByWaId.get(m.from),
            body,
            sentAt: m.timestamp ? new Date(Number(m.timestamp) * 1000) : new Date(),
          });
        }

        for (const s of value.statuses ?? []) {
          if (!s.id || !s.status) continue;
          const mapped = STATUS_MAP[s.status];
          if (!mapped) continue;
          statuses.push({
            providerMessageId: s.id,
            status: mapped,
            failureReason: s.errors?.[0]?.message ?? s.errors?.[0]?.title,
          });
        }
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
    credentials: WhatsAppCredentials;
  }): Promise<SendResult> {
    const url = `https://graph.facebook.com/${credentials.apiVersion}/${credentials.phoneNumberId}/messages`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${credentials.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: toPhone.replace(/^\+/, ""),
        type: "text",
        text: { preview_url: false, body },
      }),
    });

    const json = (await res.json().catch(() => ({}))) as {
      messages?: Array<{ id?: string }>;
      error?: { message?: string; error_data?: { details?: string } };
    };

    if (!res.ok) {
      // Surface Meta's own wording -- it is far more useful than a status code
      // ("Recipient phone number not in allowed list" is the usual one in dev).
      const reason =
        json.error?.error_data?.details ?? json.error?.message ?? `HTTP ${res.status}`;
      throw new Error(reason);
    }

    const id = json.messages?.[0]?.id;
    if (!id) throw new Error("Provider accepted the send but returned no message id");

    return { providerMessageId: id };
  }
}

const STATUS_MAP: Record<string, StandardStatusUpdate["status"]> = {
  sent: "SENT",
  delivered: "DELIVERED",
  read: "READ",
  failed: "FAILED",
};
