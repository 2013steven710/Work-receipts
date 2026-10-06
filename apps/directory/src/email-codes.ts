import { randomInt, timingSafeEqual } from "node:crypto";
import { type Db, withTx } from "./db.js";
import { hmac } from "./keys.js";

// One-time email codes: 6 digits, 10 minutes, 5 attempts. Only a keyed verifier is stored, and a
// new code replaces the old one. At most 5 codes per address per hour.

const CODE_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const MAX_SENDS_PER_HOUR = 5;

export async function createCode(db: Db, codeSecret: string, emailKey: string): Promise<string | null> {
  const code = randomInt(0, 1_000_000).toString().padStart(6, "0");
  const verifier = hmac(codeSecret, `${emailKey}:${code}`);
  const { rows } = await db.query<{ sends_in_window: number }>(
    `insert into email_codes (email_key, verifier, expires_at)
     values ($1, $2, now() + make_interval(mins => $3))
     on conflict (email_key) do update set
       verifier = excluded.verifier,
       expires_at = excluded.expires_at,
       attempts = 0,
       window_start = case when email_codes.window_start < now() - interval '1 hour' then now() else email_codes.window_start end,
       sends_in_window = case when email_codes.window_start < now() - interval '1 hour' then 1 else email_codes.sends_in_window + 1 end
     returning sends_in_window`,
    [emailKey, verifier, CODE_MINUTES],
  );
  return (rows[0]?.sends_in_window ?? 0) > MAX_SENDS_PER_HOUR ? null : code;
}

export async function consumeCode(db: Db, codeSecret: string, emailKey: string, code: string): Promise<boolean> {
  if (!/^\d{6}$/.test(code)) return false;
  return withTx(db, async (tx) => {
    const { rows } = await tx.query<{ verifier: string; attempts: number; expired: boolean }>(
      `select verifier, attempts, expires_at < now() as expired from email_codes where email_key = $1 for update`,
      [emailKey],
    );
    const row = rows[0];
    if (!row || row.expired || row.attempts >= MAX_ATTEMPTS) return false;
    const given = Buffer.from(hmac(codeSecret, `${emailKey}:${code}`));
    if (given.length === row.verifier.length && timingSafeEqual(given, Buffer.from(row.verifier))) {
      await tx.query("delete from email_codes where email_key = $1", [emailKey]);
      return true;
    }
    await tx.query("update email_codes set attempts = attempts + 1 where email_key = $1", [emailKey]);
    return false;
  });
}
