'use server';

import { createServerFn } from "@tanstack/react-start";
import { getCloudflareEnvAsync } from "@/lib/cloudflare";
import { resolveSessionUser } from "@/lib/resolve-user";

async function requireAdmin(ctx?: any) {
  const user = await resolveSessionUser(ctx?.request);
  if (!user || user.role !== "admin") throw new Error("Unauthorized");
  return user;
}

export const getDiscoveryStats = createServerFn({ method: "GET" }).handler(async (ctx: any) => {
  await requireAdmin(ctx);

  const env = await getCloudflareEnvAsync();
  const db = env.DB;
  if (!db) {
    return {
      stats: { total_boards: 0, validated_boards: 0, active_boards: 0, discovered_last_week: 0, by_phase: [], false_positive_rate: 0 },
      boards: [],
      logs: []
    };
  }

  // 1. Fetch total boards, validated, active, discovered last week
  const overallStats = await db.prepare(`
    SELECT
      COUNT(id) as total_boards,
      SUM(CASE WHEN validated = 1 THEN 1 ELSE 0 END) as validated_boards,
      SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active_boards,
      SUM(CASE WHEN datetime(discovered_at) > datetime('now', '-7 days') THEN 1 ELSE 0 END) as discovered_last_week
    FROM boards
  `).first<any>();

  // 2. Group by discovery phase
  const phaseStats = await db.prepare(`
    SELECT
      COALESCE(discovery_phase, 'manual') as phase,
      COUNT(id) as count,
      ROUND(AVG(discovery_confidence), 2) as avg_confidence
    FROM boards
    GROUP BY discovery_phase
  `).all<any>();

  // 3. False positive rate in past week
  const failureStats = await db.prepare(`
    SELECT
      SUM(CASE WHEN validation_error_count > 0 THEN 1 ELSE 0 END) as validation_failures,
      COUNT(id) as total_count
    FROM boards
    WHERE datetime(discovered_at) > datetime('now', '-7 days')
  `).first<any>();

  const totalCount = failureStats?.total_count ?? 1;
  const validationFailures = failureStats?.validation_failures ?? 0;
  const falsePositiveRate = totalCount > 0 ? (validationFailures / totalCount) : 0;

  // 4. Fetch discovered boards
  const { results: boards } = await db.prepare(`
    SELECT * FROM boards 
    WHERE last_discovered_at IS NOT NULL OR discovery_phase IS NOT NULL OR validated = 1
    ORDER BY last_discovered_at DESC, discovered_at DESC 
    LIMIT 100
  `).all<any>();

  // 5. Fetch audit logs (both discovery and validation failure events)
  const { results: logs } = await db.prepare(`
    SELECT * FROM audit_log 
    WHERE event_type IN ('board_discovered', 'board_validation_failed') 
    ORDER BY created_at DESC 
    LIMIT 30
  `).all<any>();

  return {
    stats: {
      total_boards: overallStats?.total_boards ?? 0,
      validated_boards: overallStats?.validated_boards ?? 0,
      active_boards: overallStats?.active_boards ?? 0,
      discovered_last_week: overallStats?.discovered_last_week ?? 0,
      by_phase: phaseStats.results ?? [],
      false_positive_rate: Number(falsePositiveRate.toFixed(4))
    },
    boards: boards || [],
    logs: (logs || []).map((row: any) => ({
      ...row,
      details: row.details ? JSON.parse(row.details) : {}
    }))
  };
});
