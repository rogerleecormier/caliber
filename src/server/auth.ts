import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { CloudflareEnv } from "@/lib/cloudflare";
import { getDb } from "@/db/db";
import * as schema from "@/db/schema";

export function getAuthInstance(env: CloudflareEnv) {
  if (!env.DB) {
    throw new Error("Database binding unavailable");
  }

  const db = getDb(env.DB);

  return betterAuth({
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema,
    }),
    secret: env.BETTER_AUTH_SECRET || "your-secret-key-change-in-production",
    emailAndPassword: {
      enabled: true,
      passwordMinLength: 8,
    },
  });
}
