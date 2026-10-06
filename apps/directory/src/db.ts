import type { HostingRegion } from "@claimtidy/core";
import pg from "pg";

export type Db = pg.Pool;

export function createDb(url: string): Db {
  return new pg.Pool({ connectionString: url, max: 10 });
}

export const PENDING_TTL_HOURS = 24;

export async function migrate(db: Db): Promise<void> {
  await db.query(`
    create table if not exists directory_keys (
      key text primary key,
      region text not null check (region in ('au', 'us', 'uk')),
      account_id uuid,
      status text not null check (status in ('pending', 'active')),
      created_at timestamptz not null default now(),
      expires_at timestamptz,
      check ((status = 'active') = (account_id is not null)),
      check ((status = 'pending') = (expires_at is not null))
    );
    create index if not exists directory_keys_account on directory_keys (account_id);

    create table if not exists email_codes (
      email_key text primary key,
      verifier text not null,
      expires_at timestamptz not null,
      attempts integer not null default 0,
      window_start timestamptz not null default now(),
      sends_in_window integer not null default 1
    );

    create table if not exists directory_conflicts (
      id bigserial primary key,
      at timestamptz not null default now(),
      region text not null,
      account_id uuid not null,
      key text not null,
      existing_region text not null,
      existing_account_id uuid
    );
  `);
}

export interface KeyRow {
  key: string;
  region: HostingRegion;
  account_id: string | null;
  status: "pending" | "active";
  expires_at: Date | null;
}

/** Rows that still mean something: active ones, and pending ones that haven't expired. */
export async function liveRows(db: Pick<pg.PoolClient, "query">, keys: readonly string[]): Promise<KeyRow[]> {
  if (keys.length === 0) return [];
  const { rows } = await db.query<KeyRow>(
    `select key, region, account_id, status, expires_at from directory_keys
     where key = any($1) and (status = 'active' or expires_at > now())`,
    [keys],
  );
  return rows;
}

export async function withTx<T>(db: Db, fn: (client: pg.PoolClient) => Promise<T>): Promise<T> {
  const client = await db.connect();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    client.release();
  }
}
