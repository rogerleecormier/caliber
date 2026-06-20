import { and, desc, eq, gte, inArray, isNull, like, not, or } from "drizzle-orm";
import type { DrizzleD1Database } from "@/db/db";
import { schema } from "@/db/db";
import type { CloudflareEnv } from "@/lib/cloudflare";
import { getUserProfile, type UserProfile } from "@/lib/user-profile";
import { scoreJobAgainstProfile } from "@/lib/ai/job-score";
import { getProfileVector, queryJobVectors, type VectorizeLike, type AiLike } from "@/lib/ai/embeddings";

export const MAX_SCORES_PER_RUN = 25;
const VECTOR_RECALL = 150;

/** Tolerant criteria shape — accepts both the new agent format and legacy LinkedInSearchParams. */
export interface SearchAgentCriteria {
  keywords?: string;
  titles?: string[];
  location?: string;
  remotePreference?: string; // 'remote' | 'hybrid' | 'onsite' | 'any'
  salaryMin?: number;
  seniority?: string;
  employmentType?: string[];
  sources?: string[];
  categoryIds?: number[];
  excludes?: string[];
}

const REMOTE_TYPE_MAP: Record<string, string[]> = {
  remote: ["fully_remote", "remote"],
  hybrid: ["hybrid"],
  onsite: ["on_site", "onsite", "office"],
};

export function parseAgentCriteria(raw: string): SearchAgentCriteria {
  let parsed: any = {};
  try {
    parsed = JSON.parse(raw) || {};
  } catch {
    return { keywords: raw };
  }
  // Map legacy LinkedInSearchParams fields onto the agent criteria.
  const remoteFromWorkplace = Array.isArray(parsed.workplaceTypes)
    ? (parsed.workplaceTypes.includes("remote")
        ? "remote"
        : parsed.workplaceTypes.includes("hybrid")
          ? "hybrid"
          : parsed.workplaceTypes.includes("on-site")
            ? "onsite"
            : undefined)
    : undefined;
  return {
    keywords: parsed.keywords ?? parsed.query ?? undefined,
    titles: parsed.titles,
    location: parsed.location,
    remotePreference: parsed.remotePreference ?? remoteFromWorkplace,
    salaryMin: parsed.salaryMin,
    seniority: parsed.seniority ?? (Array.isArray(parsed.experienceLevels) ? parsed.experienceLevels[0] : undefined),
    employmentType: parsed.employmentType ?? parsed.jobTypes,
    sources: parsed.sources,
    categoryIds: parsed.categoryIds,
    excludes: parsed.excludes ?? parsed.excludeTerms,
  };
}

/** Build the D1 WHERE conditions shared by SQL recall and the vector post-filter. */
function buildJobConditions(criteria: SearchAgentCriteria, prefs: UserProfile["preferences"]) {
  const conditions: any[] = [];

  const keywordTerms = [criteria.keywords, ...(criteria.titles || [])].filter(Boolean) as string[];
  if (keywordTerms.length > 0) {
    conditions.push(
      or(
        ...keywordTerms.flatMap((term) => [
          like(schema.jobs.title, `%${term}%`),
          like(schema.jobs.company, `%${term}%`),
        ]),
      ),
    );
  }

  if (criteria.location) conditions.push(like(schema.jobs.location, `%${criteria.location}%`));

  const remotePref = criteria.remotePreference ?? prefs.remotePreference ?? undefined;
  if (remotePref && remotePref !== "any" && REMOTE_TYPE_MAP[remotePref]) {
    conditions.push(inArray(schema.jobs.remoteType, REMOTE_TYPE_MAP[remotePref]));
  }

  const salaryMin = criteria.salaryMin ?? prefs.salaryMin ?? undefined;
  if (salaryMin) {
    // Keep jobs with no salary info too (don't over-filter on missing data).
    conditions.push(or(gte(schema.jobs.salaryMax, salaryMin), isNull(schema.jobs.salaryMax)));
  }

  if (criteria.seniority) conditions.push(eq(schema.jobs.seniorityLevel, criteria.seniority));
  if (criteria.sources && criteria.sources.length > 0)
    conditions.push(inArray(schema.jobs.sourceName, criteria.sources));
  if (criteria.categoryIds && criteria.categoryIds.length > 0)
    conditions.push(inArray(schema.jobs.categoryId, criteria.categoryIds));

  const excludeTerms = [...(criteria.excludes || []), ...prefs.excludedKeywords];
  for (const term of excludeTerms) {
    if (term) conditions.push(not(like(schema.jobs.title, `%${term}%`)));
  }
  for (const company of prefs.excludedCompanies) {
    if (company) conditions.push(not(like(schema.jobs.company, `%${company}%`)));
  }

  return conditions;
}

