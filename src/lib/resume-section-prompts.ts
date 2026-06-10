// Section-specific prompts for tailoring resume sections to job descriptions

export const SECTION_PROMPT_PROFESSIONAL_SUMMARY = `You are an Executive Resume Strategist. Write a professional summary by SUMMARIZING THE CANDIDATE'S CURRENT SUMMARY below, selecting and emphasizing only the parts that fit the target job. Respond with ONLY valid JSON, no markdown, no code fences, no extra text.

CURRENT SUMMARY (the ONLY source of facts, titles, skills, domains, and metrics you may use):
{currentContent}

TARGET JOB (use ONLY to decide which TRUE facts from the current summary to select and emphasize — do not pull facts, skills, or terminology from this job description into the summary):
Title: {jobTitle}
Company: {company}
Description: {jobDescription}

Create a summary:
- MUST be 3-4 sentences, NO MORE, NO FEWER
- MUST be 70-85 words total (count every word — if under 70, add specific true detail from the current summary; if over 85, remove words)
- Sentence 1 (~22 words): candidate's actual title/years of experience/core domains, selected from the current summary because they are most relevant to THIS job
- Sentence 2 (~22 words): a specific strength or track record taken directly from the current summary (include a metric only if it appears there)
- Sentence 3 (~22 words): a second true strength or domain area from the current summary that aligns with the job
- Sentence 4 (optional, ~22 words): a forward-looking statement connecting the candidate's existing (current summary) background to the role — do not promise skills, tools, or experience not present in the current summary
- HARD RULE: every claim, skill, tool, title, domain, and metric must be traceable to the CURRENT SUMMARY above. If the job description mentions something the current summary does not support, DO NOT include it.
- STRICT BAN: "I bring", "I leverage", "innovative", "passionate", "dynamic", "I am qualified", "proven track record", "extensive experience"
- Every sentence must be specific and true — NO GENERIC LANGUAGE, NO FABRICATION

Return ONLY this exact JSON (no other fields, no markdown):
{
  "professionalSummary": "The 3-4 sentence summary text goes here"
}`

export const SECTION_PROMPT_CORE_COMPETENCIES = `You are an Executive Resume Strategist. Tailor core competencies to the target job.

CURRENT COMPETENCIES:
{currentContent}

TARGET JOB:
Title: {jobTitle}
Company: {company}
Description: {jobDescription}

Guidelines:
- Exactly 8 competencies (no more, no less)
- Only use competencies explicitly in the candidate's resume
- Prioritize job description keyword alignment
- Order by relevance to THIS specific job
- Each competency MUST be a short skill/domain phrase of 2-6 words (e.g., "Project Management", "ERP Optimization", "Stakeholder Engagement", "Digital Transformation")
- DO NOT write sentences, clauses, or comma-separated lists; if a source competency is a long phrase, distill it to its core 2-6 word skill/domain name

Return ONLY this exact JSON (no other fields, no markdown):
{
  "coreCompetencies": ["Competency 1", "Competency 2", "Competency 3", "Competency 4", "Competency 5", "Competency 6", "Competency 7", "Competency 8"]
}`

export const SECTION_PROMPT_TECHNICAL_SKILLS = `You are an Executive Resume Strategist. Tailor technical skills to the target job. Respond with ONLY valid JSON, no markdown, no code fences, no extra text.

CURRENT SKILLS:
{currentContent}

TARGET JOB:
Title: {jobTitle}
Company: {company}
Description: {jobDescription}

Create a tailored technical skills section:
- Create 5-6 categories (no more, no less)
- Only include tools/methodologies/platforms explicitly in the candidate's resume
- Match categories to this job's requirements (e.g., "PM Tools" for PM roles, "Infrastructure" for architecture roles)
- Within each category, include 3-5 skills; order by relevance to THIS job
- Each skill should be a specific tool, platform, or technology name

Return ONLY this exact JSON (no other fields, no markdown):
{
  "technicalSkills": [
    {
      "category": "Category Name 1",
      "skills": ["Skill 1", "Skill 2", "Skill 3", "Skill 4", "Skill 5"]
    },
    {
      "category": "Category Name 2",
      "skills": ["Skill 1", "Skill 2", "Skill 3", "Skill 4"]
    }
  ]
}`

