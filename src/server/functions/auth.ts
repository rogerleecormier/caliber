'use server';
import { createServerFn } from "@tanstack/react-start";
import { getCloudflareEnv } from "@/lib/cloudflare";
import type { SessionUser } from "@/lib/cloudflare";
import { resolveSessionUser } from "@/lib/resolve-user";
import { sql } from "drizzle-orm";
import { getDb } from "@/db/db";
import { user, users } from "@/db/schema";

export const getSessionUser = createServerFn({ method: "GET" }).handler(
  async (): Promise<SessionUser | null> => {
    try {
      return await resolveSessionUser();
    } catch (error) {
      console.error("[getSessionUser] error:", error);
      return null;
    }
  },
);

/**
 * Promote a user to admin (requires admin secret token).
 * TEMPORARY: Remove after initial setup.
 */
export const promoteToAdmin = createServerFn({ method: "POST" })
  .inputValidator((data: { email: string; token: string }) => data)
  .handler(async ({ data }): Promise<{ success: boolean }> => {
    const env = getCloudflareEnv();
    const adminToken = env.ADMIN_PROMOTION_TOKEN;

    if (!adminToken || data.token !== adminToken) {
      throw new Error("Invalid token");
    }

    const db = getDb(env.DB);
    const normalizedEmail = data.email.trim().toLowerCase();

    // Canonical role source is better-auth's `user` table.
    await db
      .update(user)
      .set({ role: "admin" })
      .where(sql`lower(${user.email}) = ${normalizedEmail}`);
    // Keep legacy mirror in sync during transition.
    await db
      .update(users)
      .set({ role: "admin" })
      .where(sql`lower(${users.email}) = ${normalizedEmail}`);

    return { success: true };
  });
