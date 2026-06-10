// Deterministic (non-AI) parsers for resume sections that are simple
// delimited lists in plain text. Keeping these out of the AI call avoids
// summarization/keyword-bleed issues for sections that don't need
// interpretation.

import type { TechnicalSkillCategory } from "@/lib/resume-sections";

const ITEM_SPLIT_REGEX = /[•·,|/]|(?:\s{2,})/;

function splitItems(line: string): string[] {
  return line
    .split(ITEM_SPLIT_REGEX)
    .map((item) => item.replace(/^[-*\s]+|[\s.]+$/g, "").trim())
    .filter(Boolean);
}

/**
 * Parses a "Technical Skills" block into categories. Handles two common
 * formats:
 *   1. "Category: item1, item2, item3" (one category per line)
 *   2. A flat bullet/CSV list with no category labels
 */
export function parseTechnicalSkills(text: string): TechnicalSkillCategory[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) return [];

  const categorized: TechnicalSkillCategory[] = [];
  const uncategorized: string[] = [];

  for (const line of lines) {
    const colonMatch = line.match(/^([^:]{2,40}):\s*(.+)$/);
    if (colonMatch) {
      const category = colonMatch[1].replace(/^[-*\s]+/, "").trim();
      const skills = splitItems(colonMatch[2]);
      if (category && skills.length > 0) {
        categorized.push({ category, skills });
        continue;
      }
    }
    uncategorized.push(...splitItems(line));
  }

  if (uncategorized.length > 0) {
    categorized.push({ category: "Technical Skills", skills: uncategorized });
  }

  return categorized;
}

/**
 * Parses a "Core Competencies" / "Key Skills" block into a flat list of
 * individual items, regardless of whether they're separated by commas,
 * bullets, pipes, or newlines.
 */
export function parseCompetencies(text: string): string[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const items: string[] = [];
  for (const line of lines) {
    items.push(...splitItems(line));
  }
  return items;
}

/**
 * Parses a "Certifications" block into a flat list of individual
 * certifications, one per line/bullet.
 */
export function parseCertifications(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^[-*•·\s]+/, "").trim())
    .filter(Boolean);
}

/**
 * Parses an "Awards" block into a flat list of individual awards,
 * one per line/bullet.
 */
export function parseAwards(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^[-*•·\s]+/, "").trim())
    .filter(Boolean);
}
