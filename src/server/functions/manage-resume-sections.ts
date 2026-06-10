'use server'
import { createServerFn } from '@tanstack/react-start'
import { eq, and } from 'drizzle-orm'
import { resolveSessionUser } from '@/lib/resolve-user'
import { getCloudflareEnv } from '@/lib/cloudflare'
import { getDb } from '@/db/db'
import { resumeSections } from '@/db/schema'
import {
  type SectionType,
  type SectionContent,
  parseSectionContent,
  serializeSectionContent,
} from '@/lib/resume-sections'

export interface ResumeData {
  id?: number
  fullName: string
  email?: string
  phone?: string
  linkedin?: string
  website?: string
  summary?: string
  competencies?: string[]
  tools?: string[]
  experience?: SectionContent['professional_experience']
  education?: SectionContent['education']
  certifications?: string[]
  personalProjects?: SectionContent['personal_projects']
  awards?: string[]
  rawText?: string
  updatedAt?: string
}

export const getResumeSections = createServerFn({ method: 'GET' }).handler(
  async (_, { request }): Promise<Partial<Record<SectionType, any>>> => {
    try {
      const env = getCloudflareEnv()
      if (!env.DB) return {}
      const user = await resolveSessionUser(request)
      if (!user) return {}

      const db = getDb(env.DB)
      const sections = await db
        .select()
        .from(resumeSections)
        .where(eq(resumeSections.userId, user.id))

      const result: Partial<Record<SectionType, any>> = {}
      for (const section of sections) {
        const type = section.sectionType as SectionType
        result[type] = parseSectionContent(type, section.content)
      }

      return result
    } catch (err) {
      console.error('[getResumeSections] error:', err)
      return {}
    }
  },
)

export const upsertResumeSection = createServerFn({ method: 'POST' })
  .inputValidator(
    (data: { sectionType: SectionType; content: any }) => data,
  )
  .handler(async ({ data }, { request }): Promise<{ success: boolean }> => {
    const env = getCloudflareEnv()
    if (!env.DB) throw new Error('Database not available')

    const user = await resolveSessionUser(request)
    if (!user) throw new Error('Not authenticated')

    const db = getDb(env.DB)
    const now = new Date().toISOString()

    const serialized = serializeSectionContent(data.sectionType, data.content)

    // Check if section exists for this user
    const existing = await db
      .select()
      .from(resumeSections)
      .where(
        and(
          eq(resumeSections.userId, user.id),
          eq(resumeSections.sectionType, data.sectionType),
        ),
      )
      .limit(1)

    if (existing.length > 0) {
      // Update existing
      await db
        .update(resumeSections)
        .set({
          content: serialized,
          updatedAt: now,
        })
        .where(eq(resumeSections.id, existing[0].id))
    } else {
      // Insert new
      await db.insert(resumeSections).values({
        userId: user.id,
        sectionType: data.sectionType,
        content: serialized,
        updatedAt: now,
      })
    }

    return { success: true }
  })

export const upsertAllResumeSections = createServerFn({ method: 'POST' })
  .inputValidator((data: ResumeData) => data)
  .handler(async ({ data }, { request }): Promise<{ success: boolean }> => {
    const env = getCloudflareEnv()
    if (!env.DB) throw new Error('Database not available')

    const user = await resolveSessionUser(request)
    if (!user) throw new Error('Not authenticated')

    const db = getDb(env.DB)
    const now = new Date().toISOString()

    try {
      const sections: Array<{
        sectionType: SectionType
        content: any
      }> = []

      if (data.summary !== undefined)
        sections.push({
          sectionType: 'professional_summary',
          content: data.summary,
        })
      if (data.competencies !== undefined)
        sections.push({
          sectionType: 'core_competencies',
          content: data.competencies,
        })
      if (data.tools !== undefined)
        sections.push({
          sectionType: 'technical_skills',
          content: data.tools,
        })
      if (data.experience !== undefined)
        sections.push({
          sectionType: 'professional_experience',
          content: data.experience,
        })
      if (data.personalProjects !== undefined)
        sections.push({
          sectionType: 'personal_projects',
          content: data.personalProjects,
        })
      if (data.education !== undefined)
        sections.push({
          sectionType: 'education',
          content: data.education,
        })
      if (data.certifications !== undefined)
        sections.push({
          sectionType: 'certifications',
          content: data.certifications,
        })
      if (data.awards !== undefined)
        sections.push({
          sectionType: 'awards',
          content: data.awards,
        })

      // Upsert all sections
      for (const section of sections) {
        const serialized = serializeSectionContent(
          section.sectionType,
          section.content,
        )

        const existing = await db
          .select()
          .from(resumeSections)
          .where(
            and(
              eq(resumeSections.userId, user.id),
              eq(resumeSections.sectionType, section.sectionType),
            ),
          )
          .limit(1)

        if (existing.length > 0) {
          await db
            .update(resumeSections)
            .set({
              content: serialized,
              updatedAt: now,
            })
            .where(eq(resumeSections.id, existing[0].id))
        } else {
          await db.insert(resumeSections).values({
            userId: user.id,
            sectionType: section.sectionType,
            content: serialized,
            updatedAt: now,
          })
        }
      }

      return { success: true }
    } catch (error) {
      console.error('[upsertAllResumeSections] error:', error)
      throw error
    }
  })
