'use server';
import { createServerFn } from "@tanstack/react-start";
import { getCloudflareEnvAsync } from "@/lib/cloudflare";
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
          fetchedJobs?: number;
          insertedCount?: number;
          mergedCount?: number;
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

const EMPTY: { rows: GroupedActivityLog[]; total: number; summary: SearchLogsSummary } = {
  rows: [],
  total: 0,
  summary: { totalSearches: 0, totalJobsFound: 0, totalJobsSkipped: 0, totalErrors: 0 },
};

// Map audit_log event types to display levels
function eventLevel(eventType: string, hasError: boolean): 'info' | 'success' | 'warning' | 'error' {
  if (hasError || eventType === 'error') return 'error';
  if (eventType === 'crawl_complete' || eventType === 'vector_insert' || eventType === 'board_discovered') return 'success';
  if (eventType === 'board_validation_failed') return 'warning';
  return 'info';
}

function crawlEventMessage(eventType: string, ats: string | null, boardToken: string | null, details: Record<string, any>): string {
  const source = ats ? `${ats}${boardToken ? `/${boardToken}` : ''}` : 'unknown';
  if (eventType === 'crawl_start') return `Crawl started: ${source}`;
  if (eventType === 'crawl_complete') {
    const inserted = details.insertedCount ?? 0;
    const merged = details.mergedCount ?? 0;
    const fetched = details.fetchedJobs ?? 0;
    return `Crawl complete: ${source} — ${fetched} fetched, ${inserted} new, ${merged} deduped`;
  }
  if (eventType === 'error') return `Error on ${source}: ${String(details.error ?? '').substring(0, 120)}`;
  if (eventType === 'vector_insert') return `Vector indexed job from ${source}`;
  if (eventType === 'dedup_merge') return `Dedup merge from ${source}`;
  if (eventType === 'board_discovered') return `Board discovered: ${source}`;
  if (eventType === 'board_validation_failed') return `Board validation failed: ${source}`;
  if (eventType === 'agent_search_run') {
    const agentName = details.agentName ?? 'agent';
    const found = details.jobsFound ?? 0;
    const isNew = details.jobsNew ?? 0;
    return details.error
      ? `Agent "${agentName}" failed: ${details.error}`
      : `Agent "${agentName}" found ${found} jobs (${isNew} new)`;
  }
  return `${eventType} — ${source}`;
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
  .handler(async (ctx: any): Promise<{ rows: GroupedActivityLog[]; total: number; summary: SearchLogsSummary }> => {
    const { data } = ctx;
    const user = await resolveSessionUser((ctx as any)?.request);
    if (!user) return EMPTY;

    const env = await getCloudflareEnvAsync();
    if (!env.DB) return EMPTY;

    const page = Math.max(1, data?.page ?? 1);
    const pageSize = Math.min(50, Math.max(1, data?.pageSize ?? 25));
    const offset = (page - 1) * pageSize;

    // Build WHERE for audit_log.
    // By default exclude high-volume internal noise events that aren't meaningful
    // in a user-facing activity log. A specific eventType filter overrides this.
    const EXCLUDED_BY_DEFAULT = [
      'board_validation_failed', // expected discovery noise — 90%+ of guessed slugs fail
      'dedup_merge',             // per-job internal bookkeeping, not actionable
      'crawl_start',             // paired with crawl_complete; start alone is noise
      'vector_insert',           // implementation detail of the crawl pipeline
    ];

    const conditions: string[] = [];
    const params: any[] = [];

    // Event type filter — when set, show exactly that type (overrides exclusion list)
    const requestedType: string = data?.eventType ?? '';
    if (requestedType) {
      conditions.push(`event_type = ?`);
      params.push(requestedType);
    } else {
      // Exclude noise events from the default view
      const placeholders = EXCLUDED_BY_DEFAULT.map(() => '?').join(',');
      conditions.push(`event_type NOT IN (${placeholders})`);
      params.push(...EXCLUDED_BY_DEFAULT);
    }
    // Platform/ATS filter
    if (data?.platform) {
      conditions.push(`ats = ?`);
      params.push(data.platform);
    }
    // Agent name filter (only applies to agent_search_run events)
    if (data?.agentName) {
      conditions.push(`json_extract(details, '$.agentName') LIKE ?`);
      params.push(`%${data.agentName}%`);
    }
    if (data?.dateFrom) {
      conditions.push(`created_at >= ?`);
      params.push(data.dateFrom);
    }
    if (data?.dateTo) {
      conditions.push(`created_at <= ?`);
      params.push(data.dateTo);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Level filter is applied in-memory since it's derived from event_type + details

    const [countResult, rowsResult, errorCount, crawlSummary] = await Promise.all([
      env.DB.prepare(`SELECT COUNT(*) as total FROM audit_log ${where}`)
        .bind(...params)
        .first<{ total: number }>(),

      env.DB.prepare(`
        SELECT id, event_type, ats, board_token, canonical_id, source_id, details, actor, created_at
        FROM audit_log ${where}
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
      `).bind(...params, pageSize, offset)
        .all<{
          id: string;
          event_type: string;
          ats: string | null;
          board_token: string | null;
          canonical_id: string | null;
          source_id: string | null;
          details: string;
          actor: string;
          created_at: string;
        }>(),

      env.DB.prepare(`SELECT COUNT(*) as cnt FROM audit_log WHERE event_type = 'error'`)
        .first<{ cnt: number }>(),

      // Aggregate jobs found/skipped across all crawl_complete events (not just current page)
      env.DB.prepare(`
        SELECT
          SUM(CAST(json_extract(details, '$.insertedCount') AS INTEGER)) as jobs_found,
          SUM(CAST(json_extract(details, '$.mergedCount') AS INTEGER)) as jobs_skipped
        FROM audit_log
        WHERE event_type = 'crawl_complete'
      `).first<{ jobs_found: number | null; jobs_skipped: number | null }>(),
    ]);

    const total = countResult?.total ?? 0;
    const rawRows = rowsResult?.results ?? [];

    let totalJobsFound = 0;
    let totalErrors = 0;

    const grouped: GroupedActivityLog[] = [];

    for (const row of rawRows) {
      let details: Record<string, any> = {};
      try { details = JSON.parse(row.details); } catch { /* ignore */ }

      const hasError = row.event_type === 'error' || !!details.error;
      const level = eventLevel(row.event_type, hasError);

      // Apply level filter in-memory
      if (data?.level && level !== data.level) continue;

      if (hasError) totalErrors++;

      if (row.event_type === 'agent_search_run') {
        const jobsFound: number = details.jobsFound ?? 0;
        totalJobsFound += jobsFound;

        const sourceParts = details.sources
          ? Object.entries(details.sources as Record<string, number>)
              .filter(([, n]) => n > 0)
              .map(([src, n]) => `${src}:${n}`)
              .join(', ')
          : '';

        grouped.push({
          id: row.id,
          type: 'search' as const,
          agentName: details.agentName ?? null,
          platform: sourceParts || null,
          savedSearchId: details.savedSearchId ?? null,
          status: hasError ? 'failed' : 'completed',
          level,
          createdAt: row.created_at,
          completedAt: row.created_at,
          message: crawlEventMessage(row.event_type, null, null, details),
          metadata: {
            keywords: details.keywords,
            jobsFound,
            jobsNew: details.jobsNew ?? 0,
            sources: details.sources ?? {},
            durationMs: details.durationMs ?? null,
            error: details.error ?? null,
          },
          events: [],
        });
      } else {
        // Crawler / discovery event
        const statsFromDetails = {
          fetchedJobs: details.fetchedJobs as number | undefined,
          insertedCount: details.insertedCount as number | undefined,
          mergedCount: details.mergedCount as number | undefined,
          error: details.error as string | undefined,
        };

        grouped.push({
          id: row.id,
          type: 'sync' as const,
          agentName: row.event_type,
          platform: row.ats ?? null,
          status: hasError ? 'failed' : row.event_type === 'crawl_start' ? 'running' : 'completed',
          level,
          createdAt: row.created_at,
          completedAt: hasError || row.event_type !== 'crawl_start' ? row.created_at : null,
          message: crawlEventMessage(row.event_type, row.ats, row.board_token, details),
          metadata: {
            status: hasError ? 'failed' : 'completed',
            completedAt: row.created_at,
            stats: statsFromDetails,
            workerLogs: [],
          },
        });
      }
    }

    const summary: SearchLogsSummary = {
      totalSearches: total,
      totalJobsFound: crawlSummary?.jobs_found ?? totalJobsFound,
      totalJobsSkipped: crawlSummary?.jobs_skipped ?? 0,
      totalErrors: errorCount?.cnt ?? 0,
    };

    return { rows: grouped, total, summary };
  });
