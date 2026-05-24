'use server';
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { getCloudflareEnv } from "@/lib/cloudflare";
import type { SessionUser } from "@/lib/cloudflare";
import { getAuthInstance } from "@/server/auth";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/db";
import { users } from "@/db/schema";

export const getSessionUser = createServerFn({ method: "GET" }).handler(
  async (): Promise<SessionUser | null> => {
    try {
      const env = getCloudflareEnv();
      const auth = getAuthInstance(env);
      const request = getRequest();

      const session = await auth.api.getSession({
        headers: request.headers,
      });

      if (!session?.user) return null;

      const { id, email, role } = session.user as { id: string; email: string; role?: string };
      return { id, email, role: role ?? "user" };
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
    await db.update(users).set({ role: "admin" }).where(eq(users.email, data.email));

    return { success: true };
  });
