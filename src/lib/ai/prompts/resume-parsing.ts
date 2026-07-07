// Prompts for parsing raw resumes into structured sections

// Zero-tolerance JSON-only directive prepended to every resume-parse prompt.
// Gemma responds well to explicit, absolute formatting constraints and an
// instruction NOT to emit any reasoning / thinking before the JSON.
export const JSON_ONLY_DIRECTIVE = `You are a JSON-only extraction API. You MUST respond with a single valid JSON object and NOTHING else.
ABSOLUTE RULES:
- Do NOT output any reasoning, thinking, planning, self-correction, commentary, notes, or explanation.
- Do NOT output markdown, code fences, headings, or bullet characters.
- Do NOT restate the task, rules, or schema.
- Your entire response must be ONLY the JSON object, starting with "{" and ending with "}".
`;

export const RESUME_PARSE_TECHNICAL_SKILLS_PROMPT = `You are a resume parser. The text below is ONLY the "Technical Skills" / "Technical Proficiencies" / "Tools & Technologies" section of a resume. Extract it into JSON with no markdown, no code fences, no extra text.

Return ONLY valid JSON with this exact shape, replacing every value below with the REAL category names and skills found in the text — do not return the literal example values:
{
  "technicalSkills": [
    { "category": "Cloud Platforms", "skills": ["AWS", "Azure", "GCP"] },
    { "category": "Programming Languages", "skills": ["Python", "TypeScript", "SQL"] }
  ]
}

RULES:
- This is a VERBATIM EXTRACTION task. Copy category names and skill names exactly as written — do not paraphrase, rename, merge, or invent categories.
- Reproduce the source's OWN category headings EXACTLY as written (e.g. if the text says "AI Engineering & Agentic Development:", the category is "AI Engineering & Agentic Development"). If the source lists 8 categories, return 8 categories.
- Each item listed under a category heading (comma-separated or bulleted) becomes one entry in that category's "skills" array. Split on commas — do not keep multiple skills joined into one string.
- If the section has no category headings at all, return a single category named "Technical Skills" containing every item.
- If the section is empty, return {"technicalSkills": []}.`;

export const RESUME_PARSE_COMPETENCIES_PROMPT = `You are a resume parser. The text below is ONLY the "Core Competencies" / "Key Skills" / "Areas of Expertise" section of a resume. Extract it into JSON with no markdown, no code fences, no extra text.

Return ONLY valid JSON with this exact shape, replacing the example values below with the REAL competencies found in the text — do not return the literal example values:
{
  "competencies": ["Stakeholder Management", "Agile Delivery", "Cross-Functional Leadership"]
}

RULES:
- This is a VERBATIM EXTRACTION task. Copy each competency exactly as written, one per array entry, in the same order.
- The source may group competencies under bold sub-heading labels (e.g. "Strategic & Leadership Capabilities") — do NOT include those sub-heading labels as competencies, only the bulleted items underneath them.
- Include EVERY bulleted item across all sub-groups — if there are 30 bullets total, return 30 entries.
- Do not merge, summarize, or reword items.
- If the section is empty, return {"competencies": []}.`;

export const RESUME_PARSE_CERTIFICATIONS_PROMPT = `You are a resume parser. The text below is ONLY the "Certifications" section of a resume. Extract it into JSON with no markdown, no code fences, no extra text.

Return ONLY valid JSON with this exact shape, replacing the example value below with the REAL certifications found in the text — do not return the literal example value:
{
  "certifications": ["Project Management Professional (PMP) - Project Management Institute (2025)"]
}

RULES:
- This is a VERBATIM EXTRACTION task. Copy each certification exactly as written (including issuer and date if present), one per array entry.
- Merge wrapped lines that belong to the same certification into a single entry.
- If the section is empty, return {"certifications": []}.`;

export const RESUME_PARSE_AWARDS_PROMPT = `You are a resume parser. The text below is ONLY the "Awards" / "Honors" section of a resume. Extract it into JSON with no markdown, no code fences, no extra text.

Return ONLY valid JSON with this exact shape, replacing the example value below with the REAL awards found in the text — do not return the literal example value:
{
  "awards": ["Employee of the Year - Acme Corp (2023)"]
}

RULES:
- This is a VERBATIM EXTRACTION task. Copy each award/honor exactly as written, one per array entry.
- Merge wrapped lines that belong to the same award into a single entry.
- If the section is empty, return {"awards": []}.`;

export const RESUME_PARSE_EXPERIENCE_PROMPT = `You are a resume parser. The text below is ONLY the "Professional Experience" / "Work Experience" section of a resume. Extract every role into JSON with no markdown, no code fences, no extra text.

Return ONLY valid JSON with this exact shape, replacing every value below with the REAL roles, companies, dates, and bullets found in the text — do not return the literal example values:
{
  "experience": [
    {
      "title": "Senior Project Manager",
      "company": "Acme Corp",
      "dates": "Jan 2020 - Present",
      "bullets": ["Led a cross-functional team of 12 to deliver a $2M ERP migration."]
    }
  ]
}

RULES:
- This is a VERBATIM EXTRACTION task. Copy bullet text exactly as written — do not paraphrase, shorten, merge, or summarize.
- Include EVERY role found, in order, with exact company names and titles.
- Include EVERY bullet under each role — if a role has 8 bullets in the source, return all 8.
- If the section is empty or contains nothing, return {"experience": []}.`;

export const RESUME_PARSE_PROJECTS_PROMPT = `You are a resume parser. The text below is ONLY the "Personal Projects" / "Projects" / "Side Projects" section of a resume. Extract every project into JSON with no markdown, no code fences, no extra text.

Return ONLY valid JSON with this exact shape, replacing every value below with the REAL projects found in the text — do not return the literal example values:
{
  "personalProjects": [
    {
      "name": "Job Application Tracker",
      "description": "Built a full-stack web app to track job applications and automate resume tailoring using AI.",
      "technologies": ["TypeScript", "React", "Cloudflare Workers"],
      "url": null
    }
  ]
}

RULES:
- Include EVERY project entry found, however many there are. Do not skip, limit, or summarize.
- description: copy verbatim, do not condense.
- technologies: only technologies explicitly mentioned within that specific project's own text.
- If the section is empty or contains nothing, return {"personalProjects": []}.`;

export const RESUME_PARSE_EDUCATION_PROMPT = `You are a resume parser. The text below is ONLY the "Education" section of a resume. Extract every entry into JSON with no markdown, no code fences, no extra text.

Return ONLY valid JSON with this exact shape, replacing every value below with the REAL entries found in the text — do not return the literal example values:
{
  "education": [
    { "degree": "Bachelor of Science", "institution": "State University", "graduationDate": "2015", "fieldOfStudy": "Information Systems" }
  ]
}

RULES:
- Include ALL entries found, even if there are several.
- If the section is empty or contains nothing, return {"education": []}.`;
