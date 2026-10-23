import { env } from "../env";
import { api, ApiError } from "../session";
import type { CloudLink } from "../store";
import { CloudAuthError, type CloudDrive, type CloudKind } from "./drive";
import { googleDrive } from "./google";
import { oneDrive } from "./microsoft";

// Linking the user's own Google Drive or OneDrive. A standard sign-in with PKCE: the provider
// sends the user back to /cloud/callback with a code, and the ClaimTidy API redeems it with the
// app's secret. The phone keeps the refresh token; ClaimTidy's server keeps nothing.

const PENDING_KEY = "claimtidy.cloudLink";

interface Pending {
  kind: CloudKind;
  state: string;
  verifier: string;
  accountId: string;
}

export function cloudAvailable(kind: CloudKind): boolean {
  return Boolean(kind === "google" ? env.google.clientId : env.microsoft.clientId);
}

function base64url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const redirectUri = () => `${location.origin}/cloud/callback`;

export async function startLink(kind: CloudKind, accountId: string): Promise<void> {
  const verifier = base64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier))));
  const state = base64url(crypto.getRandomValues(new Uint8Array(24)));
  sessionStorage.setItem(PENDING_KEY, JSON.stringify({ kind, state, verifier, accountId } satisfies Pending));
  const params = new URLSearchParams({
    client_id: kind === "google" ? env.google.clientId : env.microsoft.clientId,
    redirect_uri: redirectUri(),
    response_type: "code",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  });
  if (kind === "google") {
    params.set("scope", "https://www.googleapis.com/auth/drive.file");
    params.set("access_type", "offline");
    params.set("prompt", "consent");
  } else {
    params.set("scope", "offline_access Files.ReadWrite.AppFolder");
    params.set("response_mode", "query");
    params.set("prompt", "select_account");
  }
  location.assign(`${kind === "google" ? env.google.authUrl : env.microsoft.authUrl}?${params}`);
}

/** On /cloud/callback: redeem the code for the account that started the link. */
export async function finishLink(search: URLSearchParams, accountId: string): Promise<CloudLink> {
  const raw = sessionStorage.getItem(PENDING_KEY);
  sessionStorage.removeItem(PENDING_KEY);
  const pending = raw ? (JSON.parse(raw) as Pending) : null;
  const code = search.get("code");
  if (!pending || !code || search.get("state") !== pending.state) throw new Error("This link attempt expired. Please try again.");
  if (pending.accountId !== accountId) throw new Error("You signed in as someone else meanwhile. Please try again.");
  const tokens = await api<{ accessToken: string; expiresIn: number; refreshToken?: string }>(`/v1/cloud/${pending.kind}/exchange`, {
    method: "POST",
    body: { code, codeVerifier: pending.verifier, redirectUri: redirectUri() },
  });
  if (!tokens.refreshToken) throw new Error("The provider didn't allow offline access. Please try again.");
  return {
    kind: pending.kind,
    refreshToken: tokens.refreshToken,
    accessToken: tokens.accessToken,
    expiresAt: Date.now() + tokens.expiresIn * 1000,
  };
}

/**
 * A drive client for a link. Access tokens are refreshed through the API when they're about to
 * expire; `save` persists the updated link. A revoked link raises CloudAuthError (reconnect).
 */
export function driveFor(link: CloudLink, save: (link: CloudLink) => Promise<void>): CloudDrive {
  let current = link;
  const getToken = async (): Promise<string> => {
    if (current.accessToken && current.expiresAt && current.expiresAt - Date.now() > 60_000) return current.accessToken;
    try {
      const tokens = await api<{ accessToken: string; expiresIn: number; refreshToken?: string }>(`/v1/cloud/${current.kind}/refresh`, {
        method: "POST",
        body: { refreshToken: current.refreshToken },
      });
      current = {
        ...current,
        accessToken: tokens.accessToken,
        expiresAt: Date.now() + tokens.expiresIn * 1000,
        ...(tokens.refreshToken && { refreshToken: tokens.refreshToken }),
      };
      await save(current);
      return current.accessToken!;
    } catch (error) {
      if (error instanceof ApiError && (error.code === "cloud_reauth" || error.code === "cloud_not_configured")) throw new CloudAuthError();
      throw error;
    }
  };
  return link.kind === "google" ? googleDrive(env.google.apiBase, getToken) : oneDrive(env.microsoft.apiBase, getToken);
}
