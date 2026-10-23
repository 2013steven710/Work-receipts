import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Session } from "./auth.js";
import type { Config } from "./config.js";
import { HttpError } from "./routes.js";

// Token exchange for the user's own Google Drive / OneDrive (v13). The phone keeps the refresh
// token; this server only adds the app's client secret when talking to Google or Microsoft, and
// stores nothing. Request and response bodies are never logged.

const SCOPES = {
  google: "https://www.googleapis.com/auth/drive.file",
  microsoft: "offline_access Files.ReadWrite.AppFolder",
} as const;

type Provider = keyof typeof SCOPES;

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  error?: string;
}

export function registerCloudRoutes(
  app: FastifyInstance,
  config: Config,
  session: (request: FastifyRequest) => Promise<Session>,
  doFetch: typeof fetch = fetch,
): void {
  const client = (provider: Provider) => {
    const id = provider === "google" ? config.GOOGLE_CLIENT_ID : config.MICROSOFT_CLIENT_ID;
    const secret = provider === "google" ? config.GOOGLE_CLIENT_SECRET : config.MICROSOFT_CLIENT_SECRET;
    const url = provider === "google" ? config.GOOGLE_TOKEN_URL : config.MICROSOFT_TOKEN_URL;
    if (!id || !secret) throw new HttpError(404, "cloud_not_configured");
    return { id, secret, url };
  };

  const callProvider = async (provider: Provider, form: Record<string, string>) => {
    const { id, secret, url } = client(provider);
    const body = new URLSearchParams({ ...form, client_id: id, client_secret: secret });
    if (provider === "microsoft") body.set("scope", SCOPES.microsoft);
    const res = await doFetch(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    const json = (await res.json().catch(() => ({}))) as TokenResponse;
    if (!res.ok || !json.access_token) {
      // invalid_grant: the user revoked access or the token expired, so they reconnect.
      throw new HttpError(json.error === "invalid_grant" ? 400 : 502, json.error === "invalid_grant" ? "cloud_reauth" : "cloud_unavailable");
    }
    return { accessToken: json.access_token, expiresIn: json.expires_in ?? 3600, ...(json.refresh_token && { refreshToken: json.refresh_token }) };
  };

  const Params = z.object({ provider: z.enum(["google", "microsoft"]) });

  app.get("/v1/cloud/providers", async () => ({
    google: Boolean(config.GOOGLE_CLIENT_ID && config.GOOGLE_CLIENT_SECRET),
    microsoft: Boolean(config.MICROSOFT_CLIENT_ID && config.MICROSOFT_CLIENT_SECRET),
  }));

  app.post("/v1/cloud/:provider/exchange", async (request) => {
    await session(request);
    const { provider } = Params.parse(request.params);
    const body = z
      .object({ code: z.string().min(1).max(4096), codeVerifier: z.string().min(43).max(128), redirectUri: z.url() })
      .parse(request.body);
    // Codes may only be redeemed for the app's own callback.
    if (new URL(body.redirectUri).origin !== config.APP_ORIGIN) throw new HttpError(400, "bad_redirect");
    return callProvider(provider, {
      grant_type: "authorization_code",
      code: body.code,
      code_verifier: body.codeVerifier,
      redirect_uri: body.redirectUri,
    });
  });

  app.post("/v1/cloud/:provider/refresh", async (request) => {
    await session(request);
    const { provider } = Params.parse(request.params);
    const body = z.object({ refreshToken: z.string().min(1).max(4096) }).parse(request.body);
    return callProvider(provider, { grant_type: "refresh_token", refresh_token: body.refreshToken });
  });
}
