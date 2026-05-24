'use server';
import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { getCloudflareEnv } from "@/lib/cloudflare";
import { getDb } from "@/db/db";
import { resolveSessionUser } from "@/lib/resolve-user";
import { users, masterResume, jobAnalyses, analyticsSummary, linkedinJobResults, linkedinSavedSearches } from "@/db/schema";

async function requireAdmin() {
  const user = await resolveSessionUser();
  if (!user || user.role !== "admin") throw new Error("Unauthorized");
  return user;
}

export const listUsers = createServerFn({ method: "GET" }).handler(async () => {
  await requireAdmin();
  const env = getCloudflareEnv();
  if (!env.DB) return [];
  const db = getDb(env.DB);
  return db.select({ id: users.id, email: users.email, role: users.role, createdAt: users.createdAt }).from(users);
});

export const createUser = createServerFn({ method: "POST" })
  .inputValidator((data: { email: string; password: string; role?: "admin" | "user" }) => data)
  .handler(async ({ data }) => {
    await requireAdmin();
    const env = getCloudflareEnv();
    if (!env.DB) throw new Error("Database unavailable");
    const db = getDb(env.DB);
    const hash = await bcrypt.hash(data.password, 10);
    await db.insert(users).values({
      email: data.email.trim().toLowerCase(),
      passwordHash: hash,
      role: data.role ?? "user",
      createdAt: new Date().toISOString(),
    });
    return { success: true };
  });

export const deleteUser = createServerFn({ method: "POST" })
  .inputValidator((data: { userId: number }) => data)
  .handler(async ({ data }) => {
    const currentUser = await requireAdmin();
    if (currentUser.id === data.userId) throw new Error("You cannot delete your own admin account");

    const env = getCloudflareEnv();
    if (!env.DB) throw new Error("Database unavailable");
    const db = getDb(env.DB);

    await db.delete(masterResume).where(eq(masterResume.userId, data.userId));
    await db.delete(jobAnalyses).where(eq(jobAnalyses.userId, data.userId));
    await db.delete(analyticsSummary).where(eq(analyticsSummary.userId, data.userId));
    await db.delete(linkedinJobResults).where(eq(linkedinJobResults.userId, data.userId));
    await db.delete(linkedinSavedSearches).where(eq(linkedinSavedSearches.userId, data.userId));
    await db.delete(users).where(eq(users.id, data.userId));

    return { success: true };
  });
