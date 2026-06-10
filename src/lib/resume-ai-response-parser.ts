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

/** The JSON top-level key each section's response is expected to contain. */
const EXPECTED_KEY: Record<SectionLabel, string> = {
  experience: "experience",
  personalProjects: "personalProjects",
  education: "education",
  technicalSkills: "technicalSkills",
  competencies: "competencies",
  certifications: "certifications",
  awards: "awards",
};

const stringArray = { type: "array", items: { type: "string" } };

/**
 * JSON schemas for Cloudflare Workers AI constrained decoding. Forcing the
 * model to match a schema is the most reliable way to stop Gemma from
 * emitting chain-of-thought instead of structured output.
 */
export const SECTION_JSON_SCHEMAS: Record<SectionLabel, any> = {
  experience: {
    type: "object",
    properties: {
      experience: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: { type: "string" },
            company: { type: "string" },
            dates: { type: "string" },
            bullets: stringArray,
          },
          required: ["title", "company", "dates", "bullets"],
        },
      },
    },
    required: ["experience"],
  },
  personalProjects: {
    type: "object",
    properties: {
      personalProjects: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            description: { type: "string" },
            technologies: stringArray,
            url: { type: "string" },
          },
          required: ["name", "description", "technologies"],
        },
      },
    },
    required: ["personalProjects"],
  },
  education: {
    type: "object",
    properties: {
      education: {
        type: "array",
        items: {
          type: "object",
          properties: {
            degree: { type: "string" },
            institution: { type: "string" },
            graduationDate: { type: "string" },
            fieldOfStudy: { type: "string" },
          },
          required: ["degree", "institution"],
        },
      },
    },
    required: ["education"],
  },
  technicalSkills: {
    type: "object",
    properties: {
      technicalSkills: {
        type: "array",
        items: {
          type: "object",
          properties: {
            category: { type: "string" },
            skills: stringArray,
          },
          required: ["category", "skills"],
        },
      },
    },
    required: ["technicalSkills"],
  },
  competencies: {
    type: "object",
    properties: { competencies: stringArray },
    required: ["competencies"],
  },
  certifications: {
    type: "object",
    properties: { certifications: stringArray },
    required: ["certifications"],
  },
  awards: {
    type: "object",
    properties: { awards: stringArray },
    required: ["awards"],
  },
};

/**
 * Gemma's "thinking mode" emits chain-of-thought wrapped in control tokens
 * (e.g. <|channel|>thought ... <|channel|>, <think>...</think>,
 * <start_of_turn>...). When this leaks into the response it must be stripped
 * before we look for the real JSON payload, which comes AFTER the reasoning.
 */
function stripThinkingTokens(raw: string): string {
  return raw
    // <|channel|>thought ... <|channel|>final  (Gemma channel tokens)
    .replace(/<\|?channel\|?>[\s\S]*?<\|?channel\|?>/gi, " ")
    .replace(/<\|?(?:channel|message|start|end)[^>]*\|?>/gi, " ")
    // <think>...</think> / <thought>...</thought>
    .replace(/<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi, " ")
    .replace(/<thought>[\s\S]*?<\/thought>/gi, " ")
    // <start_of_turn> / <end_of_turn> markers
    .replace(/<\/?(?:start|end)_of_turn>/gi, " ");
}

function stripCodeFences(raw: string): string {
  const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  return fenceMatch ? fenceMatch[1] : raw;
}

/**
 * Scans the text for every balanced {...} block and returns them in order.
 * Uses brace-depth counting (string-aware) so nested objects don't confuse
 * the boundaries.
 */
function findBalancedJsonObjects(text: string): string[] {
  const objects: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (ch === "\\") {
        escaped = true;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }

    if (ch === '"') {
      inString = true;
    } else if (ch === "{") {
      if (depth === 0) start = i;
      depth++;
    } else if (ch === "}") {
      depth--;
      if (depth === 0 && start !== -1) {
        objects.push(text.slice(start, i + 1));
        start = -1;
      }
    }
  }

  return objects;
}

/**
 * Parses a candidate JSON string, attempting jsonrepair on failure.
 */
function parseJsonCandidate(candidate: string): any | null {
  try {
    return JSON.parse(candidate);
  } catch {
    try {
      return JSON.parse(jsonrepair(candidate));
    } catch {
      return null;
    }
  }
}

