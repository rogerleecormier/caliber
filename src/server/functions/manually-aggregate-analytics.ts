'use server';
import { createServerFn } from "@tanstack/react-start";
import { getCloudflareEnv } from "@/lib/cloudflare";
import type { CloudflareEnv } from "@/lib/cloudflare";
import { aggregateAnalytics } from "@/server/cron/aggregate-analytics";

export const manuallyAggregateAnalytics = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ success: boolean; message?: string; error?: string }> => {
    try {
      const env = getCloudflareEnv();
      if (!env.DB) return { success: false, error: "Database not available" };
      await aggregateAnalytics(env as CloudflareEnv);
      return { success: true, message: "Analytics aggregated successfully" };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error("[manuallyAggregateAnalytics] error:", msg);
      return { success: false, error: msg };
    }
  },
);
