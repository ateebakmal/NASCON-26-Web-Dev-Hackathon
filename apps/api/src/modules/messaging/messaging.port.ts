/**
 * The boundary between Relay and whichever WhatsApp provider is connected.
 *
 * Nothing downstream of this file knows which platform a message came from --
 * the adapter normalises each provider's payload into StandardInboundMessage,
 * so adding a provider means writing one adapter and changing nothing else.
 */

export interface StandardInboundMessage {
  /** The provider's own message id, used to ignore duplicate deliveries. */
  providerMessageId: string;
  /** E.164 without the leading "+", as providers generally send it. */
  fromPhone: string;
  /** Display name the platform reports for the sender, when it gives one. */
  fromName?: string;
  body: string;
  sentAt: Date;
}

export interface StandardStatusUpdate {
  providerMessageId: string;
  status: "SENT" | "DELIVERED" | "READ" | "FAILED";
  failureReason?: string;
}

export interface ParsedWebhook {
  messages: StandardInboundMessage[];
  statuses: StandardStatusUpdate[];
}

export interface SendResult {
  providerMessageId: string;
}

export interface MessagingPort {
  readonly provider: "WHATSAPP_CLOUD";

  /**
   * Verify the request really came from the provider. Implementations must
   * use the raw, unparsed body -- re-serialising JSON changes the bytes and
   * the signature will never match.
   */
  verifySignature(rawBody: Buffer, headers: Record<string, unknown>, appSecret: string): boolean;

  /** Normalise a provider payload into the standard shape. */
  parseWebhook(payload: unknown): ParsedWebhook;

  sendText(params: {
    toPhone: string;
    body: string;
    credentials: WhatsAppCredentials;
  }): Promise<SendResult>;
}

export interface WhatsAppCredentials {
  phoneNumberId: string;
  accessToken: string;
  appSecret: string;
  verifyToken: string;
  apiVersion: string;
}

export const MESSAGING_PORT = "MESSAGING_PORT";
