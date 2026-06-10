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
  { key: "technicalSkills", pattern: /^(technical\s+skills|tools?\s*&?\s*technologies|tech\s+stack|skills|technologies)$/i },
  { key: "experience", pattern: /^(professional\s+experience|work\s+experience|experience|employment\s+history)$/i },
  { key: "education", pattern: /^(education|academic\s+background)$/i },
  { key: "certifications", pattern: /^(certifications?|certificates?|licenses?\s*&?\s*certifications?)$/i },
  { key: "awards", pattern: /^(awards?|honors?|honors?\s*&?\s*awards?|achievements?)$/i },
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
