export type SectionType =
  | 'professional_summary'
  | 'core_competencies'
  | 'technical_skills'
  | 'professional_experience'
  | 'personal_projects'
  | 'education'
  | 'awards'

export interface ExperienceEntry {
  title: string
  company: string
  startDate?: string
  endDate?: string
  dates?: string
  description?: string
  bullets?: string[]
}

export interface EducationEntry {
  degree: string
  institution: string
  fieldOfStudy?: string
  graduationDate?: string
}

export interface TechnicalSkillCategory {
  category: string
  skills: string[]
}

export interface PersonalProjectEntry {
  name: string
  description: string
  technologies?: string[]
  url?: string
}

export type SectionContent = {
  professional_summary: string
  core_competencies: string[]
  technical_skills: TechnicalSkillCategory[]
  professional_experience: ExperienceEntry[]
  personal_projects: PersonalProjectEntry[]
  education: EducationEntry[]
  awards: string[]
}

export function parseSectionContent<T extends SectionType>(
  type: T,
  raw: string,
): SectionContent[T] {
  try {
    const parsed = JSON.parse(raw)
    return parsed as SectionContent[T]
  } catch (e) {
    console.error(`[parseSectionContent] Failed to parse ${type}:`, e)
    return getDefaultSectionContent(type)
  }
}

export function serializeSectionContent<T extends SectionType>(
  _type: T,
  content: SectionContent[T],
): string {
  return JSON.stringify(content)
}

function getDefaultSectionContent(type: SectionType): any {
  const defaults: Record<SectionType, any> = {
    professional_summary: '',
    core_competencies: [],
    technical_skills: [],
    professional_experience: [],
    personal_projects: [],
    education: [],
    awards: [],
  }
  return defaults[type]
}
