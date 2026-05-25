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
  savedSearchId?: number | null;
}

export type GroupedActivityLog =
  | {
      id: string;
      type: 'search';
      agentName: string | null;
      platform: string | null;
      savedSearchId: number | null;
      status: 'completed' | 'failed' | 'running';
      level: 'info' | 'success' | 'warning' | 'error';
      createdAt: string;
      completedAt: string | null;
      message: string;
      metadata: Record<string, any>;
      events: SearchLogRow[];
    }
  | {
      id: string;
      type: 'sync';
      agentName: string;
      platform: string | null;
      status: 'completed' | 'failed' | 'running';
      level: 'info' | 'success' | 'warning' | 'error';
      createdAt: string;
      completedAt: string | null;
      message: string;
      metadata: {
        status: string;
        completedAt: string | null;
        stats: {
          jobsAdded?: number;
          jobsUpdated?: number;
          jobsDeleted?: number;
          companiesChecked?: number;
          companiesAdded?: number;
          companiesUpdated?: number;
          error?: string;
        };
        workerLogs: Array<{
          timestamp: string;
          type: 'info' | 'success' | 'warning' | 'error';
          message: string;
        }>;
      };
    };

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
  .handler(async ({ data }): Promise<{ rows: GroupedActivityLog[]; total: number; summary: SearchLogsSummary }> => {
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

    // ─── 3. Fetch raw database rows (up to limits, then group & filter in-memory) ───
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
        savedSearchId: searchLogs.savedSearchId,
      })
      .from(searchLogs)
      .where(whereClause)
      .orderBy(desc(searchLogs.createdAt))
      .limit(3000);

    let syncRows: any[] = [];
    if (matchSyncHistory) {
      syncRows = await db
        .select()
        .from(schema.syncHistory)
        .where(syncWhereClause)
        .orderBy(desc(schema.syncHistory.startedAt))
        .limit(1000);
    }

    // ─── 4. Group search events into Search Runs ───────────────────────────────
    // Sort raw search logs chronologically for grouping
    const sortedSearchLogs = [...searchRows].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );

    const groupedSearchRuns: GroupedActivityLog[] = [];
    const activeRunsByKey = new Map<string, GroupedActivityLog & { type: 'search' }>();

    for (const log of sortedSearchLogs) {
      const runKey = log.savedSearchId
        ? `saved-${log.savedSearchId}`
        : (log.agentName ? `agent-${log.agentName}` : 'manual');

      const logTime = new Date(log.createdAt).getTime();
      const activeRun = activeRunsByKey.get(runKey);

      // Force creating a new run if we see a start marker or if time gap is too large
      const isStartEvent = log.eventType === 'search_started' || log.eventType === 'cron_triggered';
      const thresholdMs = 15 * 60 * 1000; // 15 minutes max gap

      let parsedMetadata: Record<string, any> = {};
      if (log.metadata) {
        try {
          parsedMetadata = typeof log.metadata === 'string'
            ? JSON.parse(log.metadata)
            : log.metadata;
        } catch {
          parsedMetadata = {};
        }
      }

      if (activeRun && !isStartEvent && (logTime - new Date(activeRun.createdAt).getTime()) < thresholdMs) {
        activeRun.events.push({
          id: log.id,
          eventType: log.eventType,
          platform: log.platform,
          agentName: log.agentName,
          message: log.message,
          metadata: parsedMetadata,
          level: log.level,
          createdAt: log.createdAt,
          savedSearchId: log.savedSearchId,
        });

        activeRun.completedAt = log.createdAt;

        // Escalate status and level
        if (log.level === 'error') {
          activeRun.level = 'error';
          activeRun.status = 'failed';
        } else if (log.level === 'warning' && activeRun.level !== 'error') {
          activeRun.level = 'warning';
        } else if (log.level === 'success' && activeRun.level !== 'error' && activeRun.level !== 'warning') {
          activeRun.level = 'success';
        }

        if (log.eventType === 'search_completed') {
          activeRun.status = 'completed';
        }

        // Consolidated message: prioritize final success/failure logs
        if (log.eventType === 'search_completed' || log.level === 'error') {
          activeRun.message = log.message;
        }

        activeRun.metadata = {
          ...activeRun.metadata,
          ...parsedMetadata,
        };
      } else {
        let status: 'completed' | 'failed' | 'running' = 'running';
        if (log.eventType === 'search_completed') status = 'completed';
        else if (log.level === 'error') status = 'failed';

        let runName = log.agentName;
        if (!runName && log.savedSearchId) {
          runName = `Saved Search #${log.savedSearchId}`;
        }
        if (!runName) {
          runName = 'Manual Search';
        }

        const newRun: GroupedActivityLog & { type: 'search' } = {
          id: `search-run-${log.id}`,
          type: 'search',
          agentName: runName,
          platform: log.platform,
          savedSearchId: log.savedSearchId,
          status,
          level: log.level as any,
          createdAt: log.createdAt,
          completedAt: log.createdAt,
          message: log.message,
          metadata: parsedMetadata,
          events: [
            {
              id: log.id,
              eventType: log.eventType,
              platform: log.platform,
              agentName: log.agentName,
              message: log.message,
              metadata: parsedMetadata,
              level: log.level,
              createdAt: log.createdAt,
              savedSearchId: log.savedSearchId,
            }
          ],
        };

        groupedSearchRuns.push(newRun);
        activeRunsByKey.set(runKey, newRun);
      }
    }

    // ─── 5. Map Sync History Runs ─────────────────────────────────────────────
    const mappedSyncRuns: GroupedActivityLog[] = syncRows.map((sync) => {
      let level: 'info' | 'success' | 'warning' | 'error' = 'info';
      let status: 'completed' | 'failed' | 'running' = 'running';

      if (sync.status === 'failed') {
        level = 'error';
        status = 'failed';
      } else if (sync.status === 'completed') {
        level = 'success';
        status = 'completed';
      }

      const agentName = sync.syncType === 'discovery' ? 'Company Discovery Sync' : 'ATS Ingestion Sync';

      let message = '';
      const stats = sync.stats as any;
      if (sync.status === 'failed') {
        message = `Sync failed for ${sync.source || 'Discovery'}: ${stats?.error || 'Unknown error'}`;
      } else if (sync.status === 'completed') {
        if (sync.syncType === 'discovery') {
          message = `Discovery completed for ${sync.source || 'Greenhouse/Lever'}. Checked ${stats?.companiesChecked || 0} companies, discovered ${stats?.companiesAdded || 0} new`;
        } else {
          message = `Ingestion completed for ${sync.source || 'unknown'}. Added ${stats?.jobsAdded || 0} jobs, updated ${stats?.jobsUpdated || 0}`;
        }
      } else {
        message = `Sync worker running for ${sync.source || 'Discovery'}...`;
      }

      return {
        id: `sync-${sync.id}`,
        type: 'sync',
        agentName,
        platform: sync.source,
        status,
        level,
        createdAt: sync.startedAt ? new Date(sync.startedAt).toISOString() : new Date().toISOString(),
        completedAt: sync.completedAt ? new Date(sync.completedAt).toISOString() : null,
        message,
        metadata: {
          status: sync.status,
          completedAt: sync.completedAt ? new Date(sync.completedAt).toISOString() : null,
          stats: sync.stats || {},
          workerLogs: Array.isArray(sync.logs) ? sync.logs : [],
        },
      };
    });

    // ─── 6. Merge and Sort Grouped Runs ───────────────────────────────────────
    const combinedRuns = [...groupedSearchRuns, ...mappedSyncRuns];
    combinedRuns.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // ─── 7. Apply Filters In-Memory ──────────────────────────────────────────
    const filteredRuns = combinedRuns.filter((run) => {
      // Filter by Level
      if (data.level) {
        if (run.level !== data.level) return false;
      }

      // Filter by Platform
      if (data.platform) {
        const queryPlatform = data.platform.toLowerCase();
        const runPlatform = run.platform?.toLowerCase() || '';
        if (run.type === 'search') {
          const matchesRunPlatform = runPlatform.includes(queryPlatform);
          const matchesEventPlatform = run.events.some(
            (e) => e.platform?.toLowerCase().includes(queryPlatform)
          );
          if (!matchesRunPlatform && !matchesEventPlatform) return false;
        } else {
          if (!runPlatform.includes(queryPlatform)) return false;
        }
      }

      // Filter by Event Type
      if (data.eventType) {
        if (run.type === 'search') {
          const hasEventType = run.events.some((e) => e.eventType === data.eventType);
          if (!hasEventType) return false;
        } else {
          const runEventType = run.agentName.includes('Discovery') ? 'discovery_sync' : 'job_sync';
          if (runEventType !== data.eventType) return false;
        }
      }

      return true;
    });

    const total = filteredRuns.length;
    const paginatedRows = filteredRuns.slice(offset, offset + pageSize);

    // ─── 8. Compute global statistics ─────────────────────────────────────────
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
      total,
      summary: {
        totalSearches: Number(searchCount?.count ?? 0),
        totalJobsFound: Number(foundCount?.count ?? 0),
        totalJobsSkipped: Number(skippedCount?.count ?? 0),
        totalErrors,
      },
    };
  });