/** Select canonical jobs matching the criteria, ranked by vector similarity when available. */
async function selectCandidateJobs(args: {
  db: DrizzleD1Database;
  env: Partial<CloudflareEnv>;
  criteria: SearchAgentCriteria;
  profile: UserProfile;
  userId: number;
  excludeJobIds: Set<number>;
  limit: number;
}): Promise<schema.Job[]> {
  const { db, env, criteria, profile, excludeJobIds, limit } = args;
  const conditions = buildJobConditions(criteria, profile.preferences);
  const where = conditions.length > 0 ? and(...conditions) : undefined;

  // Vector ranking path (preferred): recall by similarity, then apply hard SQL filters.
  if (env.VECTORIZE && env.AI && profile.text) {
    try {
      const vector = await getProfileVector(
        env.VECTORIZE as unknown as VectorizeLike,
        env.AI as unknown as AiLike,
        args.userId,
        profile.text,
      );
      if (vector) {
        const matches = await queryJobVectors(env.VECTORIZE as unknown as VectorizeLike, vector, {
          topK: VECTOR_RECALL,
        });
        const rankedIds = matches
          .map((m) => m.jobId)
          .filter((id) => !excludeJobIds.has(id));
        if (rankedIds.length > 0) {
          const rows = await db
            .select()
            .from(schema.jobs)
            .where(where ? and(where, inArray(schema.jobs.id, rankedIds)) : inArray(schema.jobs.id, rankedIds));
          const order = new Map(rankedIds.map((id, i) => [id, i]));
          rows.sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9));
          if (rows.length > 0) return rows.slice(0, limit);
        }
      }
    } catch (err) {
      console.error("[search-agent] vector recall failed, falling back to SQL:", err);
    }
  }

  // SQL fallback: most recent matching jobs.
  const rows = await db
    .select()
    .from(schema.jobs)
    .where(where)
    .orderBy(desc(schema.jobs.postDate))
    .limit(limit + excludeJobIds.size);
  return rows.filter((j) => !excludeJobIds.has(j.id)).slice(0, limit);
}

export interface RunAgentResult {
  agentId: number;
  scored: number;
  autoFavorited: number;
}

/** Run one search agent: select candidates, LLM-score vs resume, persist + auto-favorite. */
export async function runSearchAgent(
  db: DrizzleD1Database,
  env: Partial<CloudflareEnv>,
  agent: schema.SearchAgent,
): Promise<RunAgentResult> {
  const now = new Date().toISOString();
  const criteria = parseAgentCriteria(agent.criteria);
  const profile = await getUserProfile(db, agent.userId);

  // Exclude jobs already tracked for this user.
  const existing = await db
    .select({ jobId: schema.userJobs.jobId })
    .from(schema.userJobs)
    .where(eq(schema.userJobs.userId, agent.userId));
  const excludeJobIds = new Set(existing.map((e) => e.jobId));

  const candidates = await selectCandidateJobs({
    db,
    env,
    criteria,
    profile,
    userId: agent.userId,
    excludeJobIds,
    limit: MAX_SCORES_PER_RUN,
  });

  let scored = 0;
  let autoFavorited = 0;

  if (profile.text && env.AI) {
    for (const job of candidates) {
      try {
        const result = await scoreJobAgainstProfile(env.AI as any, profile.text, {
          id: String(job.id),
          title: job.title,
          description: job.description || job.descriptionRaw || job.fullDescription || job.title,
        });
        const isFav = result.masterScore >= agent.autoFavoriteThreshold;
        await db
          .insert(schema.userJobs)
          .values({
            userId: agent.userId,
            jobId: job.id,
            relationship: "agent",
            favorited: isFav,
            autoFavorited: isFav,
            searchAgentId: agent.id,
            atsScore: result.atsScore,
            careerScore: result.careerScore,
            outlookScore: result.outlookScore,
            masterScore: result.masterScore,
            atsReason: result.atsReason,
            careerReason: result.careerReason,
            outlookReason: result.outlookReason,
            isUnicorn: result.isUnicorn,
            unicornReason: result.unicornReason,
            status: "Analyzed",
            scoredAt: now,
            createdAt: now,
            updatedAt: now,
          })
          .onConflictDoNothing();
        scored++;
        if (isFav) autoFavorited++;
      } catch (err) {
        console.error(`[search-agent] scoring failed for job ${job.id}:`, err);
      }
    }
  }

  await db
    .update(schema.searchAgents)
    .set({ lastRunAt: now, updatedAt: now })
    .where(eq(schema.searchAgents.id, agent.id));

  return { agentId: agent.id, scored, autoFavorited };
}
