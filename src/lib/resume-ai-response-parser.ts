// Robust parsing of AI responses for resume section extraction.
//
// Models don't reliably return clean JSON: they may wrap output in markdown
// code fences, return a markdown bullet list instead of JSON, or return
// prose. This module detects the response format and extracts structured
// data accordingly, falling back through JSON -> markdown -> prose so a
// section is never silently dropped just because the model didn't follow
// the JSON instruction exactly.

import { jsonrepair } from "jsonrepair";

export type SectionLabel =
  | "experience"
  | "personalProjects"
  | "education"
  | "technicalSkills"
  | "competencies"
  | "certifications"
  | "awards";

const BULLET_PREFIX_REGEX = /^[•·●○◦▪︎\-*]\s*/;

function stripCodeFences(raw: string): string {
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return fenceMatch ? fenceMatch[1] : raw;
}

/**
 * Tries to find and parse a JSON object in the raw text. Returns null if no
 * JSON object could be found or parsed (even after jsonrepair).
 */
function tryExtractJson(raw: string): any | null {
  const unfenced = stripCodeFences(raw);
  const jsonMatch = unfenced.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;

  try {
    return JSON.parse(jsonMatch[0]);
  } catch {
    try {
      return JSON.parse(jsonrepair(jsonMatch[0]));
    } catch {
      return null;
    }
  }
}

/**
 * Splits text into bulleted items, merging non-bulleted continuation lines
 * into the preceding bullet (handles wrapped lines).
 */
function extractBulletItems(text: string): string[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const items: string[] = [];
  for (const line of lines) {
    if (BULLET_PREFIX_REGEX.test(line)) {
      items.push(line.replace(BULLET_PREFIX_REGEX, "").trim());
    } else if (/^#{1,6}\s/.test(line) || /^\*\*.*\*\*:?\s*$/.test(line)) {
      // Skip markdown headings / bold sub-heading labels with no content
      continue;
    } else if (items.length > 0) {
      items[items.length - 1] += " " + line;
    } else {
      items.push(line);
    }
  }
  return items.map((i) => i.replace(/\*\*/g, "").trim()).filter(Boolean);
}

/**
 * Fallback for sections whose expected shape is { key: string[] }
 * (competencies, certifications, awards). Extracts a flat list of items
 * from a markdown bullet list or prose.
 */
function parseFlatListFallback(raw: string): string[] {
  const unfenced = stripCodeFences(raw);
  const items = extractBulletItems(unfenced);
  if (items.length > 0) return items;

  // Last resort: split prose on commas/semicolons.
  return unfenced
    .split(/[,;\n]/)
    .map((s) => s.replace(/\*\*/g, "").trim())
    .filter((s) => s.length > 1);
}

/**
 * Fallback for technicalSkills: parses "Category: skill, skill, skill"
 * lines (markdown or plain) into TechnicalSkillCategory[].
 */
function parseTechnicalSkillsFallback(raw: string): { technicalSkills: { category: string; skills: string[] }[] } {
  const unfenced = stripCodeFences(raw);
  const lines = unfenced
    .split(/\r?\n/)
    .map((l) => l.replace(BULLET_PREFIX_REGEX, "").replace(/\*\*/g, "").trim())
    .filter(Boolean);

  const categories: { category: string; skills: string[] }[] = [];
  const uncategorized: string[] = [];

  for (const line of lines) {
    if (/^#{1,6}\s/.test(line)) continue;
    const match = line.match(/^([^:]{2,60}):\s*(.+)$/);
    if (match) {
      const category = match[1].trim();
      const skills = match[2]
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
      if (category && skills.length > 0) {
        categories.push({ category, skills });
        continue;
      }
    }
    const items = line
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    uncategorized.push(...items);
  }

  if (uncategorized.length > 0) {
    categories.push({ category: "Technical Skills", skills: uncategorized });
  }

  return { technicalSkills: categories };
}

/**
 * Fallback for experience/personalProjects/education: parses a markdown-ish
 * structure where each entry starts with a bold heading line followed by
 * bullet details. This is intentionally loose — it recovers SOME structure
 * rather than nothing when JSON extraction fails.
 */
function parseEntriesFallback(raw: string, label: SectionLabel): any {
  const unfenced = stripCodeFences(raw);
  const lines = unfenced
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  type Entry = { heading: string; bullets: string[] };
  const entries: Entry[] = [];

  for (const line of lines) {
    if (/^#{1,6}\s/.test(line)) continue;
    if (BULLET_PREFIX_REGEX.test(line)) {
      const text = line.replace(BULLET_PREFIX_REGEX, "").replace(/\*\*/g, "").trim();
      if (entries.length > 0) {
        entries[entries.length - 1].bullets.push(text);
      } else {
        entries.push({ heading: text, bullets: [] });
      }
    } else {
      const heading = line.replace(/\*\*/g, "").trim();
      if (heading) entries.push({ heading, bullets: [] });
    }
  }

  if (label === "experience") {
    return {
      experience: entries.map((e) => {
        // Heading often looks like "Title | Company | Dates" or "Title - Company (Dates)"
        const parts = e.heading.split(/\s*[|]\s*|\s+-\s+/).map((p) => p.trim()).filter(Boolean);
        return {
          title: parts[0] ?? e.heading,
          company: parts[1] ?? "",
          dates: parts[2] ?? "",
          bullets: e.bullets,
        };
      }),
    };
  }

  if (label === "personalProjects") {
    return {
      personalProjects: entries.map((e) => ({
        name: e.heading,
        description: e.bullets.join(" "),
        technologies: [],
        url: null,
      })),
    };
  }

  if (label === "education") {
    return {
      education: entries.map((e) => {
        const parts = e.heading.split(/\s*[|]\s*|\s+-\s+/).map((p) => p.trim()).filter(Boolean);
        return {
          degree: parts[0] ?? e.heading,
          institution: parts[1] ?? "",
          graduationDate: parts[2] ?? null,
          fieldOfStudy: null,
        };
      }),
    };
  }

  return null;
}

/**
 * Detects the format of an AI response (json / markdown / prose) and parses
 * it into the shape expected for the given section. Returns null only if no
 * usable data could be recovered at all.
 */
export function parseSectionResponse(raw: string, label: SectionLabel): any | null {
  if (!raw || !raw.trim()) return null;

  // 1. Try JSON first (with or without code fences) — the happy path.
  const json = tryExtractJson(raw);
  if (json && typeof json === "object") {
    return json;
  }

  console.warn(`[parseSectionResponse] JSON extraction failed for ${label}, falling back to markdown/prose parsing`);

  // 2. Fall back to markdown/prose parsing based on the section's expected shape.
  switch (label) {
    case "competencies":
      return { competencies: parseFlatListFallback(raw) };
    case "certifications":
      return { certifications: parseFlatListFallback(raw) };
    case "awards":
      return { awards: parseFlatListFallback(raw) };
    case "technicalSkills":
      return parseTechnicalSkillsFallback(raw);
    case "experience":
    case "personalProjects":
    case "education":
      return parseEntriesFallback(raw, label);
    default:
      return null;
  }
}
