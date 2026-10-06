import { HOSTING_REGIONS } from "@claimtidy/core";
import { z } from "zod";

const ConfigSchema = z.object({
  REGION: z.enum(HOSTING_REGIONS),
  PORT: z.coerce.number().int().positive().default(8080),
  // The only origin allowed to call the regional API (build plan section 4).
  APP_ORIGIN: z.url(),
  SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_KEY: z.string().min(1),
  // Direct Postgres connection for the API's own transactions (server-side only).
  DATABASE_URL: z.string().min(1),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return ConfigSchema.parse(env);
}
