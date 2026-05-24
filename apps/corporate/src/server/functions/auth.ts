'use server';
import { createServerFn } from "@tanstack/react-start";
import { setCookie, getRequest } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { drizzle } from "drizzle-orm/d1";
import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { getCloudflareEnv } from "@/lib/cloudflare";
import type { SessionUser } from "@/lib/cloudflare";
import {
  SESSION_COOKIE,
  SESSION_TTL,
  createSession,
  deleteSession,
  extractSessionToken,
  getSessionCookieDomain,
  shouldUseSecureSessionCookie,
} from "@caliber/shared-utils";

const users = sqliteTable("users", {
  id: integer("id").primaryKey(),
  email: text("email").notNull(),
  passwordHash: text("password_hash").notNull(),
  role: text("role").notNull().default("user"),
});

const schema = { users };

function getDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

export const loginUser = createServerFn({ method: "POST" })
  .inputValidator((data: { email: string; password: string }) => data)
  .handler(async ({ data }): Promise<{ user: SessionUser }> => {
    try {
      const env = getCloudflareEnv();
      if (!env.DB) throw new Error("DB binding unavailable");
      if (!env.KV) throw new Error("KV binding unavailable");

      const request = getRequest();
      const db = getDb(env.DB);
      const rows = await db.select().from(users).where(eq(users.email, data.email)).limit(1);
      const dbUser = rows[0];
      if (!dbUser) throw new Error("Invalid credentials");

      const valid = await bcrypt.compare(data.password, dbUser.passwordHash);
      if (!valid) throw new Error("Invalid credentials");

      const token = await createSession(dbUser.id, env.KV);

      setCookie(SESSION_COOKIE, token, {
        path: "/",
        httpOnly: true,
        secure: shouldUseSecureSessionCookie(request),
        sameSite: "lax" as const,
        maxAge: SESSION_TTL,
        domain: getSessionCookieDomain(request),
      });

      return { user: { id: dbUser.id, email: dbUser.email, role: dbUser.role } };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new Error(msg);
    }
  });

export const logoutUser = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ success: boolean }> => {
    try {
      const env = getCloudflareEnv();
      const request = getRequest();
      const token = extractSessionToken(request);
      if (token) await deleteSession(token, env.KV);

      setCookie(SESSION_COOKIE, "", {
        path: "/",
        httpOnly: true,
        secure: shouldUseSecureSessionCookie(request),
        maxAge: 0,
        sameSite: "lax" as const,
        domain: getSessionCookieDomain(request),
      });

      return { success: true };
    } catch {
      return { success: false };
    }
  },
);

export const getCurrentUser = createServerFn({ method: "GET" }).handler(
  async (): Promise<SessionUser | null> => {
    try {
      const env = getCloudflareEnv();
      if (!env.DB || !env.KV) return null;

      const request = getRequest();
      const token = extractSessionToken(request);
      if (!token) return null;

      const raw = await env.KV.get(`session:${token}`);
      if (!raw) return null;

      const { userId } = JSON.parse(raw) as { userId: number };
      const db = getDb(env.DB);
      const [dbUser] = await db
        .select({ id: users.id, email: users.email, role: users.role })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);

      if (!dbUser) return null;
      return { id: dbUser.id, email: dbUser.email, role: dbUser.role };
    } catch {
      return null;
    }
  },
);
