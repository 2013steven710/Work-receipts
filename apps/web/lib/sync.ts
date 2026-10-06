import { Queue } from "./queue.js";

// Uploads queued captures for exactly one account. Used by the page and by the service worker.

export interface SyncTarget {
  accountId: string;
  region: string;
  apiUrl: string;
  supabaseUrl: string;
  accessToken: () => Promise<string | null>;
  signal?: AbortSignal;
  onSynced?: (clientUuid: string, entryId: string) => void;
}

export interface SyncResult {
  synced: number;
  remaining: number;
  stoppedBecause?: "offline" | "unauthorized" | "server" | "aborted" | "read_only";
}

/** Errors a retry can't fix; the item stays on the phone, marked for the user's attention. */
const PERMANENT = new Set(["bad_category", "bad_image_path", "image_required", "invalid_request", "account_mismatch"]);

export async function syncQueue(target: SyncTarget, doFetch: typeof fetch = fetch): Promise<SyncResult> {
  const run = async (): Promise<SyncResult> => {
    const queue = await Queue.open(target.accountId, target.region);
    let synced = 0;
    try {
      for (const item of await queue.list()) {
        if (target.signal?.aborted) return { synced, remaining: await queue.count(), stoppedBecause: "aborted" };
        // Defence in depth: the database is per account already.
        if (item.accountId !== target.accountId || item.region !== target.region || item.error) continue;
        const token = await target.accessToken();
        if (!token) return { synced, remaining: await queue.count(), stoppedBecause: "unauthorized" };
        const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
        const init = (body: unknown): RequestInit => ({
          method: "POST",
          headers,
          body: JSON.stringify(body),
          ...(target.signal && { signal: target.signal }),
        });

        try {
          if (!item.imagePath) {
            const signRes = await doFetch(`${target.apiUrl}/v1/uploads`, init({ contentType: item.contentType, clientUuid: item.clientUuid }));
            const signStop = await stopReason(signRes);
            if (signStop) return { synced, remaining: await queue.count(), stoppedBecause: signStop };
            const signed = (await signRes.json()) as { path: string; token: string };
            const put = await doFetch(
              `${target.supabaseUrl}/storage/v1/object/upload/sign/receipts/${signed.path}?token=${encodeURIComponent(signed.token)}`,
              {
                method: "PUT",
                headers: { "content-type": item.contentType, "x-upsert": "false" },
                body: new Blob([item.data], { type: item.contentType }),
                ...(target.signal && { signal: target.signal }),
              },
            );
            if (!put.ok) return { synced, remaining: await queue.count(), stoppedBecause: "server" };
            item.imagePath = signed.path;
            await queue.put(item);
          }

          const res = await doFetch(
            `${target.apiUrl}/v1/entries`,
            init({
              clientUuid: item.clientUuid,
              accountId: item.accountId,
              kind: item.kind,
              cardType: item.cardType,
              categoryId: item.categoryId,
              imagePath: item.imagePath,
            }),
          );
          if (res.ok) {
            const { id } = (await res.json()) as { id: string };
            await queue.remove(item.clientUuid);
            synced++;
            target.onSynced?.(item.clientUuid, id);
            continue;
          }
          const code = ((await res.json().catch(() => ({}))) as { error?: string }).error ?? "";
          if (PERMANENT.has(code)) {
            item.error = code;
            await queue.put(item);
            continue;
          }
          const stop = await stopReason(res);
          return { synced, remaining: await queue.count(), stoppedBecause: stop ?? "server" };
        } catch (error) {
          const aborted = target.signal?.aborted || (error as Error).name === "AbortError";
          return { synced, remaining: await queue.count(), stoppedBecause: aborted ? "aborted" : "offline" };
        }
      }
      return { synced, remaining: await queue.count() };
    } finally {
      queue.close();
    }
  };

  // One sync at a time per account, across the page and the service worker.
  const locks = (globalThis as { navigator?: { locks?: LockManager } }).navigator?.locks;
  if (locks) return locks.request(`claimtidy-sync-${target.accountId}-${target.region}`, run);
  return run();
}

async function stopReason(res: Response): Promise<SyncResult["stoppedBecause"] | null> {
  if (res.ok) return null;
  if (res.status === 401) return "unauthorized";
  if (res.status === 402) return "read_only";
  return "server";
}
