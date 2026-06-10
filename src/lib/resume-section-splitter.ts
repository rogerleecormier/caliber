// Splits raw resume text into named sections by detecting header lines.
// This keeps each AI call (and each deterministic parser) scoped to only the
// text under its own header, preventing keyword bleed across sections and
// avoiding one giant slow/unreliable AI call over the whole resume.

export type ResumeSectionKey =
  | "summary"
  | "competencies"
  | "technicalSkills"
  | "experience"
  | "education"
  | "certifications"
  | "awards"
  | "personalProjects";

const HEADER_PATTERNS: Array<{ key: ResumeSectionKey; pattern: RegExp }> = [
  { key: "summary", pattern: /^(professional\s+summary|summary|objective|profile|career\s+summary)$/i },
  { key: "competencies", pattern: /^(core\s+competencies|key\s+skills|competencies|areas?\s+of\s+expertise|expertise)$/i },
  { key: "technicalSkills", pattern: /^(technical\s+(skills|proficiencies)|tools?\s*&?\s*technologies|tech\s+stack|skills|technologies)$/i },
  { key: "experience", pattern: /^(professional\s+experience|work\s+experience|experience|employment\s+history)$/i },
  { key: "education", pattern: /^(education|academic\s+background)$/i },
  { key: "certifications", pattern: /^(certifications?|certificates?|licenses?\s*&?\s*certifications?)$/i },
  { key: "awards", pattern: /^(awards?(\s*&?\s*honors?)?|honors?(\s*&?\s*awards?)?|achievements?)$/i },
  { key: "personalProjects", pattern: /^(personal\s+projects|projects|side\s+projects|open\s+source)$/i },
];

/**
 * A line is treated as a section header if, after stripping common
 * decoration (colons, surrounding markdown bold/markers), it matches one of
 * the known header patterns AND is short (headers are a few words, not full
 * sentences/bullets).
 */
function matchHeader(line: string): ResumeSectionKey | null {
  const cleaned = line
    .trim()
    .replace(/^[#*\-\s]+|[#*\s:]+$/g, "")
    .replace(/\s+/g, " ");

  if (!cleaned || cleaned.length > 40) return null;

  for (const { key, pattern } of HEADER_PATTERNS) {
    if (pattern.test(cleaned)) return key;
  }
  return null;
}

export type ResumeSections = Partial<Record<ResumeSectionKey, string>>;

/**
 * Splits resume text into a map of section key -> raw text content
 * (excluding the header line itself). Text before the first recognized
 * header is treated as the summary if no explicit summary header is found.
 */
export function splitResumeIntoSections(text: string): ResumeSections {
  const lines = text.split(/\r?\n/);
  const sections: ResumeSections = {};

  let currentKey: ResumeSectionKey | null = null;
  let buffer: string[] = [];
  let preambleLines: string[] = [];

  const flush = () => {
    if (currentKey) {
      const content = buffer.join("\n").trim();
      sections[currentKey] = sections[currentKey]
        ? `${sections[currentKey]}\n${content}`
        : content;
    }
    buffer = [];
  };

  for (const line of lines) {
    const headerKey = matchHeader(line);
    if (headerKey) {
      flush();
      currentKey = headerKey;
      continue;
    }

    if (currentKey) {
      buffer.push(line);
    } else {
      preambleLines.push(line);
    }
  }
  flush();

  // If no explicit summary section was found, use the leading text (minus
  // the first line, which is usually the candidate's name) as the summary.
  if (!sections.summary) {
    const preamble = preambleLines.slice(1).join("\n").trim();
    if (preamble) sections.summary = preamble;
  }

  return sections;
}

// Date range like "October 2022 – Present", "Jan 2020 - Dec 2021",
// "2019–2022", "05/2018 - 09/2020". Used to detect role heading lines so a
// large Experience section can be split into per-role chunks for parsing.
const DATE_RANGE_REGEX =
  /(\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*\d{4}\b|\b\d{1,2}\/\d{4}\b|\b\d{4}\b)\s*[–—-]\s*(present|current|\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s*\d{4}\b|\b\d{1,2}\/\d{4}\b|\b\d{4}\b)/i;

/**
 * Splits an Experience section into one chunk per role. A new role starts on
 * a line that contains a date range (the role's employment dates), which in
 * most resume formats appears on the role's heading line. Bullets and
 * continuation lines stay with the role above them.
 *
 * Falls back to returning the whole section as a single chunk if no role
 * heading lines are detected.
 */
export function splitExperienceIntoRoleChunks(text: string): string[] {
  const lines = text.split(/\r?\n/);
  const chunks: string[] = [];
  let current: string[] = [];

  const isBullet = (l: string) => /^\s*[•·●○◦▪︎\-*]/.test(l);

  for (const line of lines) {
    const isRoleHeading = DATE_RANGE_REGEX.test(line) && !isBullet(line);
    if (isRoleHeading && current.some((l) => l.trim())) {
      chunks.push(current.join("\n").trim());
      current = [];
    }
    current.push(line);
  }
  if (current.some((l) => l.trim())) chunks.push(current.join("\n").trim());

  const nonEmpty = chunks.filter(Boolean);
  return nonEmpty.length > 0 ? nonEmpty : [text];
}

/**
 * Splits a Projects section into one chunk per project. Heuristic: a new
 * project starts on a non-bullet "heading" line (often a name, possibly with
 * a URL) that follows at least one bullet/detail line of the previous
 * project. Falls back to the whole section as a single chunk.
 */
export function splitProjectsIntoChunks(text: string): string[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const chunks: string[] = [];
  let current: string[] = [];
  let sawDetail = false;

  const isBullet = (l: string) => /^\s*[•·●○◦▪︎\-*]/.test(l);

  for (const line of lines) {
    const isHeading = !isBullet(line) && line.trim().length > 0 && line.trim().length < 120;
    if (isHeading && sawDetail && current.length > 0) {
      chunks.push(current.join("\n").trim());
      current = [];
      sawDetail = false;
    }
    current.push(line);
    if (isBullet(line) || current.length > 1) sawDetail = true;
  }
  if (current.length > 0) chunks.push(current.join("\n").trim());

  const nonEmpty = chunks.filter(Boolean);
  return nonEmpty.length > 0 ? nonEmpty : [text];
}
