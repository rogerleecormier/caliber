import type { CloudflareEnv } from './cloudflare'
import type { ResumeEmbedding } from './resume-embedding'

const EMBEDDING_MODEL = '@cf/baai/bge-large-en-v1.5'
const SIMILARITY_THRESHOLD = 0.3 // Minimum cosine similarity to include chunk
const MAX_CONTEXT_CHUNKS = 5 // Top N chunks for ground truth
const DIVERSITY_THRESHOLD = 0.7 // Min similarity between selected chunks to avoid redundancy

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) throw new Error('Vectors must have same dimension')

  let dotProduct = 0
  let magA = 0
  let magB = 0

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i]
    magA += a[i] * a[i]
    magB += b[i] * b[i]
  }

  magA = Math.sqrt(magA)
  magB = Math.sqrt(magB)

  if (magA === 0 || magB === 0) return 0
  return dotProduct / (magA * magB)
}

function diversifyChunks(
  ranked: Array<{ embedding: ResumeEmbedding; score: number }>,
  maxCount: number,
): ResumeEmbedding[] {
  if (ranked.length === 0) return []

  const selected: ResumeEmbedding[] = [ranked[0].embedding]

  for (let i = 1; i < ranked.length && selected.length < maxCount; i++) {
    const candidate = ranked[i].embedding
    let isDiverse = true

    for (const existing of selected) {
      const similarity = cosineSimilarity(candidate.embedding, existing.embedding)
      if (similarity > DIVERSITY_THRESHOLD) {
        isDiverse = false
        break
      }
    }

    if (isDiverse) {
      selected.push(candidate)
    }
  }

  return selected
}

export interface GroundTruthContext {
  chunks: Array<{
    text: string
    sectionType: string
    similarity: number
  }>
  averageSimilarity: number
  totalTokens: number
}

export async function matchJobDescriptionToResume(
  env: CloudflareEnv,
  jobDescription: string,
  resumeEmbeddings: ResumeEmbedding[],
): Promise<GroundTruthContext> {
  if (!env.AI) {
    throw new Error('Cloudflare Workers AI not available')
  }

  if (resumeEmbeddings.length === 0) {
    return {
      chunks: [],
      averageSimilarity: 0,
      totalTokens: 0,
    }
  }

  const jobEmbedding = await (env.AI.run('@cf/baai/bge-large-en-v1.5', {
    text: jobDescription,
  }) as Promise<{ data: number[] }>).then((r) => r.data)

  const similarities = resumeEmbeddings.map((emb) => ({
    embedding: emb,
    score: cosineSimilarity(jobEmbedding, emb.embedding),
  }))

  const filtered = similarities
    .filter((s) => s.score >= SIMILARITY_THRESHOLD)
    .sort((a, b) => b.score - a.score)

  const selected = diversifyChunks(filtered, MAX_CONTEXT_CHUNKS)

  if (selected.length === 0) {
    return {
      chunks: [],
      averageSimilarity: 0,
      totalTokens: 0,
    }
  }

  const chunks = selected.map((emb) => {
    const score = similarities.find((s) => s.embedding.vectorId === emb.vectorId)?.score ?? 0
    return {
      text: emb.text,
      sectionType: emb.vectorId.split('#')[1] || 'unknown',
      similarity: score,
    }
  })

  const avgSimilarity = chunks.reduce((sum, c) => sum + c.similarity, 0) / chunks.length
  const totalTokens = selected.reduce((sum, emb) => sum + emb.tokens, 0)

  return {
    chunks,
    averageSimilarity: avgSimilarity,
    totalTokens,
  }
}

export function formatGroundTruthContext(context: GroundTruthContext): string {
  if (context.chunks.length === 0) {
    return 'No matching resume content found.'
  }

  const formatted = context.chunks
    .map(
      (chunk, idx) =>
        `[Resume Context ${idx + 1} - ${chunk.sectionType} (${(chunk.similarity * 100).toFixed(1)}% match)]:\n${chunk.text}`,
    )
    .join('\n\n')

  return formatted
}
