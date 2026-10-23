import { z } from "zod";

const ConfigSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8080),
  // The only origin allowed to call the API (the web app).
  APP_ORIGIN: z.url(),
  SUPABASE_URL: z.url(),
  // Direct Postgres connection for the API's own transactions (server-side only).
  DATABASE_URL: z.string().min(1),
  // Self-hosted Supabase may still issue legacy HS256 tokens signed with a shared secret; when set,
  // those are accepted too. Asymmetric tokens are always checked against the published key set.
  SUPABASE_JWT_SECRET: z.string().min(32).optional(),
  // The token issuer, when the API reaches Supabase on an internal address (self-hosted).
  SUPABASE_JWT_ISSUER: z.url().optional(),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return ConfigSchema.parse(env);
}
