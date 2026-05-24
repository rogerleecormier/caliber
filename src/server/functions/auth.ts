'use server';
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { getCloudflareEnv } from "@/lib/cloudflare";
import type { SessionUser } from "@/lib/cloudflare";
import { getAuthInstance } from "@/server/auth";
import { eq } from "drizzle-orm";
import { getDb } from "@/db/db";
import { users } from "@/db/schema";

/**
 * Sign in with email and password using better-auth.
 */
export const loginUser = createServerFn({ method: "POST" })
  .inputValidator((data: { email: string; password: string }) => data)
  .handler(async ({ data }): Promise<{ user: SessionUser }> => {
    const env = getCloudflareEnv();
    const auth = getAuthInstance(env);

    const result = await auth.api.signInEmail({
      email: data.email,
      password: data.password,
    });

    if (result.error) {
      throw new Error(result.error.message || "Invalid credentials");
    }

    // Fetch user to get role
    const db = getDb(env.DB);
    const [dbUser] = await db
      .select({ id: users.id, email: users.email, role: users.role })
      .from(users)
      .where(eq(users.email, data.email))
      .limit(1);

    if (!dbUser) throw new Error("User not found");

    return {
      user: { id: dbUser.id, email: dbUser.email, role: dbUser.role },
    };
  });

/**
 * Sign out using better-auth.
 */
export const logoutUser = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ success: boolean }> => {
    const env = getCloudflareEnv();
    const auth = getAuthInstance(env);
    const request = getRequest();

    const result = await auth.api.signOut({
      asJson: true,
    });

    return { success: !result.error };
  },
);

/**
 * Get the current user from the session.
 */
export const getCurrentUser = createServerFn({ method: "GET" }).handler(
  async (): Promise<SessionUser | null> => {
    try {
      const env = getCloudflareEnv();
      const auth = getAuthInstance(env);
      const request = getRequest();

      const session = await auth.api.getSession({
        headers: request.headers,
      });

      if (!session?.user) return null;

      // Fetch user with role
      const db = getDb(env.DB);
      const [dbUser] = await db
        .select({ id: users.id, email: users.email, role: users.role })
        .from(users)
        .where(eq(users.id, session.user.id))
        .limit(1);

      if (!dbUser) return null;
      return { id: dbUser.id, email: dbUser.email, role: dbUser.role };
    } catch (error) {
      console.error("[getCurrentUser] error:", error);
      return null;
    }
  },
);
