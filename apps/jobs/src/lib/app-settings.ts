import { eq } from "drizzle-orm";
import { getDb } from "@/db/db";
import { appSettings, type AppSettings } from "@/db/schema";
import { getCloudflareEnv } from "@/lib/cloudflare";

export type SearchCronFrequency =
  | "hourly" | "every_2_hours" | "every_4_hours" | "every_8_hours" | "every_12_hours" | "daily";

export type SearchAgentSettings = {
  searchCronFrequency: SearchCronFrequency;
  cronStartHour: number;
  cronVarianceMinutes: number;
  jobRetentionDays: number;
  autoPrune: boolean;
  updatedAt: string;
};

const DEFAULT_SETTINGS: SearchAgentSettings = {
  searchCronFrequency: "daily",
  cronStartHour: 9,
  cronVarianceMinutes: 20,
  jobRetentionDays: 30,
  autoPrune: true,
  updatedAt: new Date(0).toISOString(),
};

function normalize(row?: AppSettings | null): SearchAgentSettings {
  if (!row) return { ...DEFAULT_SETTINGS, updatedAt: new Date().toISOString() };
  return {
    searchCronFrequency: (row.searchCronFrequency as SearchCronFrequency) ?? DEFAULT_SETTINGS.searchCronFrequency,
    cronStartHour: row.cronStartHour ?? DEFAULT_SETTINGS.cronStartHour,
    cronVarianceMinutes: row.cronVarianceMinutes ?? DEFAULT_SETTINGS.cronVarianceMinutes,
    jobRetentionDays: row.jobRetentionDays ?? DEFAULT_SETTINGS.jobRetentionDays,
    autoPrune: row.autoPrune === 1,
    updatedAt: row.updatedAt,
  };
}

export async function getSearchAgentSettings(): Promise<SearchAgentSettings> {
  const env = getCloudflareEnv();
  if (!env.DB) return DEFAULT_SETTINGS;
  const db = getDb(env.DB);
  const [row] = await db.select().from(appSettings).where(eq(appSettings.id, 1)).limit(1);
  return normalize(row);
}

export async function saveSearchAgentSettings(
  input: Partial<SearchAgentSettings>,
): Promise<SearchAgentSettings> {
  const env = getCloudflareEnv();
  if (!env.DB) throw new Error("Database unavailable");
  const db = getDb(env.DB);
  const existing = await getSearchAgentSettings();
  const next: SearchAgentSettings = {
    searchCronFrequency: input.searchCronFrequency ?? existing.searchCronFrequency,
    cronStartHour: Math.max(0, Math.min(23, input.cronStartHour ?? existing.cronStartHour)),
    cronVarianceMinutes: Math.max(0, Math.min(59, input.cronVarianceMinutes ?? existing.cronVarianceMinutes)),
    jobRetentionDays: Math.max(1, Math.min(365, input.jobRetentionDays ?? existing.jobRetentionDays)),
    autoPrune: input.autoPrune ?? existing.autoPrune,
    updatedAt: new Date().toISOString(),
  };

  const values = {
    searchCronFrequency: next.searchCronFrequency,
    cronStartHour: next.cronStartHour,
    cronVarianceMinutes: next.cronVarianceMinutes,
    jobRetentionDays: next.jobRetentionDays,
    autoPrune: next.autoPrune ? 1 : 0,
    updatedAt: next.updatedAt,
  };

  await db
    .insert(appSettings)
    .values({ id: 1, ...values })
    .onConflictDoUpdate({ target: appSettings.id, set: values });

  return next;
}
