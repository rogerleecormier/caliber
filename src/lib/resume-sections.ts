export type SectionType =
  | 'professional_summary'
  | 'core_competencies'
  | 'technical_skills'
  | 'professional_experience'
  | 'personal_projects'
  | 'education'
  | 'certifications'
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
  certifications: string[]
  awards: string[]
}

export function parseSectionContent<T extends SectionType>(
  type: T,
  raw: string,
): SectionContent[T] {
  try {
    const parsed = JSON.parse(raw)

    // Normalize technical_skills: handle old format (flat array) vs new format (categorized)
    if (type === 'technical_skills') {
      if (Array.isArray(parsed)) {
        if (parsed.length === 0) return parsed as SectionContent[T]
        // Check if it's old format (array of strings) or new format (array of objects)
        const isOldFormat = typeof parsed[0] === 'string'
        if (isOldFormat) {
          return [{ category: 'Tools & Technologies', skills: parsed }] as SectionContent[T]
        }
        // Ensure each category has a skills array
        return parsed.map((cat: any) => ({
          category: cat.category || 'Unnamed',
          skills: Array.isArray(cat.skills) ? cat.skills : [],
        })) as SectionContent[T]
      }
    }

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
    certifications: [],
    awards: [],
  }
  return defaults[type]
}
