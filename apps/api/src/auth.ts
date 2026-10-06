import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Config } from "./config.js";

export interface Session {
  userId: string;
  email: string | undefined;
}

export class AuthError extends Error {}

/** Verifies a regional Supabase access token, including the region the directory stamped on it. */
export function createAuthenticator(config: Config) {
  const jwks = createRemoteJWKSet(new URL(`${config.SUPABASE_URL}/auth/v1/.well-known/jwks.json`));
  const issuer = `${config.SUPABASE_URL}/auth/v1`;
  return async (authorization: string | undefined): Promise<Session> => {
    const token = authorization?.match(/^Bearer (.+)$/)?.[1];
    if (!token) throw new AuthError("missing token");
    try {
      const { payload } = await jwtVerify(token, jwks, { issuer, audience: "authenticated" });
      if (payload.role !== "authenticated" || typeof payload.sub !== "string") throw new AuthError("bad role");
      if (payload.hosting_region !== config.REGION) throw new AuthError("wrong region");
      return { userId: payload.sub, email: typeof payload.email === "string" ? payload.email : undefined };
    } catch (error) {
      throw error instanceof AuthError ? error : new AuthError("invalid token");
    }
  };
}
