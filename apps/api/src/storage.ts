import type { Config } from "./config.js";

// Storage calls with the service key. Clients never write to storage directly: they get a
// short-lived signed upload URL for a new random object name, which cannot overwrite anything.

export interface SignedUpload {
  bucket: string;
  path: string;
  token: string;
}

export function createStorage(config: Config) {
  const headers = {
    apikey: config.SUPABASE_SERVICE_KEY,
    authorization: `Bearer ${config.SUPABASE_SERVICE_KEY}`,
    "content-type": "application/json",
  };
  return {
    async signUpload(bucket: string, path: string): Promise<SignedUpload> {
      const res = await fetch(`${config.SUPABASE_URL}/storage/v1/object/upload/sign/${bucket}/${path}`, {
        method: "POST",
        headers,
        body: "{}",
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`sign upload failed: ${res.status}`);
      const { url } = (await res.json()) as { url: string };
      const token = new URL(url, config.SUPABASE_URL).searchParams.get("token");
      if (!token) throw new Error("sign upload returned no token");
      return { bucket, path, token };
    },
    async remove(bucket: string, paths: string[]): Promise<void> {
      if (paths.length === 0) return;
      const res = await fetch(`${config.SUPABASE_URL}/storage/v1/object/${bucket}`, {
        method: "DELETE",
        headers,
        body: JSON.stringify({ prefixes: paths }),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) throw new Error(`remove failed: ${res.status}`);
    },
  };
}

export type Storage = ReturnType<typeof createStorage>;
