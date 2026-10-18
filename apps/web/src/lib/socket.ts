import { io, type Socket } from "socket.io-client";
import { API_BASE } from "./api";

let socket: Socket | null = null;

/**
 * The socket is created lazily and does NOT auto-connect: connecting before
 * the user has logged in just produces failed handshakes, and the default
 * infinite retry floods the console when the API is briefly down.
 */
export function getSocket(): Socket {
  if (!socket) {
    socket = io(API_BASE, {
      withCredentials: true,
      autoConnect: false,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
      timeout: 5000,
    });
  }
  return socket;
}

export function connectSocket(): Socket {
  const s = getSocket();
  if (!s.connected) s.connect();
  return s;
}

export function disconnectSocket() {
  if (socket?.connected) socket.disconnect();
}
