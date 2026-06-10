// Pure parsing/guardrail logic for AI-tailored resume sections.
// Extracted from server/functions/generate-resume.ts so it can be unit tested
// without pulling in 'use server' / Cloudflare server-function dependencies.
import { jsonrepair } from "jsonrepair";
import {
  type SectionType,
  type SectionContent,
} from "@/lib/resume-sections";

/**
 * Formats a US phone number as (###) ###-####.
 * Strips a leading "1" country code if present. Returns the original
 * input unchanged if it doesn't contain exactly 10 (or 11 with leading 1) digits.
 */
export function formatPhoneNumber(phone: string | null | undefined): string {
  if (!phone) return "";

  const digits = phone.replace(/\D/g, "");
  const tenDigits = digits.length === 11 && digits.startsWith("1") ? digits.slice(1) : digits;

  if (tenDigits.length !== 10) return phone;

  return `(${tenDigits.slice(0, 3)}) ${tenDigits.slice(3, 6)}-${tenDigits.slice(6)}`;
}

/**
 * Best-effort extraction of section content from a plaintext (non-JSON) model response.
 * Used when the model ignores the "JSON only" instruction (common with smaller/instruct models).
 */
export function parsePlaintextSection<T extends SectionType>(raw: string, sectionType: T): SectionContent[T] | null {
  const text = raw.trim();
  // Strip code fences if present
  const cleaned = text.replace(/```[a-z]*\n?/gi, "").trim();

  switch (sectionType) {
    case "professional_summary": {
      // Take the longest paragraph-like chunk of plain prose
      const lines = cleaned.split(/\n+/).map((l) => l.trim()).filter(Boolean);
      const candidate = lines.find((l) => /[a-z]/.test(l) && l.split(/\s+/).length > 5) ?? lines[0];
      return (candidate ?? "") as SectionContent[T];
    }
    case "core_competencies":
    case "certifications":
    case "awards": {
      // Bullet/numbered/comma list extraction
      const items = cleaned
        .split(/\n+/)
        .map((l) => l.replace(/^[\s•\-*\d.)]+/, "").trim())
        .filter(Boolean);
      if (items.length <= 1 && cleaned.includes(",")) {
        return cleaned.split(",").map((s) => s.trim()).filter(Boolean) as unknown as SectionContent[T];
      }
      return items as unknown as SectionContent[T];
    }
    case "technical_skills": {
      // Lines like "Category: skill1, skill2, skill3"
      const lines = cleaned.split(/\n+/).map((l) => l.trim()).filter(Boolean);
      const categories: Array<{ category: string; skills: string[] }> = [];
      for (const line of lines) {
        const m = line.match(/^[\s•\-*\d.)]*([^:]+):\s*(.+)$/);
        if (m) {
          const category = m[1].trim();
          const skills = m[2].split(",").map((s) => s.trim()).filter(Boolean);
          if (category && skills.length > 0) categories.push({ category, skills });
        }
      }
      return (categories.length > 0 ? categories : null) as unknown as SectionContent[T] | null;
    }
    // Experience, projects, and education are too structured to safely recover from
    // plaintext; return null so the caller falls back to original section content.
    default:
      return null;
  }
}

export function getDefaultSectionValue(sectionType: SectionType): any {
  const defaults: Record<SectionType, any> = {
    professional_summary: "",
    core_competencies: [],
    technical_skills: [],
    professional_experience: [],
    personal_projects: [],
    education: [],
    certifications: [],
    awards: [],
  };
  return defaults[sectionType];
}

export function enforceGuardrails(sectionType: SectionType, content: any): any {
  switch (sectionType) {
    case "professional_summary": {
      // Enforce 3-4 sentences and <=60 words
      let summary = content as string;
      if (!summary || summary.trim().length === 0) return "";

      const words = summary.split(/\s+/).filter(w => w.length > 0);
      if (words.length > 85) {
        console.warn(`[enforceGuardrails] professional_summary exceeds 85 words (${words.length}), truncating`);
        summary = words.slice(0, 85).join(" ");
        // Avoid trailing fragment without terminal punctuation
        if (!/[.!?]$/.test(summary)) {
          const lastTerminator = Math.max(summary.lastIndexOf("."), summary.lastIndexOf("!"), summary.lastIndexOf("?"));
          if (lastTerminator > 0) summary = summary.slice(0, lastTerminator + 1);
        }
      }

      const sentences = summary.split(/[.!?]+/).filter(s => s.trim().length > 0);
      if (sentences.length > 4) {
        console.warn(`[enforceGuardrails] professional_summary has ${sentences.length} sentences, trimming to 4`);
        summary = sentences.slice(0, 4).map(s => s.trim()).join(". ") + ".";
      } else if (sentences.length < 3) {
        console.warn(`[enforceGuardrails] professional_summary has ${sentences.length} sentences, expected 3-4`);
      }

      return summary;
    }
    case "core_competencies": {
      // Enforce exactly 8 items
      const comps = (Array.isArray(content) ? content : []).filter((c: any) => typeof c === "string" && c.trim().length > 0);
      if (comps.length === 8) return comps;
      console.warn(`[enforceGuardrails] core_competencies has ${comps.length} items, expected 8`);
      if (comps.length < 8) {
        return [...comps, ...Array(8 - comps.length).fill("")].slice(0, 8);
      }
      return comps.slice(0, 8);
    }
    case "technical_skills": {
      // Enforce 5-6 categories
      let skills = Array.isArray(content) ? content.filter((c: any) => c?.category && Array.isArray(c?.skills) && c.skills.length > 0) : [];
      if (skills.length > 6) {
        console.warn(`[enforceGuardrails] technical_skills has ${skills.length} categories, trimming to 6`);
        skills = skills.slice(0, 6);
      } else if (skills.length < 5 && skills.length > 0) {
        console.warn(`[enforceGuardrails] technical_skills has ${skills.length} categories, expected 5-6`);
      }
      return skills;
    }
    case "professional_experience": {
      // Enforce 5 bullets per role, each ideally 15-20 words.
      // Word-count violations are logged (the prompt is responsible for rewording
      // bullets to fit) but bullets are never truncated, since that mangles content.
      const roles = Array.isArray(content) ? content : [];
      return roles.map((role: any) => {
        let bullets: string[] = Array.isArray(role?.bullets) ? role.bullets.filter((b: any) => typeof b === "string" && b.trim().length > 0) : [];

        for (const bullet of bullets) {
          const wordCount = bullet.split(/\s+/).filter(Boolean).length;
          if (wordCount < 18 || wordCount > 24) {
            console.warn(`[enforceGuardrails] role "${role?.title}" bullet has ${wordCount} words, expected 18-24: "${bullet}"`);
          }
        }

        if (bullets.length > 5) {
          console.warn(`[enforceGuardrails] role "${role?.title}" has ${bullets.length} bullets, trimming to 5`);
          bullets = bullets.slice(0, 5);
        } else if (bullets.length < 5) {
          console.warn(`[enforceGuardrails] role "${role?.title}" has ${bullets.length} bullets, expected 5`);
        }

        return { ...role, bullets };
      });
    }
    case "personal_projects": {
      // Enforce 3-4 projects, each with exactly 2 sentences (≤60 words total)
      const projects = Array.isArray(content) ? content.filter((p: any) => p?.name) : [];
      if (projects.length > 4) {
        console.warn(`[enforceGuardrails] personal_projects has ${projects.length} items, trimming to 4`);
        return projects.slice(0, 4);
      }
      return projects.map((p: any) => {
        const desc = (p.description ?? "").trim();
        if (!desc) return p;

        // Normalize: split on newlines or sentence boundaries; enforce 2 sentences max
        const sentences = desc
          .split(/\n+/)
          .join(" ")
          .split(/(?<=[.!?])\s+/)
          .map((s: string) => s.trim())
          .filter(Boolean);

        const wordCount = desc.split(/\s+/).filter(Boolean).length;
        if (sentences.length > 2) {
          console.warn(`[guardrails] project "${p.name}" has ${sentences.length} sentences, trimming to 2`);
          return { ...p, description: sentences.slice(0, 2).join(" ") };
        }
        if (wordCount > 60) {
          console.warn(`[guardrails] project "${p.name}" description has ${wordCount} words (>60), may need trimming`);
        }
        return p;
      });
    }
    default:
      return content;
  }
}

export function parseSectionResponse<T extends SectionType>(raw: string, sectionType: T): SectionContent[T] {
  try {
    console.log(`[parseSectionResponse] Parsing ${sectionType}, raw response:`, raw.substring(0, 500));

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn(`[parseSectionResponse] No JSON found in ${sectionType} response, attempting plaintext parse`);
      const plaintext = parsePlaintextSection(raw, sectionType);
      if (plaintext !== null) {
        return enforceGuardrails(sectionType, plaintext);
      }
      return getDefaultSectionValue(sectionType);
    }

    let parsed: any;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.log(`[parseSectionResponse] JSON parse failed, attempting repair for ${sectionType}`);
      try {
        parsed = JSON.parse(jsonrepair(jsonMatch[0]));
      } catch (repairErr) {
        console.warn(`[parseSectionResponse] JSON repair failed for ${sectionType}, attempting plaintext parse`);
        const plaintext = parsePlaintextSection(raw, sectionType);
        if (plaintext !== null) {
          return enforceGuardrails(sectionType, plaintext);
        }
        return getDefaultSectionValue(sectionType);
      }
    }

    console.log(`[parseSectionResponse] Parsed JSON for ${sectionType}:`, JSON.stringify(parsed).substring(0, 300));

    const sectionMap: Record<SectionType, (p: any) => any> = {
      professional_summary: (p) => {
        // Try multiple field name variations
        const result = p.professionalSummary ?? p.summary ?? p.professional_summary ?? "";
        console.log(`[parseSectionResponse] professional_summary result:`, result.substring(0, 100));
        return result;
      },
      core_competencies: (p) => {
        // Try multiple field name variations
        const competencies = p.coreCompetencies ?? p.competencies ?? p.core_competencies ?? [];
        const filtered = Array.isArray(competencies) ? competencies.filter((c: any) => c) : [];
        console.log(`[parseSectionResponse] core_competencies filtered:`, filtered.length, "items", filtered.slice(0, 3));
        return filtered;
      },
      technical_skills: (p) => {
        const skills = p.technicalSkills ?? p.technical_skills ?? p.skills ?? [];
        const filtered = Array.isArray(skills) ? skills.filter((cat: any) => cat?.skills?.length > 0) : [];
        console.log(`[parseSectionResponse] technical_skills filtered:`, filtered.length, "categories");
        return filtered;
      },
      professional_experience: (p) => Array.isArray(p.experience) ? p.experience.filter((exp: any) => exp?.title && exp?.company) : [],
      personal_projects: (p) => Array.isArray(p.personalProjects) ? p.personalProjects.filter((proj: any) => proj?.name) : [],
      education: (p) => Array.isArray(p.education) ? p.education.filter((edu: any) => edu?.institution) : [],
      certifications: (p) => {
        const certs = p.certifications ?? p.awards ?? [];
        return Array.isArray(certs) ? certs.filter((c: any) => c) : [];
      },
      awards: (p) => Array.isArray(p.awards) ? p.awards.filter((a: any) => a) : [],
    };

    let result = sectionMap[sectionType](parsed);
    result = enforceGuardrails(sectionType, result);
    console.log(`[parseSectionResponse] Final result for ${sectionType}:`, JSON.stringify(result).substring(0, 300));
    return result;
  } catch (err) {
    console.error(`[parseSectionResponse] Error parsing ${sectionType}:`, err);
    console.error(`Raw response was:`, raw.substring(0, 500));
    return getDefaultSectionValue(sectionType);
  }
}
