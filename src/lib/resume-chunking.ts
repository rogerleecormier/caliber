import type { SectionType, SectionContent } from './resume-sections'
import { parseSectionContent } from './resume-sections'
import { createHash } from 'crypto'

export interface ResumeChunk {
  sectionType: SectionType
  chunkIndex: number
  text: string
  contentHash: string
  tokens: number
}

const TOKEN_ESTIMATE_RATIO = 0.25 // 1 token ≈ 4 characters (rough estimate)
const CHUNK_TARGET_TOKENS = 250 // Target size per chunk (~1000 chars)
const CHUNK_MAX_TOKENS = 400 // Hard limit per chunk (~1600 chars)

function estimateTokens(text: string): number {
  return Math.ceil(text.length * TOKEN_ESTIMATE_RATIO)
}

function hashContent(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

function cleanText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\n+/g, ' ')
    .trim()
}

function splitByMeaningfulBreak(text: string, maxTokens: number): string[] {
  const cleaned = cleanText(text)

  if (estimateTokens(cleaned) <= maxTokens) {
    return [cleaned]
  }

  const sentences = cleaned.split(/(?<=[.!?])\s+/)
  const chunks: string[] = []
  let currentChunk = ''

  for (const sentence of sentences) {
    const tentative = currentChunk ? `${currentChunk} ${sentence}` : sentence
    const tokens = estimateTokens(tentative)

    if (tokens > maxTokens) {
      if (currentChunk) {
        chunks.push(currentChunk)
        currentChunk = sentence
      } else {
        chunks.push(sentence)
        currentChunk = ''
      }
    } else {
      currentChunk = tentative
    }
  }

  if (currentChunk) chunks.push(currentChunk)
  return chunks
}

export function chunkResumeSection(
  sectionType: SectionType,
  rawContent: string,
): ResumeChunk[] {
  const content = parseSectionContent(sectionType, rawContent)

  if (sectionType === 'professional_summary') {
    const text = content as string
    if (!text) return []
    const chunks = splitByMeaningfulBreak(text, CHUNK_MAX_TOKENS)
    return chunks.map((chunk, idx) => ({
      sectionType,
      chunkIndex: idx,
      text: chunk,
      contentHash: hashContent(chunk),
      tokens: estimateTokens(chunk),
    }))
  }

  if (sectionType === 'core_competencies') {
    const skills = (content as string[]).filter(Boolean)
    if (!skills.length) return []

    let chunks: string[] = []
    let currentChunk: string[] = []
    let currentTokens = 0

    for (const skill of skills) {
      const tokens = estimateTokens(skill)
      if (currentTokens + tokens > CHUNK_MAX_TOKENS && currentChunk.length) {
        chunks.push(currentChunk.join(', '))
        currentChunk = [skill]
        currentTokens = tokens
      } else {
        currentChunk.push(skill)
        currentTokens += tokens
      }
    }

    if (currentChunk.length) {
      chunks.push(currentChunk.join(', '))
    }

    return chunks.map((chunk, idx) => ({
      sectionType,
      chunkIndex: idx,
      text: `Core competencies: ${chunk}`,
      contentHash: hashContent(chunk),
      tokens: estimateTokens(chunk),
    }))
  }

  if (sectionType === 'technical_skills') {
    const categories = content as Array<{ category: string; skills: string[] }>
    const chunks: string[] = []

    for (const cat of categories) {
      const catText = `${cat.category}: ${cat.skills.join(', ')}`
      chunks.push(catText)
    }

    return chunks.map((chunk, idx) => ({
      sectionType,
      chunkIndex: idx,
      text: chunk,
      contentHash: hashContent(chunk),
      tokens: estimateTokens(chunk),
    }))
  }

  if (sectionType === 'professional_experience') {
    const experiences = content as Array<{
      title: string
      company: string
      dates?: string
      bullets?: string[]
    }>

    return experiences.map((exp, idx) => {
      const bullets = (exp.bullets || []).join(' ')
      const text = `${exp.title} at ${exp.company}${exp.dates ? ` (${exp.dates})` : ''}. ${bullets}`.trim()
      const cleaned = cleanText(text)

      return {
        sectionType,
        chunkIndex: idx,
        text: cleaned,
        contentHash: hashContent(cleaned),
        tokens: estimateTokens(cleaned),
      }
    })
  }

  if (sectionType === 'education') {
    const entries = content as Array<{
      degree: string
      institution: string
      fieldOfStudy?: string
      graduationDate?: string
    }>

    return entries.map((edu, idx) => {
      const field = edu.fieldOfStudy ? ` in ${edu.fieldOfStudy}` : ''
      const text = `${edu.degree}${field} from ${edu.institution}${edu.graduationDate ? ` (${edu.graduationDate})` : ''}`.trim()

      return {
        sectionType,
        chunkIndex: idx,
        text,
        contentHash: hashContent(text),
        tokens: estimateTokens(text),
      }
    })
  }

  if (sectionType === 'certifications') {
    const certs = (content as string[]).filter(Boolean)
    if (!certs.length) return []

    let chunks: string[] = []
    let currentChunk: string[] = []
    let currentTokens = 0

    for (const cert of certs) {
      const tokens = estimateTokens(cert)
      if (currentTokens + tokens > CHUNK_MAX_TOKENS && currentChunk.length) {
        chunks.push(currentChunk.join(', '))
        currentChunk = [cert]
        currentTokens = tokens
      } else {
        currentChunk.push(cert)
        currentTokens += tokens
      }
    }

    if (currentChunk.length) {
      chunks.push(currentChunk.join(', '))
    }

    return chunks.map((chunk, idx) => ({
      sectionType,
      chunkIndex: idx,
      text: `Certifications: ${chunk}`,
      contentHash: hashContent(chunk),
      tokens: estimateTokens(chunk),
    }))
  }

  if (sectionType === 'personal_projects') {
    const projects = content as Array<{
      name: string
      description: string
      technologies?: string[]
    }>

    return projects.map((proj, idx) => {
      const tech = proj.technologies ? ` (${proj.technologies.join(', ')})` : ''
      const text = `${proj.name}: ${proj.description}${tech}`.trim()

      return {
        sectionType,
        chunkIndex: idx,
        text: cleanText(text),
        contentHash: hashContent(text),
        tokens: estimateTokens(text),
      }
    })
  }

  return []
}

export function chunkFullResume(
  sections: Array<{ sectionType: SectionType; content: string }>,
): ResumeChunk[] {
  const allChunks: ResumeChunk[] = []

  for (const section of sections) {
    const chunks = chunkResumeSection(section.sectionType, section.content)
    allChunks.push(...chunks)
  }

  return allChunks
}
