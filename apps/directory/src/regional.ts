import type { RegionStack } from "./config.js";

// Calls a regional Supabase Auth admin API with that region's service key (server-side only).

export interface AdminIdentity {
  provider: string;
  identity_data?: { email?: string; email_verified?: boolean; iss?: string; sub?: string };
}

export interface AdminUser {
  id: string;
  email?: string;
  email_confirmed_at?: string | null;
  identities?: AdminIdentity[];
}

async function admin<T>(stack: RegionStack, path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(`${stack.supabaseUrl}/auth/v1/admin${path}`, {
    ...init,
    headers: {
      apikey: stack.serviceKey,
      authorization: `Bearer ${stack.serviceKey}`,
      "content-type": "application/json",
    },
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`regional admin ${path} failed: ${res.status}`);
  return (await res.json()) as T;
}

export function getUser(stack: RegionStack, id: string): Promise<AdminUser> {
  return admin<AdminUser>(stack, `/users/${encodeURIComponent(id)}`);
}

/**
 * Issues a one-time sign-in token for a verified email. The app redeems it with
 * supabase.auth.verifyOtp({ type: tokenType, token_hash: tokenHash }). Creates the user if needed,
 * which runs the region's "before user created" hook against the reservation; a new user's token is
 * of type "signup", an existing user's "magiclink".
 */
export interface EmailSignInToken {
  tokenHash: string;
  tokenType: "magiclink" | "signup";
}

export async function emailSignInToken(stack: RegionStack, email: string): Promise<EmailSignInToken> {
  const link = await admin<{ hashed_token?: string; verification_type?: string }>(stack, "/generate_link", {
    method: "POST",
    body: JSON.stringify({ type: "magiclink", email }),
  });
  const type = link.verification_type;
  if (!link.hashed_token || (type !== "magiclink" && type !== "signup")) throw new Error("regional admin returned no token");
  return { tokenHash: link.hashed_token, tokenType: type };
}