/**
 * Finds the JSON object in the response that actually contains the section's
 * expected key with array/string data. Prefers the LAST such object, since
 * reasoning models emit example schemas first and the real payload last.
 * Returns null if no object with the expected key (and non-trivial data)
 * is found — this rejects the model's chain-of-thought "example" objects
 * like {"competencies": ["item1", "item2"]}.
 */
function tryExtractJson(raw: string, expectedKey: string): any | null {
  const cleaned = stripThinkingTokens(raw);
  const fenced = stripCodeFences(cleaned);

  // Search both the fence-stripped text and the raw cleaned text.
  const candidates = [
    ...findBalancedJsonObjects(fenced),
    ...findBalancedJsonObjects(cleaned),
  ];

  let best: any | null = null;
  for (const candidate of candidates) {
    if (!candidate.includes(`"${expectedKey}"`)) continue;
    const parsed = parseJsonCandidate(candidate);
    if (!parsed || typeof parsed !== "object") continue;
    const value = parsed[expectedKey];
    if (value === undefined) continue;

    // Reject obvious placeholder/example payloads from chain-of-thought
    // (e.g. ["string"], ["item1", "item2"]).
    if (Array.isArray(value)) {
      const looksPlaceholder =
        value.length === 0 ||
        value.every(
          (v) =>
            typeof v === "string" &&
            /^(string|item\d*|category|skill[s]?|\.\.\.)$/i.test(v.trim()),
        );
      if (looksPlaceholder) continue;
    }

    // Keep overwriting so we end up with the LAST valid payload.
    best = parsed;
  }

  return best;
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
 * Detects whether a response is the model's chain-of-thought reasoning
 * rather than a clean answer. If so, the markdown/prose fallbacks must NOT
 * run, because they would capture the reasoning text verbatim (e.g. lines
 * like "Self-Correction:", "Wait, checking item 14 again", "Task:", "Rules:").
 * Better to return nothing and leave the section untouched than to pollute
 * it with the model's internal monologue.
 */
function looksLikeReasoning(text: string): boolean {
  const reasoningMarkers = [
    /\bself-correction\b/i,
    /\bwait,? (?:let me|checking|looking)/i,
    /\bre-?count\b/i,
    /\bre-?read\b/i,
    /\bfinal (?:check|list|count|json)/i,
    /\bdouble check\b/i,
    /^\s*(?:task|rules|input|output|constraints|format)\s*:/im,
    /\bi will (?:treat|join|provide|split|use|stick)\b/i,
    /\bthis is correct\b/i,
    /\bthe prompt says\b/i,
  ];
  const hits = reasoningMarkers.filter((re) => re.test(text)).length;
  return hits >= 2;
}

/**
 * Detects the format of an AI response (json / markdown / prose) and parses
 * it into the shape expected for the given section. Returns null only if no
 * usable data could be recovered at all.
 */
export function parseSectionResponse(raw: string, label: SectionLabel): any | null {
  if (!raw || !raw.trim()) return null;

  const expectedKey = EXPECTED_KEY[label];

  // 1. Try JSON first — strips thinking tokens, finds the LAST balanced JSON
  //    object containing the expected key (rejecting placeholder examples).
  const json = tryExtractJson(raw, expectedKey);
  if (json && typeof json === "object") {
    return json;
  }

  // 2. If the response is clearly the model's chain-of-thought (no clean
  //    JSON payload, just reasoning), do NOT run markdown/prose fallbacks —
  //    they would extract the reasoning text as if it were resume content.
  if (looksLikeReasoning(raw)) {
    console.error(
      `[parseSectionResponse] ${label} response was reasoning, not a JSON payload — skipping section. Preview:`,
      raw.slice(0, 200),
    );
    return null;
  }

  console.warn(`[parseSectionResponse] JSON extraction failed for ${label}, falling back to markdown/prose parsing`);

  // 3. Fall back to markdown/prose parsing based on the section's expected shape.
  const cleaned = stripThinkingTokens(raw);
  switch (label) {
    case "competencies":
      return { competencies: parseFlatListFallback(cleaned) };
    case "certifications":
      return { certifications: parseFlatListFallback(cleaned) };
    case "awards":
      return { awards: parseFlatListFallback(cleaned) };
    case "technicalSkills":
      return parseTechnicalSkillsFallback(cleaned);
    case "experience":
    case "personalProjects":
    case "education":
      return parseEntriesFallback(cleaned, label);
    default:
      return null;
  }
}
