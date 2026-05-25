'use server';
import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { getCloudflareEnv } from "@/lib/cloudflare";
import { getDb } from "@/db/db";
import { searchLogs } from "@/db/schema";
import { resolveSessionUser } from "@/lib/resolve-user";

export interface SearchLogRow {
  id: number;
  eventType: string;
  platform: string | null;
  agentName: string | null;
  message: string;
  metadata: Record<string, any> | null;
  level: string;
  createdAt: string;
}

export interface SearchLogsSummary {
  totalSearches: number;
  totalJobsFound: number;
  totalJobsSkipped: number;
  totalErrors: number;
}

export const getSearchLogs = createServerFn({ method: "GET" })
  .inputValidator((data: {
    page?: number;
    pageSize?: number;
    eventType?: string;
    platform?: string;
    level?: string;
    agentName?: string;
    dateFrom?: string;
    dateTo?: string;
  }) => data)
  .handler(async ({ data }): Promise<{ rows: SearchLogRow[]; total: number; summary: SearchLogsSummary }> => {
    const env = getCloudflareEnv();
    if (!env.DB) return { rows: [], total: 0, summary: { totalSearches: 0, totalJobsFound: 0, totalJobsSkipped: 0, totalErrors: 0 } };

    const user = await resolveSessionUser();
    if (!user) throw new Error("Not authenticated");

    const db = getDb(env.DB);
    const page = data.page ?? 1;
    const pageSize = data.pageSize ?? 50;
    const offset = (page - 1) * pageSize;

    const conditions = [eq(searchLogs.userId, user.id)];
    if (data.eventType) conditions.push(eq(searchLogs.eventType, data.eventType));
    if (data.platform) conditions.push(eq(searchLogs.platform, data.platform));
    if (data.level) conditions.push(eq(searchLogs.level, data.level));
    if (data.agentName) conditions.push(eq(searchLogs.agentName, data.agentName));
    if (data.dateFrom) conditions.push(gte(searchLogs.createdAt, data.dateFrom));
    if (data.dateTo) conditions.push(lte(searchLogs.createdAt, data.dateTo));

    const whereClause = and(...conditions);

    const rows = await db
      .select({
        id: searchLogs.id,
        eventType: searchLogs.eventType,
        platform: searchLogs.platform,
        agentName: searchLogs.agentName,
        message: searchLogs.message,
        metadata: searchLogs.metadata,
        level: searchLogs.level,
        createdAt: searchLogs.createdAt,
      })
      .from(searchLogs)
      .where(whereClause)
      .orderBy(desc(searchLogs.createdAt))
      .limit(pageSize)
      .offset(offset);

    const [countRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(searchLogs)
      .where(whereClause);

    // Summary stats (unfiltered for this user)
    const [searchCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(searchLogs)
      .where(and(
        eq(searchLogs.userId, user.id),
        sql`${searchLogs.eventType} IN ('search_started', 'search_completed')`,
      ));

    const [foundCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(searchLogs)
      .where(and(
        eq(searchLogs.userId, user.id),
        eq(searchLogs.eventType, 'job_found'),
      ));

    const [skippedCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(searchLogs)
      .where(and(
        eq(searchLogs.userId, user.id),
        sql`${searchLogs.eventType} IN ('job_skipped_duplicate', 'job_skipped_filtered')`,
      ));

    const [errorCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(searchLogs)
      .where(and(
        eq(searchLogs.userId, user.id),
        eq(searchLogs.level, 'error'),
      ));

    return {
      rows: rows as SearchLogRow[],
      total: Number(countRow?.count ?? 0),
      summary: {
        totalSearches: Number(searchCount?.count ?? 0),
        totalJobsFound: Number(foundCount?.count ?? 0),
        totalJobsSkipped: Number(skippedCount?.count ?? 0),
        totalErrors: Number(errorCount?.count ?? 0),
      },
    };
  });
