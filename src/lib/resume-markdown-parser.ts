// Deterministic parser for the structured-markdown resume schema.
//
// Schema (see the candidate's master-resume header comment):
//   # Name
//   @KEY: value                        contact/meta pairs (EMAIL, PHONE, ...)
//   ## Section                         top-level section
//   ### Entry header                   pipe-delimited fields (per section)
//   #### Sub-group                     sub-group within an entry
//   Category:: skill; skill            skill category line ("; " delimited)
//   - bullet                           bullet item
//   Dates: YYYY-MM or "Present", range delimiter " - "
//
// This is fully deterministic — no AI — because the input is already
// structured. It produces a complete Partial<ResumeData>-shaped result.

import type {
  EducationEntry,
  ExperienceEntry,
  PersonalProjectEntry,
  TechnicalSkillCategory,
} from "@/lib/resume-sections";

export interface ParsedMarkdownResume {
  fullName?: string;
  email?: string;
  phone?: string;
  linkedin?: string;
  website?: string;
  location?: string;
  summary?: string;
  competencies: string[];
  technicalSkills: TechnicalSkillCategory[];
  experience: ExperienceEntry[];
  personalProjects: PersonalProjectEntry[];
  education: EducationEntry[];
  certifications: string[];
  awards: string[];
}

/** Maps a `## Section` heading to a canonical section key. */
type SectionKey =
  | "summary"
  | "competencies"
  | "technicalSkills"
  | "experience"
  | "projects"
  | "education"
  | "certifications"
  | "awards"
  | "unknown";

function classifySection(title: string): SectionKey {
  const t = title.toLowerCase();
  if (/\b(summary|objective|profile)\b/.test(t)) return "summary";
  if (/\b(core competencies|competencies|key skills|areas of expertise)\b/.test(t)) return "competencies";
  if (/\b(technical skills|technical proficiencies|tools|technologies|tech stack)\b/.test(t)) return "technicalSkills";
  if (/\b(experience|employment|work history)\b/.test(t)) return "experience";
  if (/\b(projects|personal projects|side projects)\b/.test(t)) return "projects";
  if (/\b(education|academic)\b/.test(t)) return "education";
  if (/\b(certifications?|certificates?|licen[sc]es?)\b/.test(t)) return "certifications";
  if (/\b(awards|honors|achievements)\b/.test(t)) return "awards";
  return "unknown";
}

function splitPipes(s: string): string[] {
  return s.split("|").map((p) => p.trim());
}

/** "2020-01 - Present" -> { dates, startDate, endDate } */
function parseDateRange(raw: string | undefined): { dates: string; startDate?: string; endDate?: string } {
  if (!raw) return { dates: "" };
  const dates = raw.trim();
  const m = dates.split(/\s+-\s+/);
  if (m.length === 2) return { dates, startDate: m[0].trim(), endDate: m[1].trim() };
  return { dates };
}

const META_KEY_MAP: Record<string, keyof ParsedMarkdownResume> = {
  EMAIL: "email",
  PHONE: "phone",
  LINKEDIN: "linkedin",
  WEBSITE: "website",
  SITE: "website",
  PORTFOLIO: "website",
  LOCATION: "location",
};

/**
 * Returns true if the text appears to follow the structured markdown schema
 * (has an H1 name and at least one `## ` section). Used to decide whether to
 * use this deterministic parser vs. the AI/PDF path.
 */
export function isStructuredMarkdown(text: string): boolean {
  const hasH1 = /^#\s+.+/m.test(text);
  const hasSection = /^##\s+.+/m.test(text);
  return hasH1 && hasSection;
}

