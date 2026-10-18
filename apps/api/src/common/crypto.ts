import { createHash, randomBytes } from "crypto";

/** Raw opaque session token handed to the client as a cookie value. */
export function generateSessionToken(): string {
  return randomBytes(32).toString("hex");
}

/** Only the hash is ever persisted -- the raw token in the cookie is the only copy that can look itself up. */
export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}
