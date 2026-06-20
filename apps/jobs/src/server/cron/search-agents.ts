import { and, eq, lt } from "drizzle-orm";
import { getDb, schema } from "@/db/db";
import type { CloudflareEnv } from "@/lib/cloudflare";
import { getSearchAgentSettings } from "@/lib/app-settings";
import { runSearchAgent, type RunAgentResult } from "@/server/functions/run-search-agent";

const FREQUENCY_HOURS: Record<string, number> = {
  hourly: 1,
  every_2_hours: 2,
  every_4_hours: 4,
  every_8_hours: 8,
  every_12_hours: 12,
  daily: 24,
};

function shouldRunFrequency(lastRunAt: string | null, frequency: string, varianceMinutes: number) {
  if (!lastRunAt) return true;
  const intervalHours = FREQUENCY_HOURS[frequency] ?? 24;
  const varianceMs = Math.floor(Math.random() * varianceMinutes * 60 * 1000);
  const thresholdMs = intervalHours * 60 * 60 * 1000 - varianceMs;
  return Date.now() - new Date(lastRunAt).getTime() >= thresholdMs;
}

// Drop archived per-user rows past the retention window (keeps user_jobs tidy).
async function pruneArchivedUserJobs(env: CloudflareEnv, retentionDays: number): Promise<number> {
  const db = getDb(env.DB);
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();
  const deleted = await db
    .delete(schema.userJobs)
    .where(and(eq(schema.userJobs.status, "Archived"), lt(schema.userJobs.updatedAt, cutoff)))
    .returning({ id: schema.userJobs.id });
  return deleted.length;
}

/**
 * Run all due search agents against the canonical jobs DB. No browser scraping — agents
 * query the canonical DB (fed by the crawler/discovery agents) and LLM-score vs the resume.
 */
export async function runSearchAgentMaintenance(
  env: CloudflareEnv,
): Promise<{ executedAgents: number; prunedArchived: number; results: RunAgentResult[] }> {
  const settings = await getSearchAgentSettings();
  const db = getDb(env.DB);

  const prunedArchived = settings.autoPrune
    ? await pruneArchivedUserJobs(env, settings.jobRetentionDays)
    : 0;

  const agents = await db
    .select()
    .from(schema.searchAgents)
    .where(eq(schema.searchAgents.isActive, 1));

  const due = agents.filter((a) =>
    shouldRunFrequency(a.lastRunAt ?? null, settings.searchCronFrequency, settings.cronVarianceMinutes),
  );

  const results: RunAgentResult[] = [];
  for (const agent of due) {
    try {
      results.push(await runSearchAgent(db, env, agent));
    } catch (err) {
      console.error(`[search-agents] agent ${agent.id} failed:`, err);
    }
  }

  return { executedAgents: due.length, prunedArchived, results };
}
