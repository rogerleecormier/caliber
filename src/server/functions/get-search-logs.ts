'use server';
import { createServerFn } from "@tanstack/react-start";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { getCloudflareEnv } from "@/lib/cloudflare";
import { getDb, schema } from "@/db/db";
import { searchLogs } from "@/db/schema";
import { resolveSessionUser } from "@/lib/resolve-user";

export interface SearchLogRow {
  id: number | string;
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

    // ─── 1. Query conditions for search_logs ─────────────────────────────────
    const conditions = [eq(searchLogs.userId, user.id)];
    if (data.eventType) conditions.push(eq(searchLogs.eventType, data.eventType));
    if (data.platform) conditions.push(eq(searchLogs.platform, data.platform));
    if (data.level) conditions.push(eq(searchLogs.level, data.level));
    if (data.agentName) {
      conditions.push(sql`lower(${searchLogs.agentName}) like ${`%${data.agentName.toLowerCase()}%`}`);
    }
    if (data.dateFrom) conditions.push(gte(searchLogs.createdAt, data.dateFrom));
    if (data.dateTo) conditions.push(lte(searchLogs.createdAt, data.dateTo));

    const whereClause = and(...conditions);

    // ─── 2. Query conditions for sync_history ────────────────────────────────
    let matchSyncHistory = true;

    // Check if syncHistory should be skipped based on eventType filter
    if (data.eventType) {
      if (data.eventType !== 'job_sync' && data.eventType !== 'discovery_sync') {
        matchSyncHistory = false;
      }
    }

    // Check if syncHistory should be skipped based on platform filter
    if (data.platform) {
      const validAtsSources = ['greenhouse', 'lever', 'workable', 'remoteok', 'himalayas', 'jobicy'];
      if (!validAtsSources.includes(data.platform.toLowerCase())) {
        matchSyncHistory = false;
      }
    }

    // Check if syncHistory should be skipped based on level filter
    if (data.level && data.level === 'warning') {
      matchSyncHistory = false;
    }

    // Check if syncHistory should be skipped based on agentName filter
    if (data.agentName) {
      const lowerQuery = data.agentName.toLowerCase();
      const isDiscoveryMatch = 'discovery sync worker'.includes(lowerQuery) || 'discovery'.includes(lowerQuery) || 'worker'.includes(lowerQuery);
      const isAtsMatch = 'ats/aggregator sync worker'.includes(lowerQuery) || 'ats'.includes(lowerQuery) || 'aggregator'.includes(lowerQuery) || 'sync'.includes(lowerQuery) || 'worker'.includes(lowerQuery);
      if (!isDiscoveryMatch && !isAtsMatch) {
        matchSyncHistory = false;
      }
    }

    const syncConditions = [sql`status != 'batch_state'`];
    if (data.eventType) {
      const syncTypeVal = data.eventType === 'discovery_sync' ? 'discovery' : 'job_sync';
      syncConditions.push(eq(schema.syncHistory.syncType, syncTypeVal));
    }
    if (data.platform) {
      syncConditions.push(eq(schema.syncHistory.source, data.platform.toLowerCase()));
    }
    if (data.level) {
      if (data.level === 'error') {
        syncConditions.push(eq(schema.syncHistory.status, 'failed'));
      } else if (data.level === 'success') {
        syncConditions.push(eq(schema.syncHistory.status, 'completed'));
      } else if (data.level === 'info') {
        syncConditions.push(eq(schema.syncHistory.status, 'running'));
      }
    }
    if (data.agentName) {
      const lowerQuery = data.agentName.toLowerCase();
      const isDiscovery = 'discovery sync worker'.includes(lowerQuery) || 'discovery'.includes(lowerQuery) || 'worker'.includes(lowerQuery);
      const isAts = 'ats/aggregator sync worker'.includes(lowerQuery) || 'ats'.includes(lowerQuery) || 'aggregator'.includes(lowerQuery) || 'sync'.includes(lowerQuery) || 'worker'.includes(lowerQuery);
      if (isDiscovery && !isAts) {
        syncConditions.push(eq(schema.syncHistory.syncType, 'discovery'));
      } else if (isAts && !isDiscovery) {
        syncConditions.push(eq(schema.syncHistory.syncType, 'job_sync'));
      }
    }
    if (data.dateFrom) {
      syncConditions.push(gte(schema.syncHistory.startedAt, new Date(data.dateFrom)));
    }
    if (data.dateTo) {
      syncConditions.push(lte(schema.syncHistory.startedAt, new Date(data.dateTo)));
    }

