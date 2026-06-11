'use server';
import { createServerFn } from "@tanstack/react-start";

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

// Activity logging (search_logs table) was deprecated in the normalized-jobs unification.
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
  .handler(async (): Promise<{ rows: GroupedActivityLog[]; total: number; summary: SearchLogsSummary }> => {
    return {
      rows: [],
      total: 0,
      summary: { totalSearches: 0, totalJobsFound: 0, totalJobsSkipped: 0, totalErrors: 0 },
    };
  });
