import { countryDefaults } from "@claimtidy/core";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Session } from "./auth.js";
import { audit, type Db, withTx } from "./db.js";

// v13: the server keeps the account and the subscription only. Receipts, categories and claims
// live on the user's phone and in their own Google Drive or OneDrive.

export class HttpError extends Error {
  constructor(readonly status: number, readonly code: string) {
    super(code);
  }
}

const TimeZone = z.string().refine((tz) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}, "unknown time zone");

interface Deps {
  db: Db;
  session: (request: FastifyRequest) => Promise<Session>;
}

export function registerRoutes(app: FastifyInstance, { db, session }: Deps): void {
  app.get("/v1/me", async (request) => {
    const { userId } = await session(request);
    const profile = await db.query(
      `select country, tax_pack, home_currency, date_format, time_zone, holiday_region, trial_started_at
       from profiles where owner_id = $1`,
      [userId],
    );
    const subscription = await db.query("select status, current_period_end from subscriptions where owner_id = $1", [userId]);
    return { accountId: userId, profile: profile.rows[0] ?? null, subscription: subscription.rows[0] ?? null };
  });

  // The country question's answer (concept section 0). Idempotent: a second call keeps the first.
  app.post("/v1/profile", async (request, reply) => {
    const { userId } = await session(request);
    const body = z
      .object({
        country: z.string().regex(/^[A-Za-z]{2}$/),
        homeCurrency: z.string().regex(/^[A-Z]{3}$/).optional(),
        timeZone: TimeZone,
        holidayRegion: z.string().max(10).optional(),
      })
      .parse(request.body);
    let defaults;
    try {
      defaults = countryDefaults(body.country, body.homeCurrency);
    } catch {
      throw new HttpError(400, "currency_required");
    }
    const created = await withTx(db, async (tx) => {
      const inserted = await tx.query(
        `insert into profiles (owner_id, country, tax_pack, home_currency, date_format, time_zone, holiday_region)
         values ($1, $2, $3, $4, $5, $6, $7)
         on conflict (owner_id) do nothing
         returning owner_id`,
        [userId, body.country.toUpperCase(), defaults.taxPack, defaults.homeCurrency, defaults.dateFormat, body.timeZone, body.holidayRegion ?? null],
      );
      if (inserted.rowCount === 0) return false;
      await audit(tx, `user:${userId}`, userId, "profile.created", "profile", userId, { country: body.country.toUpperCase() });
      return true;
    });
    return reply.code(created ? 201 : 200).send({ created });
  });
}
