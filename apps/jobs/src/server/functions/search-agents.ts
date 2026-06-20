'use server';
import { createServerFn } from "@tanstack/react-start";
import { and, eq, sql } from "drizzle-orm";
import { resolveSessionUser } from "@/lib/resolve-user";
import { getCloudflareEnv } from "@/lib/cloudflare";
import { getDb, schema } from "@/db/db";
import { runSearchAgent } from "@/server/functions/run-search-agent";

export interface SearchAgentView {
  id: number;
  name: string;
  criteria: string;
  isActive: boolean;
  autoFavoriteThreshold: number;
  lastRunAt: string | null;
  matchCount: number;
  createdAt: string;
  updatedAt: string;
}

export const listSearchAgents = createServerFn({ method: "GET" }).handler(
  async (): Promise<SearchAgentView[]> => {
    const env = getCloudflareEnv();
    if (!env.DB) return [];
    const user = await resolveSessionUser();
    if (!user) return [];
    const db = getDb(env.DB);

    const agents = await db
      .select()
      .from(schema.searchAgents)
      .where(eq(schema.searchAgents.userId, user.id));

    const counts = await db
      .select({ agentId: schema.userJobs.searchAgentId, count: sql<number>`count(*)` })
      .from(schema.userJobs)
      .where(eq(schema.userJobs.userId, user.id))
      .groupBy(schema.userJobs.searchAgentId);
    const countMap = new Map(counts.map((c) => [c.agentId, c.count]));

    return agents.map((a) => ({
      id: a.id,
      name: a.name,
      criteria: a.criteria,
      isActive: a.isActive === 1,
      autoFavoriteThreshold: a.autoFavoriteThreshold,
      lastRunAt: a.lastRunAt,
      matchCount: countMap.get(a.id) ?? 0,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    }));
  },
);

export const createSearchAgent = createServerFn({ method: "POST" })
  .inputValidator((data: { name: string; criteria: string; autoFavoriteThreshold?: number }) => data)
  .handler(async ({ data }): Promise<{ id: number }> => {
    const env = getCloudflareEnv();
    if (!env.DB) throw new Error("Database not available");
    const user = await resolveSessionUser();
    if (!user) throw new Error("Not authenticated");
    const db = getDb(env.DB);
    const now = new Date().toISOString();

    const [row] = await db
      .insert(schema.searchAgents)
      .values({
        userId: user.id,
        name: data.name,
        criteria: data.criteria,
        isActive: 1,
        autoFavoriteThreshold: data.autoFavoriteThreshold ?? 75,
        createdAt: now,
        updatedAt: now,
      })
      .returning({ id: schema.searchAgents.id });
    return { id: row.id };
  });

export const toggleSearchAgent = createServerFn({ method: "POST" })
  .inputValidator((data: { id: number; isActive: boolean }) => data)
  .handler(async ({ data }): Promise<{ success: boolean }> => {
    const env = getCloudflareEnv();
    if (!env.DB) throw new Error("Database not available");
    const user = await resolveSessionUser();
    if (!user) throw new Error("Not authenticated");
    const db = getDb(env.DB);
    await db
      .update(schema.searchAgents)
      .set({ isActive: data.isActive ? 1 : 0, updatedAt: new Date().toISOString() })
      .where(and(eq(schema.searchAgents.id, data.id), eq(schema.searchAgents.userId, user.id)));
    return { success: true };
  });

export const deleteSearchAgent = createServerFn({ method: "POST" })
  .inputValidator((data: { id: number }) => data)
  .handler(async ({ data }): Promise<{ success: boolean }> => {
    const env = getCloudflareEnv();
    if (!env.DB) throw new Error("Database not available");
    const user = await resolveSessionUser();
    if (!user) throw new Error("Not authenticated");
    const db = getDb(env.DB);
    await db
      .delete(schema.searchAgents)
      .where(and(eq(schema.searchAgents.id, data.id), eq(schema.searchAgents.userId, user.id)));
    return { success: true };
  });

export const runSearchAgentNow = createServerFn({ method: "POST" })
  .inputValidator((data: { id: number }) => data)
  .handler(async ({ data }): Promise<{ scored: number; autoFavorited: number }> => {
    const env = getCloudflareEnv();
    if (!env.DB) throw new Error("Database not available");
    const user = await resolveSessionUser();
    if (!user) throw new Error("Not authenticated");
    const db = getDb(env.DB);

    const [agent] = await db
      .select()
      .from(schema.searchAgents)
      .where(and(eq(schema.searchAgents.id, data.id), eq(schema.searchAgents.userId, user.id)))
      .limit(1);
    if (!agent) throw new Error("Search agent not found");

    const result = await runSearchAgent(db, env, agent);
    return { scored: result.scored, autoFavorited: result.autoFavorited };
  });
