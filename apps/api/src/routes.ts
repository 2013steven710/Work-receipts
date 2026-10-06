import { countryDefaults, DEFAULT_CATEGORIES } from "@claimtidy/core";
import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import type { Session } from "./auth.js";
import type { Config } from "./config.js";
import { audit, type Db, withTx } from "./db.js";
import type { Storage } from "./storage.js";

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

const IMAGE_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
};

interface Deps {
  config: Config;
  db: Db;
  storage: Storage;
  session: (request: FastifyRequest) => Promise<Session>;
}

export function registerRoutes(app: FastifyInstance, { config, db, storage, session }: Deps): void {
  const requireProfile = async (userId: string) => {
    const { rows } = await db.query("select owner_id from profiles where owner_id = $1", [userId]);
    if (rows.length === 0) throw new HttpError(409, "profile_required");
  };

  app.get("/v1/me", async (request) => {
    const { userId } = await session(request);
    const profile = await db.query(
      `select country, tax_pack, hosting_region, home_currency, date_format, time_zone, holiday_region, trial_started_at
       from profiles where owner_id = $1`,
      [userId],
    );
    const categories = await db.query(
      `select id, name, icon, colour, sort_order from categories
       where owner_id = $1 and archived_at is null order by sort_order, name`,
      [userId],
    );
    return { accountId: userId, region: config.REGION, profile: profile.rows[0] ?? null, categories: categories.rows };
  });

  // The country question's answer (concept section 0). Idempotent: a second call returns the profile.
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
    const defaults = countryDefaults(body.country, body.homeCurrency);
    if (defaults.hostingRegion !== config.REGION) throw new HttpError(409, "wrong_region");

    const created = await withTx(db, async (tx) => {
      const inserted = await tx.query(
        `insert into profiles (owner_id, country, tax_pack, hosting_region, home_currency, date_format, time_zone, holiday_region)
         values ($1, $2, $3, $4, $5, $6, $7, $8)
         on conflict (owner_id) do nothing
         returning owner_id`,
        [userId, body.country.toUpperCase(), defaults.taxPack, config.REGION, defaults.homeCurrency, defaults.dateFormat, body.timeZone, body.holidayRegion ?? null],
      );
      if (inserted.rowCount === 0) return false;
      for (const [i, c] of DEFAULT_CATEGORIES.entries()) {
        await tx.query(`insert into categories (owner_id, name, icon, colour, sort_order) values ($1, $2, $3, $4, $5)`, [
          userId, c.name, c.icon, c.colour, i,
        ]);
      }
      await audit(tx, `user:${userId}`, userId, "profile.created", "profile", userId, { country: body.country.toUpperCase() });
      return true;
    });
    return reply.code(created ? 201 : 200).send({ created });
  });

  // A short-lived URL to upload one new receipt image or PDF. The object name is random and the
  // URL can't overwrite anything.
  app.post("/v1/uploads", async (request) => {
    const { userId } = await session(request);
    await requireProfile(userId);
    const body = z.object({ contentType: z.enum(Object.keys(IMAGE_TYPES)), clientUuid: z.uuid() }).parse(request.body);
    const path = `${userId}/${body.clientUuid}/${randomUUID()}.${IMAGE_TYPES[body.contentType]}`;
    return storage.signUpload("receipts", path);
  });

  // Save a captured receipt. Safe to repeat: keyed on the device's client UUID (offline sync).
  app.post("/v1/entries", async (request, reply) => {
    const { userId } = await session(request);
    const body = z
      .object({
        clientUuid: z.uuid(),
        // The account the item was captured under; a mismatch means another account's queue.
        accountId: z.uuid(),
        kind: z.enum(["receipt", "note"]),
        cardType: z.enum(["personal", "company"]),
        categoryId: z.uuid().nullable(),
        imagePath: z.string().max(300).nullable(),
        description: z.string().max(500).optional(),
      })
      .parse(request.body);
    if (body.accountId !== userId) throw new HttpError(403, "account_mismatch");
    if (body.kind === "receipt" && !body.imagePath) throw new HttpError(400, "image_required");
    await requireProfile(userId);

    const result = await withTx(db, async (tx) => {
      const existing = await tx.query("select id from entries where owner_id = $1 and client_uuid = $2", [userId, body.clientUuid]);
      if (existing.rows[0]) return { id: existing.rows[0].id as string, created: false };

      if (body.imagePath) {
        const prefix = `${userId}/${body.clientUuid}/`;
        if (!body.imagePath.startsWith(prefix)) throw new HttpError(400, "bad_image_path");
        const object = await tx.query("select 1 from storage.objects where bucket_id = 'receipts' and name = $1", [body.imagePath]);
        if (object.rowCount === 0) throw new HttpError(400, "image_not_uploaded");
      }
      if (body.categoryId) {
        const category = await tx.query("select 1 from categories where id = $1 and owner_id = $2 and archived_at is null", [body.categoryId, userId]);
        if (category.rowCount === 0) throw new HttpError(400, "bad_category");
      }
      const inserted = await tx.query(
        `insert into entries (owner_id, client_uuid, kind, card_type, category_id, image_path, description)
         values ($1, $2, $3, $4, $5, $6, $7)
         on conflict (owner_id, client_uuid) do nothing
         returning id`,
        [userId, body.clientUuid, body.kind, body.cardType, body.categoryId, body.imagePath, body.description ?? null],
      );
      if (inserted.rows[0]) {
        await audit(tx, `user:${userId}`, userId, "entry.created", "entry", inserted.rows[0].id as string);
        return { id: inserted.rows[0].id as string, created: true };
      }
      // Lost a race with a concurrent retry of the same item.
      const again = await tx.query("select id from entries where owner_id = $1 and client_uuid = $2", [userId, body.clientUuid]);
      return { id: again.rows[0].id as string, created: false };
    });
    return reply.code(result.created ? 201 : 200).send(result);
  });

  // Edit after capture: category and card type, while the entry is still a draft.
  app.patch("/v1/entries/:id", async (request) => {
    const { userId } = await session(request);
    const { id } = z.object({ id: z.uuid() }).parse(request.params);
    const body = z
      .object({ categoryId: z.uuid().nullable().optional(), cardType: z.enum(["personal", "company"]).optional() })
      .parse(request.body);
    return withTx(db, async (tx) => {
      const entry = await editableEntry(tx, userId, id);
      if (body.categoryId) {
        const category = await tx.query("select 1 from categories where id = $1 and owner_id = $2 and archived_at is null", [body.categoryId, userId]);
        if (category.rowCount === 0) throw new HttpError(400, "bad_category");
      }
      await tx.query(
        `update entries set category_id = case when $3 then $4::uuid else category_id end,
                            card_type = coalesce($5, card_type)
         where id = $1 and owner_id = $2`,
        [entry.id, userId, body.categoryId !== undefined, body.categoryId ?? null, body.cardType ?? null],
      );
      await audit(tx, `user:${userId}`, userId, "entry.edited", "entry", entry.id, { fields: Object.keys(body) });
      return { id: entry.id };
    });
  });

  // Undo (or delete a draft): removes the entry and its image.
  app.delete("/v1/entries/:id", async (request, reply) => {
    const { userId } = await session(request);
    const { id } = z.object({ id: z.uuid() }).parse(request.params);
    const imagePath = await withTx(db, async (tx) => {
      const entry = await editableEntry(tx, userId, id);
      await tx.query("delete from entries where id = $1 and owner_id = $2", [entry.id, userId]);
      await audit(tx, `user:${userId}`, userId, "entry.deleted", "entry", entry.id);
      return entry.image_path;
    });
    if (imagePath) await storage.remove("receipts", [imagePath]);
    return reply.code(204).send();
  });
}

async function editableEntry(tx: Pick<import("./db.js").Tx, "query">, userId: string, id: string) {
  const { rows } = await tx.query<{ id: string; image_path: string | null; claim_status: string | null }>(
    `select e.id, e.image_path, c.status as claim_status
     from entries e left join claims c on c.id = e.claim_id
     where e.id = $1 and e.owner_id = $2 for update of e`,
    [id, userId],
  );
  const entry = rows[0];
  if (!entry) throw new HttpError(404, "not_found");
  if (entry.claim_status && entry.claim_status !== "draft") throw new HttpError(409, "entry_locked");
  return entry;
}
