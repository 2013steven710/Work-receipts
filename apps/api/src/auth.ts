import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify, type JWTPayload } from "jose";
import type { Config } from "./config.js";

export interface Session {
  userId: string;
  email: string | undefined;
}

export class AuthError extends Error {}

/**
 * Verifies a regional Supabase access token, including the region the directory stamped on it.
 * Asymmetric tokens (ES256/RS256) are checked against the region's published key set; legacy HS256
 * tokens, which self-hosted Supabase can still issue, against the shared secret when one is set.
 */
export function createAuthenticator(config: Config) {
  const jwks = createRemoteJWKSet(new URL(`${config.SUPABASE_URL}/auth/v1/.well-known/jwks.json`));
  const secret = config.SUPABASE_JWT_SECRET ? new TextEncoder().encode(config.SUPABASE_JWT_SECRET) : null;
  const options = { issuer: config.SUPABASE_JWT_ISSUER ?? `${config.SUPABASE_URL}/auth/v1`, audience: "authenticated" };

  return async (authorization: string | undefined): Promise<Session> => {
    const token = authorization?.match(/^Bearer (.+)$/)?.[1];
    if (!token) throw new AuthError("missing token");
    try {
      const { alg } = decodeProtectedHeader(token);
      let payload: JWTPayload;
      if (alg === "HS256") {
        if (!secret) throw new AuthError("symmetric tokens not accepted");
        ({ payload } = await jwtVerify(token, secret, { ...options, algorithms: ["HS256"] }));
      } else {
        ({ payload } = await jwtVerify(token, jwks, { ...options, algorithms: ["ES256", "RS256"] }));
      }
      if (payload.role !== "authenticated" || typeof payload.sub !== "string") throw new AuthError("bad role");
      if (payload.hosting_region !== config.REGION) throw new AuthError("wrong region");
      return { userId: payload.sub, email: typeof payload.email === "string" ? payload.email : undefined };
    } catch (error) {
      throw error instanceof AuthError ? error : new AuthError("invalid token");
    }
  };
}
