import type { CloudflareEnv } from './cloudflare'
import type { ResumeChunk } from './resume-chunking'
import { chunkFullResume } from './resume-chunking'
import type { SectionType } from './resume-sections'
import { eq, and } from 'drizzle-orm'
import { getDb } from '@/db/db'
import { resumeVectorIndex, resumeSections } from '@/db/schema'

const EMBEDDING_MODEL = '@cf/baai/bge-large-en-v1.5'

export interface ResumeEmbedding {
  vectorId: string
  text: string
  embedding: number[]
  tokens: number
}

async function generateEmbedding(
  env: CloudflareEnv,
  text: string,
): Promise<number[]> {
  if (!env.AI) {
    throw new Error('Cloudflare Workers AI not available')
  }

  const response = await env.AI.run(EMBEDDING_MODEL, {
    text,
  }) as { data: number[] }

  return response.data
}

export async function embedResumeSectionChunks(
  env: CloudflareEnv,
  userId: string,
  sectionType: SectionType,
): Promise<ResumeEmbedding[]> {
  const db = getDb(env.DB)

  const [sectionRow] = await db
    .select()
    .from(resumeSections)
    .where(
      and(
        eq(resumeSections.userId, userId),
        eq(resumeSections.sectionType, sectionType),
      ),
    )
    .limit(1)

  if (!sectionRow) {
    throw new Error(`Resume section not found: ${sectionType}`)
  }

  const chunks = resumeSectionChunks(sectionType, sectionRow.content)
  if (!chunks.length) return []

  const embeddings: ResumeEmbedding[] = []

  for (const chunk of chunks) {
    try {
      const embedding = await generateEmbedding(env, chunk.text)
      const vectorId = `${userId}#${sectionType}#${chunk.chunkIndex}`

      embeddings.push({
        vectorId,
        text: chunk.text,
        embedding,
        tokens: chunk.tokens,
      })

      await db
        .insert(resumeVectorIndex)
        .values({
          userId,
          sectionType,
          chunkIndex: chunk.chunkIndex,
          chunkText: chunk.text,
          vectorId,
          contentHash: chunk.contentHash,
          embeddedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [resumeVectorIndex.userId, resumeVectorIndex.sectionType, resumeVectorIndex.chunkIndex],
          set: {
            chunkText: chunk.text,
            contentHash: chunk.contentHash,
            vectorId,
            embeddedAt: new Date(),
          },
        })
    } catch (error) {
      console.error(`Failed to embed chunk ${chunk.chunkIndex} of ${sectionType}:`, error)
      throw error
    }
  }

  return embeddings
}

export async function embedFullResume(
  env: CloudflareEnv,
  userId: string,
): Promise<Map<string, ResumeEmbedding[]>> {
  const db = getDb(env.DB)
  const sectionTypes: SectionType[] = [
    'professional_summary',
    'core_competencies',
    'technical_skills',
    'professional_experience',
    'education',
    'certifications',
    'personal_projects',
  ]

  const allEmbeddings = new Map<string, ResumeEmbedding[]>()

  for (const sectionType of sectionTypes) {
    try {
      const embeddings = await embedResumeSectionChunks(env, userId, sectionType)
      if (embeddings.length > 0) {
        allEmbeddings.set(sectionType, embeddings)
      }
    } catch (error) {
      console.warn(`Skipped embedding for section ${sectionType}:`, error)
    }
  }

  return allEmbeddings
}

export async function storeEmbeddingsInVectorize(
  env: CloudflareEnv,
  embeddings: ResumeEmbedding[],
): Promise<void> {
  if (!env.VECTORIZE) {
    throw new Error('Vectorize binding not available')
  }

  const vectors = embeddings.map((emb) => ({
    id: emb.vectorId,
    values: emb.embedding,
    metadata: {
      text: emb.text,
      tokens: emb.tokens,
    },
  }))

  await env.VECTORIZE.upsert(vectors)
}

function resumeSectionChunks(sectionType: SectionType, rawContent: string) {
  const { chunkResumeSection } = require('./resume-chunking')
  return chunkResumeSection(sectionType, rawContent)
}
