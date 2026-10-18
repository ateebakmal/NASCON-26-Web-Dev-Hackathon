import { Injectable, Logger } from "@nestjs/common";
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import { PrismaService } from "../../prisma/prisma.service";
import { hashToken } from "../../common/crypto";

function workspaceRoom(workspaceId: string) {
  return `workspace:${workspaceId}`;
}

// Joins each socket to its workspace's room by re-validating the SAME
// session cookie SessionAuthGuard checks on HTTP requests -- the handshake
// is the only place a socket proves which workspace it belongs to, so a
// client can never ask to join an arbitrary room.
@Injectable()
@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class RealtimeGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);

  @WebSocketServer()
  server!: Server;

  constructor(private readonly prisma: PrismaService) {}

  async handleConnection(socket: Socket) {
    const cookieHeader = socket.handshake.headers.cookie ?? "";
    const rawToken = parseCookie(cookieHeader, process.env.SESSION_COOKIE_NAME ?? "ubp_session");
    if (!rawToken) {
      socket.disconnect(true);
      return;
    }

    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashToken(rawToken) },
      include: { user: true },
    });
    if (!session || session.revokedAt || session.expiresAt < new Date()) {
      socket.disconnect(true);
      return;
    }

    await socket.join(workspaceRoom(session.user.workspaceId));
  }

  handleDisconnect(socket: Socket) {
    this.logger.debug(`Socket disconnected: ${socket.id}`);
  }

  emitToWorkspace(workspaceId: string, event: string, payload: unknown) {
    this.server?.to(workspaceRoom(workspaceId)).emit(event, payload);
  }
}

function parseCookie(header: string, name: string): string | undefined {
  const match = header.split(";").map((p) => p.trim()).find((p) => p.startsWith(`${name}=`));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : undefined;
}

export { workspaceRoom };