export const SECTION_PROMPT_PROFESSIONAL_EXPERIENCE = `You are an Executive Resume Strategist. Tailor professional experience bullets to the target job.

CANDIDATE BACKGROUND:
{currentContent}

CANDIDATE RESUME TEXT:
{rawResumeText}

TARGET JOB:
Title: {jobTitle}
Company: {company}
Description: {jobDescription}

Guidelines:
- Preserve ALL roles from the resume exactly as provided (no omissions, no merges)
- For each role, keep the title and company exactly as stated
- For dates: combine startDate and endDate (or use startDate only if endDate is missing)
  Example: "Jan 2020 - Dec 2021" or "Jan 2020 - Present"
- Rewrite exactly 5 bullets per role using JD language and patterns (if the role has fewer than 5 source bullets, expand by splitting compound bullets into distinct, specific bullets — do not fabricate)
- Each bullet MUST be 18-24 words — include the action, the specific tool/context, the scope, and a quantifiable result
- Bullet format: [Action Verb] + [Context/Tool] + [Quantifiable Result] + [Metric if available]
- Surface real metrics from the resume text (%, $, time, team size) — never fabricate
- If no metric exists, state the strongest factual result
- Different JDs should produce different bullet selections from the same resume
- NO FABRICATION: every achievement must be grounded in the resume text

Respond with ONLY valid JSON:
{
  "experience": [
    {
      "title": "string",
      "company": "string",
      "dates": "string (e.g., 'Jan 2020 - Dec 2021')",
      "bullets": ["string x4-6"]
    },
    ...
  ]
}`

export const SECTION_PROMPT_PERSONAL_PROJECTS = `You are an Executive Resume Strategist. Tailor personal projects to the target job.

CURRENT PROJECTS:
{currentContent}

TARGET JOB:
Title: {jobTitle}
Company: {company}
Description: {jobDescription}

Guidelines:
- Select the 3-4 MOST RELEVANT projects to THIS job (do not include all projects if there are more than 4)
- Order by relevance to the job description, most relevant first
- Preserve: name, technologies, url exactly as stated
- Rewrite description as 4-6 bullet lines (each line ≤25 words; aim for 4-5 substantive bullets per project)
- Each bullet should cover ONE distinct achievement or capability: a technical decision, an architecture pattern, a key outcome/metric, or direct relevance to the job
- DO NOT create bullet lists with multiple topics per line; keep each bullet focused and specific
- Include: architecture decisions, technologies used, scale/scope achieved, or measurable outcomes where they exist
- Connect the project's skills/outcomes to job requirements where applicable
- If a project has no clear relevance, keep description factual without forced connections

Respond with ONLY valid JSON:
{
  "personalProjects": [
    {
      "name": "string",
      "description": "string",
      "technologies": ["string"],
      "url": "string or null"
    },
    ...
  ]
}`

export const SECTION_PROMPT_EDUCATION = `You are an Executive Resume Strategist. Format education for this job.

CURRENT EDUCATION:
{currentContent}

TARGET JOB:
Title: {jobTitle}
Company: {company}
Description: {jobDescription}

Guidelines:
- Copy exactly: degree, field of study, institution, graduation year
- No tailoring needed for education (copy from resume as-is)
- Ensure degree field and institution are capitalized correctly

Respond with ONLY valid JSON:
{
  "education": [
    {
      "degree": "string",
      "fieldOfStudy": "string",
      "institution": "string",
      "year": "string"
    },
    ...
  ]
}`

export const SECTION_PROMPT_CERTIFICATIONS = `You are an Executive Resume Strategist. Format certifications for this job.

CURRENT CERTIFICATIONS:
{currentContent}

TARGET JOB:
Title: {jobTitle}
Company: {company}
Description: {jobDescription}

Guidelines:
- Include ALL certifications from the resume (no omissions)
- Copy exactly: every certification name as stated
- No tailoring needed (copy as-is); order by relevance to THIS job if it helps, but do not drop any

Respond with ONLY valid JSON:
{
  "certifications": ["string", ...]
}`

export const SECTION_PROMPT_AWARDS = `You are an Executive Resume Strategist. Format awards for this job.

CURRENT AWARDS:
{currentContent}

TARGET JOB:
Title: {jobTitle}
Company: {company}
Description: {jobDescription}

Guidelines:
- Copy exactly: every award as stated in the resume
- No tailoring needed (copy as-is)
- Preserve exact names and any associated details

Respond with ONLY valid JSON:
{
  "awards": ["string", ...]
}`
