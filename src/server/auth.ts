import { betterAuth } from "better-auth";
import { admin } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { CloudflareEnv } from "@/lib/cloudflare";
import { getDb } from "@/db/db";
import * as schema from "@/db/schema";

export function getAuthInstance(env: Partial<CloudflareEnv> & Record<string, any>) {
  if (!env.DB) {
    throw new Error("Database binding unavailable");
  }
  if (!env.BETTER_AUTH_SECRET) {
    throw new Error("BETTER_AUTH_SECRET environment variable is required");
  }
  if (!env.BETTER_AUTH_URL) {
    throw new Error("BETTER_AUTH_URL environment variable is required");
  }

  const db = getDb(env.DB);

  return betterAuth({
    baseURL: env.BETTER_AUTH_URL,
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
      },
    }),
    secret: env.BETTER_AUTH_SECRET,
    session: {
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60,
      },
    },
    trustedOrigins: [
      "https://caliber.rcormier.dev",
      "https://caliber.rcormier.workers.dev",
      "http://caliber.rcormier.dev",
      "http://caliber.rcormier.workers.dev",
      "http://localhost:3003",
      "http://localhost:5173",
      "http://127.0.0.1:3003",
      "http://127.0.0.1:5173",
    ],
    emailAndPassword: {
      enabled: true,
      passwordMinLength: 8,
    },
    plugins: [
      admin({
        defaultRole: "user",
        adminRole: "admin",
      }),
    ],
  });
}
