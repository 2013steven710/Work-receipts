import { jwtVerify, SignJWT } from "jose";

// A short-lived proof that the caller already verified an identity, so the country question can be
// answered without signing in to the provider again.

export interface Ticket {
  method: "email" | "google" | "microsoft";
  keys: string[];
  /** Email sign-in only: needed to issue the regional sign-in token. */
  email?: string;
}

const TTL = "15m";

export async function issueTicket(secret: string, ticket: Ticket): Promise<string> {
  return new SignJWT({ ...ticket })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(TTL)
    .setAudience("claimtidy-directory-ticket")
    .sign(new TextEncoder().encode(secret));
}

export async function readTicket(secret: string, token: string): Promise<Ticket> {
  const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), {
    audience: "claimtidy-directory-ticket",
    algorithms: ["HS256"],
  });
  const { method, keys, email } = payload as unknown as Ticket;
  if (!["email", "google", "microsoft"].includes(method) || !Array.isArray(keys)) throw new Error("bad ticket");
  return email ? { method, keys, email } : { method, keys };
}
