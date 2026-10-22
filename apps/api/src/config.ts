import { HOSTING_REGIONS } from "@claimtidy/core";
import { z } from "zod";

const ConfigSchema = z.object({
  REGION: z.enum(HOSTING_REGIONS),
  PORT: z.coerce.number().int().positive().default(8080),
  // The only origin allowed to call the regional API (build plan section 4).
  APP_ORIGIN: z.url(),
  SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_KEY: z.string().min(1),
  // Self-hosted Supabase (Hostinger) may still issue legacy HS256 tokens signed with a shared
  // secret; when set, those are accepted too. Asymmetric tokens are always checked against the
  // region's published key set.
  SUPABASE_JWT_SECRET: z.string().min(32).optional(),
  // The token issuer, when the API reaches Supabase on an internal address (self-hosted).
  SUPABASE_JWT_ISSUER: z.url().optional(),
  // Direct Postgres connection for the API's own transactions (server-side only).
  DATABASE_URL: z.string().min(1),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return ConfigSchema.parse(env);
}
