// Deterministic parsers for Experience and Personal Projects entries.
//
// These sections contain long verbatim text (bullets, descriptions). Asking
// an LLM to regurgitate that text is slow and times out on Cloudflare Workers
// AI. Instead, we keep the bullet/description text exactly as it appears in
// the source (truly verbatim, since it's copied not regenerated) and only
// parse the short heading fields (title/company/dates, project name/url)
// deterministically.

import type { ExperienceEntry } from "@/server/functions/manage-resume";
import type { PersonalProjectEntry } from "@/server/functions/manage-resume";

const BULLET_PREFIX_REGEX = /^\s*[•·●○◦▪︎\-*]\s*/;

// Date range like "October 2022 – Present", "Jan 2020 - Dec 2021",
// "2019–2022", "05/2018 - 09/2020".
const DATE_RANGE_REGEX =
  /((?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*\d{4}|\d{1,2}\/\d{4}|\d{4})\s*[–—-]\s*(present|current|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*\d{4}|\d{1,2}\/\d{4}|\d{4})/i;

const URL_REGEX = /\b((?:https?:\/\/)?[\w-]+(?:\.[\w-]+)+(?:\/[\w./?%&=-]*)?)\b/i;

function isBullet(line: string): boolean {
  return BULLET_PREFIX_REGEX.test(line);
}

function stripBullet(line: string): string {
  return line.replace(BULLET_PREFIX_REGEX, "").trim();
}

/**
 * Parses one role chunk into an ExperienceEntry. The heading is the text
 * before the first bullet; bullets are kept verbatim. The heading is split
 * into title / company / dates using the date range and common delimiters
 * (| or -), with no AI and no text regeneration.
 */
export function parseExperienceChunk(chunk: string): ExperienceEntry | null {
  const lines = chunk.split(/\r?\n/).map((l) => l.replace(/\s+$/, ""));
  const headingLines: string[] = [];
  const bullets: string[] = [];

  let inBullets = false;
  for (const line of lines) {
    if (!line.trim()) continue;
    if (isBullet(line)) {
      inBullets = true;
      bullets.push(stripBullet(line));
    } else if (inBullets) {
      // Wrapped continuation of the previous bullet.
      if (bullets.length > 0) bullets[bullets.length - 1] += " " + line.trim();
      else bullets.push(line.trim());
    } else {
      headingLines.push(line.trim());
    }
  }

  const heading = headingLines.join(" ").replace(/\s+/g, " ").trim();
  if (!heading && bullets.length === 0) return null;

  // Extract the date range from the heading.
  const dateMatch = heading.match(DATE_RANGE_REGEX);
  const dates = dateMatch ? dateMatch[0].trim() : "";
  const headingNoDate = dateMatch
    ? heading.replace(dateMatch[0], "").replace(/[|,–—-]\s*$/, "").trim()
    : heading;

  // Split remaining heading into title / company on common delimiters.
  const parts = headingNoDate
    .split(/\s*[|]\s*|\s+[–—]\s+|\s+-\s+|\s+at\s+/i)
    .map((p) => p.replace(/[|,]\s*$/, "").trim())
    .filter(Boolean);

  const title = parts[0] ?? headingNoDate;
  const company = parts[1] ?? "";

  return { title, company, dates, bullets } as ExperienceEntry;
}

/**
 * Parses one project chunk into a PersonalProjectEntry. The first non-bullet
 * line is the name (URL stripped out into its own field); the rest is kept as
 * the verbatim description. Technologies are pulled from an explicit
 * "Technologies:" / "Tech:" line if present.
 */
export function parseProjectChunk(chunk: string): PersonalProjectEntry | null {
  const lines = chunk.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  const headingLine = lines[0];

  // Pull URL out of the heading (and anywhere it appears) into its own field.
  const urlMatch = headingLine.match(URL_REGEX) || chunk.match(URL_REGEX);
  const url = urlMatch ? urlMatch[1] : undefined;

  let name = headingLine;
  if (urlMatch && headingLine.includes(urlMatch[1])) {
    name = headingLine.replace(urlMatch[1], "").replace(/[\s—–\-|(),]+$/, "").trim();
  }
  // Strip trailing "(Live: ...)" style decoration.
  name = name.replace(/\(?\s*live\s*:?\s*\)?$/i, "").replace(/[—–\-|]\s*$/, "").trim();

  const restLines = lines.slice(1);

  // Explicit technologies line, if present.
  const techLineIdx = restLines.findIndex((l) => /^(?:technolog(?:y|ies)|tech|stack)\s*:/i.test(stripBullet(l)));
  let technologies: string[] = [];
  if (techLineIdx !== -1) {
    const techLine = stripBullet(restLines[techLineIdx]).replace(/^[^:]*:\s*/, "");
    technologies = techLine.split(",").map((t) => t.trim()).filter(Boolean);
  }

  const descLines = restLines
    .filter((_, i) => i !== techLineIdx)
    .map((l) => stripBullet(l));
  const description = descLines.join("\n").trim();

  if (!name && !description) return null;

  return {
    name: name || headingLine,
    description,
    technologies,
    ...(url ? { url } : {}),
  } as PersonalProjectEntry;
}
