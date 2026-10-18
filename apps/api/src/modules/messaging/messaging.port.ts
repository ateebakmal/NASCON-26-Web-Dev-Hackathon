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

/**
 * Everything an adapter might need to authenticate a request. Providers
 * disagree about what is signed: Meta signs the raw JSON body, Twilio signs
 * the public URL plus the sorted form fields. Passing all of it keeps the
 * port honest rather than privileging one scheme.
 */
export interface WebhookContext {
  rawBody: Buffer;
  headers: Record<string, unknown>;
  /** The exact public URL the provider called, including query string. */
  url: string;
  /** Parsed body params, for providers that sign form fields. */
  params: Record<string, string>;
}

export interface MessagingPort {
  readonly provider: MessagingProvider;
  verifySignature(ctx: WebhookContext, secret: string): boolean;
  parseWebhook(ctx: WebhookContext): ParsedWebhook;
  sendText(params: {
    toPhone: string;
    body: string;
    credentials: Record<string, string>;
  }): Promise<SendResult>;
}

export type MessagingProvider = "WHATSAPP_CLOUD" | "TWILIO_WHATSAPP";

export interface WhatsAppCredentials {
  phoneNumberId: string;
  accessToken: string;
  appSecret: string;
  verifyToken: string;
  apiVersion: string;
}

export interface TwilioCredentials {
  accountSid: string;
  authToken: string;
  /** Sandbox default is whatsapp:+14155238886. */
  whatsappFrom: string;
}

export const MESSAGING_PORT = "MESSAGING_PORT";
