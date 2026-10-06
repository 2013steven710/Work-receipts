import type { HostingRegion } from "@claimtidy/core";
import { type Db, type KeyRow, liveRows, PENDING_TTL_HOURS, withTx } from "./db.js";

// Routing rules (build plan section 4):
//  * A provider identity's stable key wins; a verified email alias routes to the account that owns it
//    (matching Supabase's own verified-email auto-linking).
//  * New identities are reserved for one region before the regional account exists.
//  * Every session re-checks the account's identities; anything registered elsewhere fails closed.

export type Lookup =
  | { status: "existing"; region: HostingRegion }
  | { status: "pending"; region: HostingRegion }
  | { status: "new" };

export async function lookup(db: Db, providerKeys: readonly string[], emailKeys: readonly string[]): Promise<Lookup> {
  const rows = await liveRows(db, [...providerKeys, ...emailKeys]);
  const pick = (pred: (r: KeyRow) => boolean) => rows.find(pred);
  const hit =
    pick((r) => r.status === "active" && r.key.startsWith("p:")) ??
    pick((r) => r.status === "active" && r.key.startsWith("e:")) ??
    pick((r) => r.status === "pending");
  if (!hit) return { status: "new" };
  return { status: hit.status === "active" ? "existing" : "pending", region: hit.region };
}

export class ReservationConflict extends Error {
  constructor(readonly region: HostingRegion) {
    super(`identity already belongs to region ${region}`);
  }
}

/**
 * Reserve identity keys for a new account in `region`. Idempotent for the same region; refuses if
 * any key is active, or pending for a different region (the caller then routes to that region).
 */
export async function reserve(db: Db, keys: readonly string[], region: HostingRegion): Promise<void> {
  await withTx(db, async (tx) => {
    const rows = await liveRows(tx, keys);
    const clash = rows.find((r) => r.status === "active" || r.region !== region);
    if (clash) throw new ReservationConflict(clash.region);
    for (const key of keys) {
      await tx.query(
        `insert into directory_keys (key, region, status, expires_at)
         values ($1, $2, 'pending', now() + make_interval(hours => $3))
         on conflict (key) do update
           set region = excluded.region, expires_at = excluded.expires_at, created_at = now()
           where directory_keys.status = 'pending'`,
        [key, region, PENDING_TTL_HOURS],
      );
    }
  });
}

/** "Before user created" hook: allow creation only when this identity is reserved for this region. */
export async function mayCreate(db: Db, key: string, region: HostingRegion): Promise<boolean> {
  const [row] = await liveRows(db, [key]);
  return row !== undefined && row.status === "pending" && row.region === region;
}

export type SessionCheck = { ok: true } | { ok: false; key: string; existingRegion: HostingRegion };

/**
 * "Custom access token" hook: make the directory agree with this account's identities.
 * Unregistered (or expired-pending) keys are registered to this account; pending keys reserved for
 * this region are claimed; a key owned by another account or region refuses the session.
 */
export async function reconcileSession(
  db: Db,
  region: HostingRegion,
  accountId: string,
  keys: readonly string[],
): Promise<SessionCheck> {
  return withTx(db, async (tx) => {
    await tx.query("select key from directory_keys where key = any($1) for update", [keys]);
    const rows = new Map((await liveRows(tx, keys)).map((r) => [r.key, r]));
    for (const key of keys) {
      const row = rows.get(key);
      const ours = row && row.region === region && (row.account_id === accountId || row.status === "pending");
      if (row && !ours) {
        await tx.query(
          `insert into directory_conflicts (region, account_id, key, existing_region, existing_account_id)
           values ($1, $2, $3, $4, $5)`,
          [region, accountId, key, row.region, row.account_id],
        );
        // Returning (not throwing) commits the conflict record for the owner console.
        return { ok: false, key, existingRegion: row.region };
      }
    }
    for (const key of keys) {
      await tx.query(
        `insert into directory_keys (key, region, account_id, status, expires_at)
         values ($1, $2, $3, 'active', null)
         on conflict (key) do update
           set region = excluded.region, account_id = excluded.account_id, status = 'active', expires_at = null`,
        [key, region, accountId],
      );
    }
    return { ok: true };
  });
}
