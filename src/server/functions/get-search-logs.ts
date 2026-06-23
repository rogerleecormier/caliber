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

    const actorPrefix = `user:${user.id}`;

    // Build WHERE clauses
    const conditions: string[] = [
      `event_type = 'agent_search_run'`,
      `actor = ?`,
    ];
    const params: any[] = [actorPrefix];

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

    const where = conditions.join(' AND ');

    const countResult = await env.DB
      .prepare(`SELECT COUNT(*) as total FROM audit_log WHERE ${where}`)
      .bind(...params)
      .first<{ total: number }>();
    const total = countResult?.total ?? 0;

    const { results: rows } = await env.DB
      .prepare(`SELECT id, details, actor, created_at FROM audit_log WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
      .bind(...params, pageSize, offset)
      .all<{ id: string; details: string; actor: string; created_at: string }>();

    let totalJobsFound = 0;
    let totalErrors = 0;

    const grouped: GroupedActivityLog[] = (rows ?? []).map((row) => {
      let details: Record<string, any> = {};
      try { details = JSON.parse(row.details); } catch { /* ignore */ }

      const jobsFound: number = details.jobsFound ?? 0;
      const hasError = !!details.error;
      totalJobsFound += jobsFound;
      if (hasError) totalErrors++;

      const status: 'completed' | 'failed' = hasError ? 'failed' : 'completed';
      const level: 'success' | 'error' = hasError ? 'error' : 'success';

      const sourceParts = details.sources
        ? Object.entries(details.sources as Record<string, number>)
            .filter(([, n]) => n > 0)
            .map(([src, n]) => `${src}:${n}`)
            .join(', ')
        : '';
      const message = hasError
        ? `Agent "${details.agentName}" failed: ${details.error}`
        : `Agent "${details.agentName}" found ${jobsFound} jobs (${details.jobsNew ?? 0} new)${sourceParts ? ` — ${sourceParts}` : ''}`;

      return {
        id: row.id,
        type: 'search' as const,
        agentName: details.agentName ?? null,
        platform: sourceParts || null,
        savedSearchId: details.savedSearchId ?? null,
        status,
        level,
        createdAt: row.created_at,
        completedAt: row.created_at,
        message,
        metadata: {
          keywords: details.keywords,
          jobsFound,
          jobsNew: details.jobsNew ?? 0,
          sources: details.sources ?? {},
          durationMs: details.durationMs ?? null,
          error: details.error ?? null,
        },
        events: [],
      } satisfies GroupedActivityLog;
    });

    const summary: SearchLogsSummary = {
      totalSearches: total,
      totalJobsFound,
      totalJobsSkipped: 0,
      totalErrors,
    };

    return { rows: grouped, total, summary };
  });
