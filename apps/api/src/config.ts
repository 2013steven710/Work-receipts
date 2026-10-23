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
  // Linking the user's own Google Drive / OneDrive (v13). The API only exchanges and refreshes
  // tokens with the app's secret; it never stores them. Unset = that provider is unavailable.
  GOOGLE_CLIENT_ID: z.string().min(1).optional(),
  GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),
  GOOGLE_TOKEN_URL: z.url().default("https://oauth2.googleapis.com/token"),
  MICROSOFT_CLIENT_ID: z.string().min(1).optional(),
  MICROSOFT_CLIENT_SECRET: z.string().min(1).optional(),
  MICROSOFT_TOKEN_URL: z.url().default("https://login.microsoftonline.com/common/oauth2/v2.0/token"),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  // An empty variable means "not set" (compose passes `${NAME:-}` through as an empty string).
  return ConfigSchema.parse(Object.fromEntries(Object.entries(env).filter(([, value]) => value !== "")));
}
