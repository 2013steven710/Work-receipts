import Fastify, { type FastifyInstance } from "fastify";
import type { Config } from "./config.js";

export function buildApp(config: Config): FastifyInstance {
  const app = Fastify({ logger: process.env.NODE_ENV !== "test" });

  // Cross-origin rule: only the app's own origin may call this API.
  app.addHook("onRequest", async (request, reply) => {
    const origin = request.headers.origin;
    if (origin === undefined) return;
    if (origin !== config.APP_ORIGIN) {
      return reply.code(403).send({ error: "origin_not_allowed" });
    }
    reply.header("Access-Control-Allow-Origin", config.APP_ORIGIN);
    reply.header("Vary", "Origin");
  });

  app.get("/health", async () => ({ ok: true, region: config.REGION }));

  return app;
}