export function parseMarkdownResume(text: string): ParsedMarkdownResume {
  const lines = text.split(/\r?\n/);

  const result: ParsedMarkdownResume = {
    competencies: [],
    technicalSkills: [],
    experience: [],
    personalProjects: [],
    education: [],
    certifications: [],
    awards: [],
  };

  let section: SectionKey = "unknown";
  const summaryLines: string[] = [];

  // Working entry references so #### sub-groups and bullets attach correctly.
  let currentExperience: ExperienceEntry | null = null;
  let currentProject: PersonalProjectEntry | null = null;
  let currentProjectDescLines: string[] = [];
  let currentSubGroup: string | null = null;

  const flushProjectDesc = () => {
    if (currentProject) {
      currentProject.description = currentProjectDescLines.join("\n").trim();
      currentProjectDescLines = [];
    }
  };

  for (const rawLine of lines) {
    const line = rawLine.replace(/\s+$/, "");
    if (!line.trim()) continue;
    if (/^<!--/.test(line.trim())) continue; // skip schema comment lines

    // # Name
    const h1 = line.match(/^#\s+(.+)$/);
    if (h1 && !line.startsWith("##")) {
      result.fullName = h1[1].trim();
      continue;
    }

    // @KEY: value
    const meta = line.match(/^@([A-Z_]+):\s*(.+)$/);
    if (meta) {
      const key = META_KEY_MAP[meta[1].toUpperCase()];
      if (key) (result as any)[key] = meta[2].trim();
      continue;
    }

    // ## Section
    const h2 = line.match(/^##\s+(.+)$/);
    if (h2) {
      flushProjectDesc();
      section = classifySection(h2[1].trim());
      currentExperience = null;
      currentProject = null;
      currentSubGroup = null;
      continue;
    }

    // ### Entry header
    const h3 = line.match(/^###\s+(.+)$/);
    if (h3) {
      flushProjectDesc();
      currentSubGroup = null;
      const fields = splitPipes(h3[1].trim());

      if (section === "experience") {
        // Title | Organization | Location | StartDate - EndDate
        const { dates, startDate, endDate } = parseDateRange(fields[3]);
        currentExperience = {
          title: fields[0] ?? "",
          company: fields[1] ?? "",
          dates,
          startDate,
          endDate,
          bullets: [],
        };
        result.experience.push(currentExperience);
      } else if (section === "projects") {
        // Name | Status | URL
        currentProject = {
          name: fields[0] ?? "",
          description: "",
          technologies: [],
          ...(fields[2] ? { url: fields[2] } : {}),
        };
        currentProjectDescLines = [];
        result.personalProjects.push(currentProject);
      } else if (section === "education") {
        // Degree | Institution | Location | Date
        result.education.push({
          degree: fields[0] ?? "",
          institution: fields[1] ?? "",
          graduationDate: fields[3] || fields[2] || undefined,
        });
      } else if (section === "certifications") {
        // Credential | Issuer | Date
        const parts = fields.filter(Boolean);
        result.certifications.push(parts.join(" — "));
      }
      continue;
    }

    // #### Sub-group within an entry
    const h4 = line.match(/^####\s+(.+)$/);
    if (h4) {
      currentSubGroup = h4[1].trim();
      // For projects, the sub-group heading is part of the description.
      if (section === "projects" && currentProject) {
        currentProjectDescLines.push(`${currentSubGroup}:`);
      }
      continue;
    }

    // Category:: skill; skill   (skills section)
    const skillCat = line.match(/^([A-Za-z0-9 &/().+-]+)::\s*(.+)$/);
    if (skillCat && section === "technicalSkills") {
      const category = skillCat[1].trim();
      const skills = skillCat[2].split(";").map((s) => s.trim()).filter(Boolean);
      if (category && skills.length > 0) {
        result.technicalSkills.push({ category, skills });
      }
      continue;
    }

    // - bullet
    const bullet = line.match(/^-\s+(.+)$/);
    if (bullet) {
      const text = bullet[1].trim();
      switch (section) {
        case "summary":
          summaryLines.push(text);
          break;
        case "competencies":
          result.competencies.push(text);
          break;
        case "experience":
          if (currentExperience) currentExperience.bullets!.push(text);
          break;
        case "projects":
          if (currentProject) currentProjectDescLines.push(text);
          break;
        case "certifications":
          result.certifications.push(text);
          break;
        case "awards":
          result.awards.push(text);
          break;
        case "technicalSkills":
          // A plain bullet in skills with no category -> uncategorized.
          result.technicalSkills.push({ category: "Technical Skills", skills: [text] });
          break;
        default:
          break;
      }
      continue;
    }

    // Plain paragraph line.
    if (section === "summary") {
      summaryLines.push(line.trim());
    } else if (section === "projects" && currentProject) {
      currentProjectDescLines.push(line.trim());
    }
  }

  flushProjectDesc();

  if (summaryLines.length > 0) result.summary = summaryLines.join("\n").trim();

  return result;
}
