import { countryDefaults, HOSTING_REGIONS, type HostingRegion } from "@claimtidy/core";
import Fastify, { type FastifyInstance, type FastifyReply } from "fastify";
import { z } from "zod";
import type { Config, RegionStack } from "./config.js";
import type { Db } from "./db.js";
import { lookup, mayCreate, reconcileSession, ReservationConflict, reserve } from "./directory.js";
import { consumeCode, createCode } from "./email-codes.js";
import { IdTokenVerifier } from "./idtokens.js";
import { emailKey, normaliseEmail, providerKey } from "./keys.js";
import type { Mailer } from "./mailer.js";
import { emailSignInToken, getUser } from "./regional.js";
import { issueTicket, readTicket, type Ticket } from "./tickets.js";
import { verifyWebhook } from "./webhooks.js";

declare module "fastify" {
  interface FastifyRequest {
    rawBody?: string;
  }
}

export interface Deps {
  config: Config;
  db: Db;
  mailer: Mailer;
  verifier?: IdTokenVerifier;
}

const Email = z.email().max(254);
const EMAIL_PROOF_METHODS = new Set(["otp", "magiclink", "email/signup"]);

export function buildApp({ config, db, mailer, verifier: givenVerifier }: Deps): FastifyInstance {
  const app = Fastify({ logger: process.env.NODE_ENV !== "test", bodyLimit: 64 * 1024 });
  const verifier =
    givenVerifier ??
    new IdTokenVerifier(
      { ...(config.GOOGLE_CLIENT_ID && { google: config.GOOGLE_CLIENT_ID }), ...(config.MICROSOFT_CLIENT_ID && { microsoft: config.MICROSOFT_CLIENT_ID }) },
      config.JWKS_OVERRIDES,
    );

  // Keep the exact body: hook signatures are computed over it.
  app.addContentTypeParser("application/json", { parseAs: "string" }, (request, body, done) => {
    request.rawBody = body as string;
    try {
      done(null, body === "" ? {} : JSON.parse(body as string));
    } catch (error) {
      done(error as Error, undefined);
    }
  });

  // The app's own origin only (hooks are server-to-server and send no Origin header).
  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    if (origin === undefined) return;
    if (origin !== config.APP_ORIGIN) return reply.code(403).send({ error: "origin_not_allowed" });
    reply.header("Access-Control-Allow-Origin", config.APP_ORIGIN);
    reply.header("Vary", "Origin");
    if (request.method === "OPTIONS") {
      reply.header("Access-Control-Allow-Methods", "POST, GET");
      reply.header("Access-Control-Allow-Headers", "content-type");
      return reply.code(204).send();
    }
  });

  const stackFor = (region: HostingRegion): RegionStack => {
    const stack = config.REGIONS[region];
    if (!stack) throw new Error(`region ${region} is not configured`);
    return stack;
  };
  const regionInfo = (region: HostingRegion) => {
    const stack = stackFor(region);
    return { region, supabaseUrl: stack.supabaseUrl, anonKey: stack.anonKey };
  };

  app.get("/health", async () => ({ ok: true }));

  // ---- Email sign-in -------------------------------------------------------------------------

  app.post("/v1/email/start", async (request, reply) => {
    const { email } = z.object({ email: Email }).parse(request.body);
    const code = await createCode(db, config.CODE_SECRET, emailKey(config.KEY_SECRET, email));
    if (code) {
      await mailer.send({
        to: normaliseEmail(email),
        subject: `Your ClaimTidy code: ${code}`,
        text: `Your ClaimTidy sign-in code is ${code}. It expires in 10 minutes.\n\nIf you didn't ask for it, ignore this email.`,
      });
    }
    // Same answer whether or not an account exists, or the hourly limit was hit.
    return reply.code(202).send({});
  });

  app.post("/v1/email/verify", async (request, reply) => {
    const { email, code } = z.object({ email: Email, code: z.string() }).parse(request.body);
    const key = emailKey(config.KEY_SECRET, email);
    if (!(await consumeCode(db, config.CODE_SECRET, key, code))) {
      return reply.code(400).send({ error: "invalid_code" });
    }
    const found = await lookup(db, [], [key]);
    if (found.status === "new") {
      return { status: "new", ticket: await issueTicket(config.TICKET_SECRET, { method: "email", keys: [key], email: normaliseEmail(email) }) };
    }
    const token = await emailSignInToken(stackFor(found.region), normaliseEmail(email));
    return { status: "existing", ...regionInfo(found.region), ...token };
  });

  // ---- Google / Microsoft sign-in ------------------------------------------------------------

  app.post("/v1/oauth/resolve", async (request, reply) => {
    const body = z
      .object({ provider: z.enum(["google", "microsoft"]), idToken: z.string().min(1), nonce: z.string().min(16) })
      .parse(request.body);
    let identity;
    try {
      identity = await verifier.verify(body.provider, body.idToken, body.nonce);
    } catch {
      return reply.code(401).send({ error: "invalid_id_token" });
    }
    const pKey = providerKey(config.KEY_SECRET, identity.issuer, identity.subject);
    const eKeys = identity.verifiedEmail ? [emailKey(config.KEY_SECRET, identity.verifiedEmail)] : [];
    const found = await lookup(db, [pKey], eKeys);
    if (found.status === "new") {
      return { status: "new", ticket: await issueTicket(config.TICKET_SECRET, { method: body.provider, keys: [pKey, ...eKeys] }) };
    }
    return { status: "existing", ...regionInfo(found.region) };
  });

  // ---- New account: reserve the identity for the country's hosting region ---------------------

  app.post("/v1/reserve", async (request, reply) => {
    const body = z
      .object({ ticket: z.string(), country: z.string().regex(/^[A-Za-z]{2}$/), homeCurrency: z.string().regex(/^[A-Z]{3}$/).optional() })
      .parse(request.body);
    let ticket: Ticket;
    try {
      ticket = await readTicket(config.TICKET_SECRET, body.ticket);
    } catch {
      return reply.code(401).send({ error: "invalid_ticket" });
    }
    let region = countryDefaults(body.country, body.homeCurrency).hostingRegion;
    try {
      stackFor(region);
      await reserve(db, ticket.keys, region);
    } catch (error) {
      // Lost a race with another sign-up for the same identity: use the region it already has.
      if (!(error instanceof ReservationConflict)) throw error;
      region = error.region;
    }
    const token = ticket.email ? await emailSignInToken(stackFor(region), ticket.email) : undefined;
    return { ...regionInfo(region), ...token };
  });

  // ---- Regional Auth hooks (BP-008, BP-010) ---------------------------------------------------

  const hookRegion = (request: { params: unknown; headers: Record<string, string | string[] | undefined>; rawBody?: string }, reply: FastifyReply) => {
    const { region } = z.object({ region: z.enum(HOSTING_REGIONS) }).parse(request.params);
    const stack = config.REGIONS[region];
    if (!stack || !verifyWebhook(stack.hookSecret, request.headers, request.rawBody ?? "")) {
      void reply.code(401).send({ error: { http_code: 401, message: "Invalid hook signature" } });
      return null;
    }
    return { region, stack };
  };
  const refuse = (reply: FastifyReply, message: string) =>
    reply.code(403).send({ error: { http_code: 403, message } });

  app.post("/hooks/:region/before-user-created", async (request, reply) => {
    const hook = hookRegion(request, reply);
    if (!hook) return reply;
    const user = z
      .object({
        email: z.string().optional(),
        app_metadata: z.object({ provider: z.string().optional() }).optional(),
        user_metadata: z.object({ iss: z.string().optional(), sub: z.string().optional() }).loose().optional(),
      })
      .loose()
      .parse((request.body as { user?: unknown }).user ?? {});
    const provider = user.app_metadata?.provider;
    let key: string | undefined;
    if (provider === "email" && user.email) key = emailKey(config.KEY_SECRET, user.email);
    else if (provider && provider !== "email" && user.user_metadata?.iss && user.user_metadata.sub) {
      key = providerKey(config.KEY_SECRET, user.user_metadata.iss, user.user_metadata.sub);
    }
    if (!key || !(await mayCreate(db, key, hook.region))) {
      return refuse(reply, "Please sign in through the ClaimTidy app.");
    }
    return reply.code(200).send({});
  });

  app.post("/hooks/:region/custom-access-token", async (request, reply) => {
    const hook = hookRegion(request, reply);
    if (!hook) return reply;
    const payload = z
      .object({ user_id: z.uuid(), claims: z.record(z.string(), z.unknown()), authentication_method: z.string().optional() })
      .loose()
      .parse(request.body);
    // ClaimTidy has no passwords; a password session would mean the account was made outside the app.
    if (payload.authentication_method === "password") return refuse(reply, "Password sign-in is not available.");
    const user = await getUser(hook.stack, payload.user_id);
    const keys = new Set<string>();
    if (user.email && user.email_confirmed_at) keys.add(emailKey(config.KEY_SECRET, user.email));
    // The first session of a new email account is issued while its confirmation is still being
    // saved, so the admin API doesn't show it as confirmed yet. Redeeming an emailed one-time token
    // is itself the proof of ownership.
    const email = typeof payload.claims.email === "string" ? payload.claims.email : undefined;
    if (email && EMAIL_PROOF_METHODS.has(payload.authentication_method ?? "")) keys.add(emailKey(config.KEY_SECRET, email));
    for (const identity of user.identities ?? []) {
      const data = identity.identity_data ?? {};
      if (identity.provider === "email") {
        if (data.email && data.email_verified) keys.add(emailKey(config.KEY_SECRET, data.email));
        continue;
      }
      if (!data.iss || !data.sub) return refuse(reply, "Unrecognised sign-in identity.");
      keys.add(providerKey(config.KEY_SECRET, data.iss, data.sub));
      if (data.email && data.email_verified) keys.add(emailKey(config.KEY_SECRET, data.email));
    }
    if (keys.size === 0) return refuse(reply, "No verified sign-in identity.");
    const check = await reconcileSession(db, hook.region, user.id, [...keys]);
    if (!check.ok) return refuse(reply, "This sign-in belongs to another ClaimTidy account.");
    return { claims: { ...payload.claims, hosting_region: hook.region } };
  });

  if (config.DEV_OUTBOX && mailer.outbox) {
    const outbox = mailer.outbox;
    app.get("/dev/outbox", async (request) => {
      const { to } = z.object({ to: z.string() }).parse(request.query);
      return outbox.filter((m) => m.to === normaliseEmail(to));
    });
  }

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof z.ZodError) return reply.code(400).send({ error: "invalid_request" });
    app.log.error(error);
    return reply.code(500).send({ error: "internal" });
  });

  return app;
}