    const syncWhereClause = and(...syncConditions);

    // ─── 3. Count matching records ───────────────────────────────────────────
    const [searchLogsCountRow] = await db
      .select({ count: sql<number>`count(*)` })
      .from(searchLogs)
      .where(whereClause);
    const searchLogsCount = Number(searchLogsCountRow?.count ?? 0);

    let syncHistoryCount = 0;
    if (matchSyncHistory) {
      const [syncHistoryCountRow] = await db
        .select({ count: sql<number>`count(*)` })
        .from(schema.syncHistory)
        .where(syncWhereClause);
      syncHistoryCount = Number(syncHistoryCountRow?.count ?? 0);
    }

    const totalCombined = searchLogsCount + syncHistoryCount;

    // ─── 4. Fetch records (up to offset + pageSize to merge correctly) ───────
    const fetchLimit = offset + pageSize;

    const searchRows = await db
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
      .limit(fetchLimit);

    let syncRows: any[] = [];
    if (matchSyncHistory) {
      syncRows = await db
        .select()
        .from(schema.syncHistory)
        .where(syncWhereClause)
        .orderBy(desc(schema.syncHistory.startedAt))
        .limit(fetchLimit);
    }

    // ─── 5. Map and Merge ────────────────────────────────────────────────────
    const mappedSearchRows: SearchLogRow[] = searchRows.map((row) => ({
      id: row.id,
      eventType: row.eventType,
      platform: row.platform,
      agentName: row.agentName,
      message: row.message,
      metadata: row.metadata,
      level: row.level,
      createdAt: row.createdAt,
    }));

    const mappedSyncRows: SearchLogRow[] = syncRows.map((sync) => {
      let level = 'info';
      if (sync.status === 'failed') level = 'error';
      else if (sync.status === 'completed') level = 'success';

      const eventType = sync.syncType === 'discovery' ? 'discovery_sync' : 'job_sync';
      const agentName = sync.syncType === 'discovery' ? 'Discovery Sync Worker' : 'ATS/Aggregator Sync Worker';
      
      let message = '';
      const stats = sync.stats as any;
      if (sync.status === 'failed') {
        message = `Sync worker failed for ${sync.source || 'Discovery'}: ${stats?.error || 'Unknown fatal error'}`;
      } else if (sync.status === 'completed') {
        if (sync.syncType === 'discovery') {
          message = `Discovery completed. Checked ${stats?.companiesChecked || 0} companies, discovered ${stats?.companiesAdded || 0} new, updated ${stats?.companiesUpdated || 0}`;
        } else {
          message = `Ingestion completed for ${sync.source || 'unknown'}. Added ${stats?.jobsAdded || 0} jobs, updated ${stats?.jobsUpdated || 0}`;
        }
      } else {
        message = `Sync worker running for ${sync.source || 'Discovery'}...`;
      }

      return {
        id: `sync-${sync.id}`,
        eventType,
        platform: sync.source,
        agentName,
        message,
        metadata: {
          status: sync.status,
          completedAt: sync.completedAt ? new Date(sync.completedAt).toISOString() : null,
          stats: sync.stats,
          workerLogs: Array.isArray(sync.logs) ? sync.logs : [], // Detail console logs
        },
        level,
        createdAt: sync.startedAt ? new Date(sync.startedAt).toISOString() : new Date().toISOString(),
      };
    });

    const combinedRows = [...mappedSearchRows, ...mappedSyncRows];

    // Sort by createdAt descending
    combinedRows.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Slice for page
    const paginatedRows = combinedRows.slice(offset, offset + pageSize);

    // ─── 6. Compute statistics ───────────────────────────────────────────────
    const [searchCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(searchLogs)
      .where(and(
        eq(searchLogs.userId, user.id),
        eq(searchLogs.eventType, 'search_completed'),
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

    const [syncErrorCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.syncHistory)
      .where(and(
        eq(schema.syncHistory.status, 'failed'),
        sql`status != 'batch_state'`
      ));

    const totalErrors = Number(errorCount?.count ?? 0) + Number(syncErrorCount?.count ?? 0);

    return {
      rows: paginatedRows,
      total: totalCombined,
      summary: {
        totalSearches: Number(searchCount?.count ?? 0),
        totalJobsFound: Number(foundCount?.count ?? 0),
        totalJobsSkipped: Number(skippedCount?.count ?? 0),
        totalErrors,
      },
    };
  });
