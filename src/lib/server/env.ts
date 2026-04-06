import "server-only";

import { z } from "zod";

const envSchema = z.object({
  AUTH0_CLIENT_ID: z.string().min(1),
  AUTH0_SECRET: z.string().min(1),
  STRIPE_SECRET_KEY: z.string().min(1),
  PLAID_CLIENT_ID: z.string().min(1),
  PLAID_SECRET: z.string().min(1),
  AUTH0_DOMAIN: z.string().optional(),
  AUTH0_AUDIENCE: z.string().optional(),
  GOOGLE_GENERATIVE_AI_API_KEY: z.string().optional(),
  PLAID_ACCESS_TOKEN: z.string().optional(),
  STRIPE_INVOICE_LIMIT: z.coerce.number().int().positive().default(25),
  PLAID_SANDBOX_INSTITUTION_ID: z.string().default("ins_109508"),
});

export type AppEnv = z.infer<typeof envSchema>;

let cachedEnv: AppEnv | null = null;

export function getEnv(): AppEnv {
  if (cachedEnv) {
    return cachedEnv;
  }

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((issue) => issue.path.join(".")).join(", ");
    throw new Error(`Invalid environment variables: ${missing}`);
  }

  cachedEnv = parsed.data;
  return cachedEnv;
}

export function hasGeminiKey(): boolean {
  return Boolean(process.env.GOOGLE_GENERATIVE_AI_API_KEY);
}
