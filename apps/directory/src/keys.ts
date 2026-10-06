import { createHmac } from "node:crypto";

// Directory keys are HMACs, so the directory never stores a plain email or provider ID
// (build plan section 4). "p:" keys identify a provider account, "e:" keys a verified email.

export function providerKey(secret: string, issuer: string, subject: string): string {
  return `p:${hmac(secret, `${issuer}\n${subject}`)}`;
}

export function emailKey(secret: string, email: string): string {
  return `e:${hmac(secret, normaliseEmail(email))}`;
}

export function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function hmac(secret: string, value: string): string {
  return createHmac("sha256", secret).update(value).digest("hex");
}
