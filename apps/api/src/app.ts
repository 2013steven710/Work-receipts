import Fastify, { type FastifyInstance } from "fastify";
import { z } from "zod";
import { AuthError, createAuthenticator, type Session } from "./auth.js";
import type { Config } from "./config.js";
import type { Db } from "./db.js";
import { HttpError, registerRoutes } from "./routes.js";
import type { Storage } from "./storage.js";

export interface Deps {
  config: Config;
  db?: Db;
  storage?: Storage;
}

export function buildApp({ config, db, storage }: Deps): FastifyInstance {
  const app = Fastify({ logger: process.env.NODE_ENV !== "test", bodyLimit: 256 * 1024 });

  // Cross-origin rule: only the app's own origin may call this API.
  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    if (origin === undefined) return;
    if (origin !== config.APP_ORIGIN) {
      return reply.code(403).send({ error: "origin_not_allowed" });
    }
    reply.header("Access-Control-Allow-Origin", config.APP_ORIGIN);
    reply.header("Vary", "Origin");
    if (request.method === "OPTIONS") {
      reply.header("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE");
      reply.header("Access-Control-Allow-Headers", "authorization, content-type");
      reply.header("Access-Control-Max-Age", "600");
      return reply.code(204).send();
    }
  });

  app.get("/health", async () => ({ ok: true, region: config.REGION }));

  if (db && storage) {
    const authenticate = createAuthenticator(config);
    const session = (request: { headers: { authorization?: string | undefined } }): Promise<Session> =>
      authenticate(request.headers.authorization);
    registerRoutes(app, { config, db, storage, session });
  }

  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof AuthError) return reply.code(401).send({ error: "unauthorized" });
    if (error instanceof HttpError) return reply.code(error.status).send({ error: error.code });
    if (error instanceof z.ZodError) return reply.code(400).send({ error: "invalid_request" });
    app.log.error(error);
    return reply.code(500).send({ error: "internal" });
  });

  return app;
}
