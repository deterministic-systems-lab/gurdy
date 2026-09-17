import { createHash, randomBytes } from "node:crypto";

export function hashToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function newDeviceToken(): string {
  return `grd_${randomBytes(32).toString("hex")}`;
}

export function newAdminToken(): string {
  return `gra_${randomBytes(32).toString("hex")}`;
}

export function bearerToken(header: string | null): string | null {
  if (!header) {
    return null;
  }
  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    return null;
  }
  return token;
}
