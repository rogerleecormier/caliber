import type { NormalizedJob } from '@/types/crawler';

export interface Env {
  DB: D1Database;
  [key: string]: any;
}

export async function findOrCreateCanonical(
  env: Env,
  dedupKey: string,
  normalized: NormalizedJob
): Promise<{ id: string; isNew: boolean }> {
  // Try to find existing
  const existing = await env.DB.prepare(
    'SELECT id FROM canonical_jobs WHERE dedup_key = ?'
  ).bind(dedupKey).first<{ id: string }>();

  if (existing) {
    return { id: existing.id, isNew: false };
  }

  // Insert new
  const id = crypto.randomUUID();
  await env.DB.prepare(`
    INSERT INTO canonical_jobs (
      id, company_display, company_norm, title_display, title_norm,
      location_display, location_norm, remote, employment_type, experience_level,
      department, team, description_plain, description_html,
      compensation_min, compensation_max, compensation_currency,
      is_listed, dedup_key, first_seen_at, last_seen_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    normalized.companyDisplay,
    normalized.companyNorm,
    normalized.titleDisplay,
    normalized.titleNorm,
    normalized.locationDisplay ?? null,
    normalized.locationNorm ?? null,
    normalized.remote ? 1 : 0,
    normalized.employmentType ?? null,
    normalized.experienceLevel ?? null,
    normalized.department ?? null,
    normalized.team ?? null,
    normalized.descriptionPlain ?? null,
    normalized.descriptionHtml ?? null,
    normalized.compensationMin ?? null,
    normalized.compensationMax ?? null,
    normalized.compensationCurrency ?? null,
    1, // is_listed default true
    dedupKey,
    new Date().toISOString(),
    new Date().toISOString(),
    new Date().toISOString(),
    new Date().toISOString()
  ).run();

  return { id, isNew: true };
}

export async function insertCanonicalJob(
  env: Env,
  id: string,
  normalized: NormalizedJob
): Promise<void> {
  await prepareInsertCanonicalJob(env, id, normalized).run();
}

export function prepareInsertCanonicalJob(
  env: Env,
  id: string,
  normalized: NormalizedJob
): any {
  return env.DB.prepare(`
    INSERT INTO canonical_jobs (
      id, company_display, company_norm, title_display, title_norm,
      location_display, location_norm, remote, employment_type, experience_level,
      department, team, description_plain, description_html,
      compensation_min, compensation_max, compensation_currency,
      is_listed, dedup_key, first_seen_at, last_seen_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).bind(
    id,
    normalized.companyDisplay,
    normalized.companyNorm,
    normalized.titleDisplay,
    normalized.titleNorm,
    normalized.locationDisplay ?? null,
    normalized.locationNorm ?? null,
    normalized.remote ? 1 : 0,
    normalized.employmentType ?? null,
    normalized.experienceLevel ?? null,
    normalized.department ?? null,
    normalized.team ?? null,
    normalized.descriptionPlain ?? null,
    normalized.descriptionHtml ?? null,
    normalized.compensationMin ?? null,
    normalized.compensationMax ?? null,
    normalized.compensationCurrency ?? null,
    1, // is_listed default true
    normalized.dedupKey,
    new Date().toISOString(),
    new Date().toISOString(),
    new Date().toISOString(),
    new Date().toISOString()
  );
}

export async function linkJobSource(
  env: Env,
  canonicalId: string,
  source: {
    ats: string;
    boardToken: string;
    sourceJobId: string;
    sourceUrl: string;
    applyUrl: string;
    rawHash: string;
  }
): Promise<string> {
  const id = crypto.randomUUID();
  await prepareLinkJobSource(env, canonicalId, id, source).run();
  return id;
}

export function prepareLinkJobSource(
  env: Env,
  canonicalId: string,
  id: string,
  source: {
    ats: string;
    boardToken: string;
    sourceJobId: string;
    sourceUrl: string;
    applyUrl: string;
    rawHash: string;
  }
): any {
  return env.DB.prepare(`
    INSERT INTO job_sources (
      id, canonical_id, ats, board_token, source_job_id, source_url, apply_url,
      raw_hash, first_seen_at, last_seen_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(ats, board_token, source_job_id) DO UPDATE SET
      last_seen_at = excluded.last_seen_at,
      updated_at = excluded.updated_at
  `).bind(
    id,
    canonicalId,
    source.ats,
    source.boardToken,
    source.sourceJobId,
    source.sourceUrl,
    source.applyUrl,
    source.rawHash,
    new Date().toISOString(),
    new Date().toISOString(),
    new Date().toISOString(),
    new Date().toISOString()
  );
}

export async function logAudit(
  env: Env,
  event: {
    eventType: string;
    ats?: string | null;
    boardToken?: string | null;
    canonicalId?: string | null;
    sourceId?: string | null;
    details: Record<string, any>;
    actor?: string;
  }
): Promise<void> {
  const id = crypto.randomUUID();
  await prepareLogAudit(env, id, event).run();
}

export function prepareLogAudit(
  env: Env,
  id: string,
  event: {
    eventType: string;
    ats?: string | null;
    boardToken?: string | null;
    canonicalId?: string | null;
    sourceId?: string | null;
    details: Record<string, any>;
    actor?: string;
  }
): any {
  return env.DB.prepare(
    `INSERT INTO audit_log (id, event_type, ats, board_token, canonical_id, source_id, details, actor, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id,
    event.eventType,
    event.ats ?? null,
    event.boardToken ?? null,
    event.canonicalId ?? null,
    event.sourceId ?? null,
    JSON.stringify(event.details),
    event.actor ?? 'system',
    new Date().toISOString()
  );
}
