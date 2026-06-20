// Vectorize-backed semantic matching for jobs and user profiles.
// Embeddings via Workers AI bge-base-en-v1.5 (768-dim). One shared index holds both job
// vectors (id "job:{id}", metadata.kind="job") and profile vectors (id "user:{id}",
// metadata.kind="profile").

import { EMBEDDING_MODEL } from "./types";

// Minimal structural types so this compiles without @cloudflare/workers-types in scope.
export interface VectorizeLike {
  upsert: (vectors: Array<{ id: string; values: number[]; metadata?: Record<string, any> }>) => Promise<unknown>;
  query: (
    vector: number[],
    opts: { topK?: number; filter?: Record<string, any>; returnMetadata?: boolean | "all" | "none" },
  ) => Promise<{ matches: Array<{ id: string; score: number; metadata?: Record<string, any> }> }>;
  getByIds: (ids: string[]) => Promise<Array<{ id: string; values?: number[]; metadata?: Record<string, any> }>>;
  deleteByIds?: (ids: string[]) => Promise<unknown>;
}

export interface AiLike {
  run: (model: string, options: any) => Promise<any>;
}

const MAX_EMBED_CHARS = 4000;

/** Embed a batch of texts → array of 768-dim vectors. */
export async function embedTexts(ai: AiLike, texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const clean = texts.map((t) => (t || "").slice(0, MAX_EMBED_CHARS) || " ");
  const res: any = await ai.run(EMBEDDING_MODEL, { text: clean });
  // bge returns { shape, data: number[][] }
  const data = res?.data ?? res?.result?.data;
  if (!Array.isArray(data)) throw new Error("Unexpected embedding response shape");
  return data as number[][];
}

export async function embedText(ai: AiLike, text: string): Promise<number[]> {
  const [vec] = await embedTexts(ai, [text]);
  return vec;
}

/** Compose the text used to embed a job. */
export function jobEmbeddingText(job: {
  title: string;
  company?: string | null;
  description?: string | null;
  location?: string | null;
}): string {
  return [
    job.title,
    job.company ? `at ${job.company}` : "",
    job.location || "",
    (job.description || "").slice(0, 3000),
  ]
    .filter(Boolean)
    .join("\n");
}

export interface JobVectorInput {
  id: number;
  title: string;
  company?: string | null;
  description?: string | null;
  location?: string | null;
  remoteType?: string | null;
  salaryMin?: number | null;
  seniorityLevel?: string | null;
  sourceName?: string | null;
  postDate?: Date | number | null;
}

function toEpoch(d: Date | number | null | undefined): number {
  if (d == null) return 0;
  if (typeof d === "number") return d;
  return Math.floor(d.getTime() / 1000);
}

/** Embed and upsert job vectors with filterable metadata. */
export async function upsertJobVectors(
  vectorize: VectorizeLike,
  ai: AiLike,
  jobs: JobVectorInput[],
): Promise<number> {
  if (jobs.length === 0) return 0;
  const vectors = await embedTexts(ai, jobs.map((j) => jobEmbeddingText(j)));
  const records = jobs.map((j, i) => ({
    id: `job:${j.id}`,
    values: vectors[i],
    metadata: {
      kind: "job",
      jobId: j.id,
      remoteType: j.remoteType ?? "unknown",
      salaryMin: j.salaryMin ?? 0,
      seniority: j.seniorityLevel ?? "unknown",
      source: j.sourceName ?? "unknown",
      postDate: toEpoch(j.postDate),
    },
  }));
  await vectorize.upsert(records);
  return records.length;
}

/** Embed and upsert the user's profile vector. Returns the vector for immediate querying. */
export async function upsertProfileVector(
  vectorize: VectorizeLike,
  ai: AiLike,
  userId: number,
  profileText: string,
): Promise<number[]> {
  const values = await embedText(ai, profileText);
  await vectorize.upsert([
    { id: `user:${userId}`, values, metadata: { kind: "profile", userId } },
  ]);
  return values;
}

/** Fetch a stored profile vector, or compute+store it from profileText if missing. */
export async function getProfileVector(
  vectorize: VectorizeLike,
  ai: AiLike,
  userId: number,
  profileText?: string | null,
): Promise<number[] | null> {
  try {
    const existing = await vectorize.getByIds([`user:${userId}`]);
    if (existing?.[0]?.values?.length) return existing[0].values!;
  } catch {
    // fall through to recompute
  }
  if (profileText) return upsertProfileVector(vectorize, ai, userId, profileText);
  return null;
}

export interface JobVectorMatch {
  jobId: number;
  score: number; // cosine similarity 0..1
}

/** Query the most semantically similar jobs to a profile/query vector. */
export async function queryJobVectors(
  vectorize: VectorizeLike,
  vector: number[],
  opts: { topK?: number; filter?: Record<string, any> } = {},
): Promise<JobVectorMatch[]> {
  const result = await vectorize.query(vector, {
    topK: opts.topK ?? 100,
    filter: { kind: "job", ...(opts.filter || {}) },
    returnMetadata: "all",
  });
  return (result.matches || [])
    .map((m) => ({
      jobId: Number(m.metadata?.jobId ?? m.id.replace(/^job:/, "")),
      score: m.score,
    }))
    .filter((m) => Number.isFinite(m.jobId));
}
