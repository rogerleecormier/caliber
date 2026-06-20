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

export const getUserPreferences = createServerFn({ method: "GET" }).handler(async (_data, ctx) => {
  const sessionUser = await resolveSessionUser((ctx as any)?.request);
  if (!sessionUser) throw new Error("Not authenticated");
  const env = await getCloudflareEnvAsync();
  if (!env.DB) return {
    showGlobalJobs: false,
    preferredSalaryMin: null,
    preferredSalaryMax: null,
    preferredLocation: null,
    preferredRemote: 'any',
    preferredKeywords: [],
  };
  const db = getDb(env.DB);
  const [row] = await db
    .select({
      showGlobalJobs: user.showGlobalJobs,
      preferredSalaryMin: user.preferredSalaryMin,
      preferredSalaryMax: user.preferredSalaryMax,
      preferredLocation: user.preferredLocation,
      preferredRemote: user.preferredRemote,
      preferredKeywords: user.preferredKeywords,
    })
    .from(user)
    .where(eq(user.id, sessionUser.id))
    .limit(1);

  let keywords: string[] = [];
  if (row?.preferredKeywords) {
    try {
      keywords = JSON.parse(row.preferredKeywords) as string[];
    } catch {
      // ignore
    }
  }

  return {
    showGlobalJobs: row?.showGlobalJobs ?? false,
    preferredSalaryMin: row?.preferredSalaryMin ?? null,
    preferredSalaryMax: row?.preferredSalaryMax ?? null,
    preferredLocation: row?.preferredLocation ?? null,
    preferredRemote: (row?.preferredRemote || 'any') as 'remote' | 'hybrid' | 'on-site' | 'any',
    preferredKeywords: keywords,
  };
});

export const setUserPreferences = createServerFn({ method: "POST" })
  .inputValidator((data: {
    showGlobalJobs?: boolean;
    preferredSalaryMin?: number | null;
    preferredSalaryMax?: number | null;
    preferredLocation?: string | null;
    preferredRemote?: string | null;
    preferredKeywords?: string[] | null;
  }) => data)
  .handler(async ({ data }, ctx) => {
    const sessionUser = await resolveSessionUser((ctx as any)?.request);
    if (!sessionUser) throw new Error("Not authenticated");
    const env = await getCloudflareEnvAsync();
    if (!env.DB) throw new Error("Database unavailable");
    const db = getDb(env.DB);

    const updateFields: any = {};
    if (data.showGlobalJobs !== undefined) updateFields.showGlobalJobs = data.showGlobalJobs;
    if (data.preferredSalaryMin !== undefined) updateFields.preferredSalaryMin = data.preferredSalaryMin;
    if (data.preferredSalaryMax !== undefined) updateFields.preferredSalaryMax = data.preferredSalaryMax;
    if (data.preferredLocation !== undefined) updateFields.preferredLocation = data.preferredLocation;
    if (data.preferredRemote !== undefined) updateFields.preferredRemote = data.preferredRemote;
    if (data.preferredKeywords !== undefined) {
      updateFields.preferredKeywords = data.preferredKeywords ? JSON.stringify(data.preferredKeywords) : null;
    }

    await db
      .update(user)
      .set(updateFields)
      .where(eq(user.id, sessionUser.id));

    return { success: true };
  });
