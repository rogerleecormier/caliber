'use server';

import { createServerFn } from "@tanstack/react-start";
import { eq } from "drizzle-orm";
import { getCloudflareEnvAsync } from "@/lib/cloudflare";
import { getDb } from "@/db/db";
import { user } from "@/db/schema";
import { resolveSessionUser } from "@/lib/resolve-user";

export const getShowGlobalJobs = createServerFn({ method: "GET" }).handler(async (_data, ctx) => {
  const sessionUser = await resolveSessionUser((ctx as any)?.request);
  if (!sessionUser) throw new Error("Not authenticated");
  const env = await getCloudflareEnvAsync();
  if (!env.DB) return { showGlobalJobs: false };
  const db = getDb(env.DB);
  const [row] = await db
    .select({ showGlobalJobs: user.showGlobalJobs })
    .from(user)
    .where(eq(user.id, sessionUser.id))
    .limit(1);
  return { showGlobalJobs: row?.showGlobalJobs ?? false };
});

export const setShowGlobalJobs = createServerFn({ method: "POST" })
  .inputValidator((data: { showGlobalJobs: boolean }) => data)
  .handler(async ({ data }, ctx) => {
    const sessionUser = await resolveSessionUser((ctx as any)?.request);
    if (!sessionUser) throw new Error("Not authenticated");
    const env = await getCloudflareEnvAsync();
    if (!env.DB) throw new Error("Database unavailable");
    const db = getDb(env.DB);
    await db
      .update(user)
      .set({ showGlobalJobs: data.showGlobalJobs })
      .where(eq(user.id, sessionUser.id));
    return { showGlobalJobs: data.showGlobalJobs };
  });
