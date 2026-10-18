import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MessagingService } from "./messaging.service";
import { CurrentUser } from "../../common/decorators/current-user.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";

type Caller = { workspaceId: string; userId: string; userName: string };

@Controller()
export class MessagingController {
  constructor(
    private readonly messaging: MessagingService,
    private readonly config: ConfigService
  ) {}

  @Get("conversations")
  @RequirePermission("contacts:view")
  list(@CurrentUser() user: Caller) {
    return this.messaging.listConversations(user.workspaceId);
  }

  @Get("conversations/:id")
  @RequirePermission("contacts:view")
  getOne(@CurrentUser() user: Caller, @Param("id") id: string) {
    return this.messaging.getConversation(user.workspaceId, id);
  }

  @Post("conversations/:id/messages")
  @RequirePermission("contacts:edit")
  send(@CurrentUser() user: Caller, @Param("id") id: string, @Body() body: { body: string }) {
    return this.messaging.sendMessage(user.workspaceId, id, body.body, user.userId);
  }

  @Post("messages/:id/retry")
  @RequirePermission("contacts:edit")
  retry(@CurrentUser() user: Caller, @Param("id") id: string) {
    return this.messaging.retryMessage(user.workspaceId, id, user.userId);
  }

  /**
   * Integration status for the settings page. Credentials are never returned
   * in full -- only a last-4 hint, so a secret can't be read back out of the
   * API by anyone who gains UI access (I5.3).
   */
  @Get("integrations/whatsapp")
  @RequirePermission("integrations:view")
  async status(@CurrentUser() user: Caller) {
    const connection = await this.messaging.getConnection(user.workspaceId);
    if (!connection) {
      return { status: "NOT_CONNECTED", webhookUrl: null, limits: LIMITS };
    }
    const creds = this.messaging.credentialsOf(connection);
    const base = this.config.get<string>("PUBLIC_BASE_URL", "");
    return {
      status: connection.status,
      lastSuccessAt: connection.lastSuccessAt,
      lastError: connection.lastError,
      phoneNumberIdHint: mask(creds.phoneNumberId),
      accessTokenHint: mask(creds.accessToken),
      verifyToken: creds.verifyToken,
      webhookUrl: base ? `${base}/webhooks/whatsapp/${connection.webhookKey}` : null,
      limits: LIMITS,
    };
  }

  /**
   * Connects WhatsApp for this workspace. With an empty body it falls back to
   * the server's env vars, so a developer never pastes secrets into a form.
   */
  @Post("integrations/whatsapp/connect")
  @RequirePermission("integrations:manage_integrations")
  connect(
    @CurrentUser() user: Caller,
    @Body()
    body: {
      phoneNumberId?: string;
      accessToken?: string;
      appSecret?: string;
      verifyToken?: string;
    }
  ) {
    return this.messaging.connect(
      user.workspaceId,
      {
        phoneNumberId: body.phoneNumberId ?? this.config.get<string>("WHATSAPP_PHONE_NUMBER_ID"),
        accessToken: body.accessToken ?? this.config.get<string>("WHATSAPP_ACCESS_TOKEN"),
        appSecret: body.appSecret ?? this.config.get<string>("WHATSAPP_APP_SECRET"),
        verifyToken: body.verifyToken ?? this.config.get<string>("WHATSAPP_VERIFY_TOKEN"),
        apiVersion: this.config.get<string>("WHATSAPP_API_VERSION", "v21.0"),
      },
      { userId: user.userId, actorLabel: user.userName }
    );
  }

  @Get("integrations/whatsapp/events")
  @RequirePermission("integrations:view")
  events(@CurrentUser() user: Caller) {
    return this.messaging.recentEvents(user.workspaceId);
  }
}

/** Stated plainly in the UI so nobody is surprised mid-demo (I5.6). */
const LIMITS = [
  "Development mode reaches only phone numbers added and verified in the Meta dashboard (max 5).",
  "Free-form replies are allowed for 24 hours after the customer's last message; outside that window Meta requires an approved template.",
  "The temporary access token from the Meta dashboard expires after 24 hours.",
];

function mask(value: string): string | null {
  if (!value) return null;
  return `••••${value.slice(-4)}`;
}
