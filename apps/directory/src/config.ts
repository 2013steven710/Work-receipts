import { HOSTING_REGIONS } from "@claimtidy/core";
import { z } from "zod";

const RegionStack = z.object({
  supabaseUrl: z.url(),
  serviceKey: z.string().min(1),
  anonKey: z.string().min(1),
  // Standard Webhooks secret configured on that region's Auth hooks ("v1,whsec_<base64>").
  hookSecret: z.string().startsWith("v1,whsec_"),
});
export type RegionStack = z.infer<typeof RegionStack>;

const Secret = z.string().min(32);

const ConfigSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8080),
  DATABASE_URL: z.string().min(1),
  APP_ORIGIN: z.url(),
  // Keys every stored identity (no plain email or provider ID is ever stored).
  KEY_SECRET: Secret,
  // Signs short-lived sign-in tickets and email-code verifiers.
  TICKET_SECRET: Secret,
  CODE_SECRET: Secret,
  REGIONS: z
    .string()
    .transform((s) => JSON.parse(s) as unknown)
    .pipe(z.partialRecord(z.enum(HOSTING_REGIONS), RegionStack)),
  GOOGLE_CLIENT_ID: z.string().optional(),
  MICROSOFT_CLIENT_ID: z.string().optional(),
  // Tests point the providers at a local key set.
  JWKS_OVERRIDES: z
    .string()
    .optional()
    .transform((s) => (s ? (JSON.parse(s) as Record<string, string>) : {})),
  MAIL_MODE: z.enum(["log", "postmark"]).default("log"),
  POSTMARK_TOKEN: z.string().optional(),
  MAIL_FROM: z.string().default("ClaimTidy <no-reply@claimtidy.com>"),
  DEV_OUTBOX: z
    .string()
    .optional()
    .transform((v) => v === "1"),
});

export type Config = z.infer<typeof ConfigSchema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const config = ConfigSchema.parse(env);
  if (config.MAIL_MODE === "postmark" && !config.POSTMARK_TOKEN) throw new Error("POSTMARK_TOKEN is required");
  return config;
}
