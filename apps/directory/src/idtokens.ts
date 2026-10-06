import { createHash } from "node:crypto";
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

// Verifies Google and Microsoft ID tokens returned by the providers' web sign-in libraries
// (Google Identity Services, MSAL.js). The same token and raw nonce are then given to the
// regional Supabase signInWithIdToken.

export type Provider = "google" | "microsoft";

export interface VerifiedIdentity {
  provider: Provider;
  issuer: string;
  subject: string;
  /** Present only when the provider vouches that the address is verified. */
  verifiedEmail?: string;
}

const DEFAULT_JWKS: Record<Provider, string> = {
  google: "https://www.googleapis.com/oauth2/v3/certs",
  microsoft: "https://login.microsoftonline.com/common/discovery/v2.0/keys",
};

export class IdTokenVerifier {
  private readonly sets = new Map<Provider, ReturnType<typeof createRemoteJWKSet>>();

  constructor(
    private readonly clientIds: Partial<Record<Provider, string>>,
    private readonly jwksOverrides: Record<string, string> = {},
  ) {}

  async verify(provider: Provider, idToken: string, rawNonce: string): Promise<VerifiedIdentity> {
    const audience = this.clientIds[provider];
    if (!audience) throw new Error(`${provider} sign-in is not configured`);
    const { payload } = await jwtVerify(idToken, this.keySet(provider), { audience, clockTolerance: 60 });
    checkNonce(payload, rawNonce);
    const issuer = requireString(payload.iss, "iss");
    const subject = requireString(payload.sub, "sub");

    if (provider === "google") {
      if (issuer !== "https://accounts.google.com" && issuer !== "accounts.google.com") throw new Error("bad issuer");
      const email = typeof payload.email === "string" && payload.email_verified === true ? payload.email : undefined;
      return withEmail({ provider, issuer, subject }, email);
    }

    // Microsoft (personal and work accounts, "common" endpoint): the issuer names the tenant.
    const tid = requireString(payload.tid, "tid");
    if (issuer !== `https://login.microsoftonline.com/${tid}/v2.0`) throw new Error("bad issuer");
    // Microsoft's email claim is not verified unless the tenant owns the domain (xms_edov).
    const email = typeof payload.email === "string" && payload.xms_edov === true ? payload.email : undefined;
    return withEmail({ provider, issuer, subject }, email);
  }

  private keySet(provider: Provider) {
    let set = this.sets.get(provider);
    if (!set) {
      set = createRemoteJWKSet(new URL(this.jwksOverrides[provider] ?? DEFAULT_JWKS[provider]));
      this.sets.set(provider, set);
    }
    return set;
  }
}

export function hashNonce(rawNonce: string): string {
  return createHash("sha256").update(rawNonce).digest("hex");
}

function checkNonce(payload: JWTPayload, rawNonce: string): void {
  if (rawNonce.length < 16) throw new Error("nonce too short");
  // GIS is given sha256(raw nonce); Supabase checks the same hash against the raw nonce.
  if (payload.nonce !== hashNonce(rawNonce) && payload.nonce !== rawNonce) throw new Error("nonce mismatch");
}

function requireString(value: unknown, name: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`missing ${name}`);
  return value;
}

function withEmail(identity: VerifiedIdentity, email: string | undefined): VerifiedIdentity {
  return email ? { ...identity, verifiedEmail: email } : identity;
}
