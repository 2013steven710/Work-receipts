import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";

// Which regional stack this device's account lives in. Personal data never leaves that region.

export interface RegionInfo {
  region: string;
  supabaseUrl: string;
  anonKey: string;
}

const REGION_KEY = "claimtidy.region";
const clients = new Map<string, SupabaseClient>();

export function getRegionInfo(): RegionInfo | null {
  try {
    const raw = localStorage.getItem(REGION_KEY);
    return raw ? (JSON.parse(raw) as RegionInfo) : null;
  } catch {
    return null;
  }
}

export function setRegionInfo(info: RegionInfo): void {
  localStorage.setItem(REGION_KEY, JSON.stringify({ region: info.region, supabaseUrl: info.supabaseUrl, anonKey: info.anonKey }));
}

export function clearRegionInfo(): void {
  localStorage.removeItem(REGION_KEY);
}

export function regionalClient(info: RegionInfo): SupabaseClient {
  let client = clients.get(info.region);
  if (!client) {
    client = createClient(info.supabaseUrl, info.anonKey, {
      auth: { storageKey: `claimtidy-auth-${info.region}`, persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
    });
    clients.set(info.region, client);
  }
  return client;
}

export function apiUrl(region: string): string {
  const url = env.apiUrls[region];
  if (!url) throw new Error(`No API configured for region ${region}`);
  return url;
}

export async function directory<T>(path: string, body: unknown): Promise<{ status: number; json: T }> {
  const res = await fetch(`${env.directoryUrl}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: res.status, json: (await res.json().catch(() => ({}))) as T };
}

export class ApiError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
  }
}

export async function api<T>(client: SupabaseClient, region: string, path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const { data } = await client.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new ApiError(401, "unauthorized");
  const res = await fetch(`${apiUrl(region)}${path}`, {
    method: init.method ?? "GET",
    headers: { authorization: `Bearer ${token}`, ...(init.body !== undefined && { "content-type": "application/json" }) },
    ...(init.body !== undefined && { body: JSON.stringify(init.body) }),
  });
  if (res.status === 204) return undefined as T;
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new ApiError(res.status, json.error ?? "error");
  return json;
}
