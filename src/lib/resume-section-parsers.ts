// Deterministic (non-AI) parsers for resume sections that are simple
// delimited lists in plain text. Keeping these out of the AI call avoids
// summarization/keyword-bleed issues for sections that don't need
// interpretation.

import type { TechnicalSkillCategory } from "@/lib/resume-sections";

const ITEM_SPLIT_REGEX = /[•·●○◦▪︎,|]|(?:\s{2,})/;

function splitItems(line: string): string[] {
  return line
    .split(ITEM_SPLIT_REGEX)
    .map((item) => item.replace(/^[-*\s]+|[\s.]+$/g, "").trim())
    .filter(Boolean);
}

/**
 * Parses a "Technical Skills" / "Technical Proficiencies" block into
 * categories. Handles:
 *   1. "**Category:** item1, item2, item3" (one category per paragraph,
 *      possibly wrapped across multiple lines, with markdown bold markers)
 *   2. "Category: item1, item2, item3" (plain, one category per line)
 *   3. A flat bullet/CSV list with no category labels
 *   4. Bulleted sub-items under a category (e.g. "* **NetSuite:** ...")
 *      are appended to that category's skill list rather than treated as
 *      their own categories.
 */
export function parseTechnicalSkills(text: string): TechnicalSkillCategory[] {
  // Join wrapped lines back into paragraphs: a new category/bullet starts a
  // new paragraph, continuation lines (no leading bullet/bold-label) are
  // merged into the previous line.
  const rawLines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const paragraphs: string[] = [];
  for (const line of rawLines) {
    const startsNewParagraph = /^(\*\*|[-*•·]|\w)/.test(line) &&
      (paragraphs.length === 0 || /^[-*•·]|\*\*[^*]+\*\*\s*:/.test(line));
    if (startsNewParagraph || paragraphs.length === 0) {
      paragraphs.push(line);
    } else {
      paragraphs[paragraphs.length - 1] += " " + line;
    }
  }

  const categorized: TechnicalSkillCategory[] = [];
  const uncategorized: string[] = [];

  for (const para of paragraphs) {
    const cleaned = para.replace(/^[-*•·]\s*/, "").trim();
    // Match "**Category:** rest" or "Category: rest"
    const labelMatch = cleaned.match(/^\*{0,2}([^:*]{2,60}?)\*{0,2}:\s*(.+)$/);
    if (labelMatch) {
      const category = labelMatch[1].trim();
      const rest = labelMatch[2];
      // Sub-bullets like "* **NetSuite:** ..." inside the same category
      // paragraph get folded into this category's skills.
      const skills = splitItems(rest.replace(/\*{1,2}([^*]+)\*{1,2}:/g, "$1:"));
      if (category && skills.length > 0) {
        categorized.push({ category, skills });
        continue;
      }
    }
    uncategorized.push(...splitItems(cleaned));
  }

  if (uncategorized.length > 0) {
    categorized.push({ category: "Technical Skills", skills: uncategorized });
  }

  return categorized;
}

const BULLET_PREFIX_REGEX = /^[•·●○◦▪︎\-*]\s*/;

/**
 * Parses a "Core Competencies" / "Key Skills" block into a flat list of
 * individual items. Resumes often group competencies under bold sub-heading
 * labels (e.g. "Strategic & Leadership Capabilities") with no bullet — those
 * label lines are skipped, and only bulleted lines are extracted as items.
 * If the block has no bullets at all, falls back to splitting every line.
 */
export function parseCompetencies(text: string): string[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const hasBullets = lines.some((l) => BULLET_PREFIX_REGEX.test(l));

  const items: string[] = [];
  for (const line of lines) {
    if (hasBullets) {
      if (!BULLET_PREFIX_REGEX.test(line)) continue;
      items.push(line.replace(BULLET_PREFIX_REGEX, "").trim());
    } else {
      items.push(...splitItems(line));
    }
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
    .map((l) => l.replace(/^[-*•·●○◦▪︎\s]+/, "").trim())
    .filter(Boolean);
}

/**
 * Parses an "Awards" block into a flat list of individual awards,
 * one per line/bullet.
 */
export function parseAwards(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((l) => l.replace(/^[-*•·●○◦▪︎\s]+/, "").trim())
    .filter(Boolean);
}
