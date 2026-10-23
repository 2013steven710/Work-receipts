import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

// v13: one server for everyone, so one Supabase client.

let client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  client ??= createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { storageKey: "claimtidy-auth", persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
  return client;
}

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
  }
}

export async function accessToken(): Promise<string | null> {
  return (await supabase().auth.getSession()).data.session?.access_token ?? null;
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const token = await accessToken();
  if (!token) throw new ApiError(401, "unauthorized");
  const res = await fetch(`${env.apiUrl}${path}`, {
    method: init.method ?? "GET",
    headers: { authorization: `Bearer ${token}`, ...(init.body !== undefined && { "content-type": "application/json" }) },
    ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
  });
  if (res.status === 204) return undefined as T;
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new ApiError(res.status, json.error ?? "error");
  return json;
}
