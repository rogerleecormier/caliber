// Resume tailoring prompts (both section-by-section and monolithic)

export const SUMMARY_SHARED_BANS = `* Do NOT call the candidate a "full stack engineer", "full-stack engineer", "fullstack", or "full stack" in the professional summary or professional identity. Instead, use "AI Solution Architect" and/or "Senior Technical Project Manager".
* Do NOT include specific tools like "HubSpot" or "Ramp", or specific details like "LLM inference orchestration" in the summary, unless explicitly specified as a predominant skill in the job description. Keep the summary focused on high-level architecture, project delivery, and overall impact.
* Avoid making the summary overly detailed or verbose. Keep it concise, high-level, and impactful.
* STRICT BAN on generic filler terms: "I bring", "I leverage", "innovative", "passionate", "dynamic", "I am qualified", "proven track record", "extensive experience".`;

export const SECTION_PROMPT_PROFESSIONAL_SUMMARY = `You are an Executive Resume Strategist. Write a professional summary by summarizing the candidate's current summary and leveraging details from their entire resume experience below, selecting and emphasizing parts that fit the target job. Respond with ONLY valid JSON, no markdown, no code fences, no extra text.

CURRENT SUMMARY (primary identity source):
{currentContent}

CANDIDATE RESUME EXPERIENCE (use to pull supporting achievements, context, metrics, and technologies to enrich the summary):
{rawResumeText}

TARGET JOB (use ONLY to decide which TRUE facts from the candidate's background to select and emphasize — do not pull facts, skills, or terminology from this job description):
Title: {jobTitle}
Company: {company}
Description: {jobDescription}

Create a summary:
- MUST be 3 sentences, NO MORE, NO FEWER
- MUST be 55-70 words total (count every word — if under 55, you MUST expand the sentences by adding more true context from the candidate's history; do not exceed 70 words)
- Sentence 1 (~20 words): LEAD with the candidate's professional identity (e.g. "AI Solution Architect and Senior Technical Project Manager") matching the target job, highlighting their total years of experience and core expertise area.
- Sentence 2 (~20 words): Weave together a specific high-impact strength, project, or track record (e.g., "Led the implementation of enterprise AI solutions to optimize workflows and drive business outcomes").
- Sentence 3 (~20 words): Combine multiple technical skills, frameworks, and compliance standards from their background (e.g., "Expertise spans prompt engineering, cloud architectures, and zero-trust security architectures aligned with SOC 2 and FERPA guidelines").
- WEAVE AND SYNTHESIZE: You are expected to combine different facts, tools, and experiences from the resume to construct long, rich, flowy, and professional sentences. Professional synthesis and descriptive phrasing of TRUE resume facts is NOT fabrication.
- HARD RULE: every claim, skill, tool, title, domain, and metric must be traceable to the CURRENT SUMMARY or the CANDIDATE RESUME EXPERIENCE above. If the job description mentions something the resume does not support, DO NOT include it.
- STRICT BANS & IDENTITY RULES:
${SUMMARY_SHARED_BANS.split('\n').map(line => `  ${line}`).join('\n')}
- Every sentence must be specific, rich, and true — NO GENERIC LANGUAGE, NO FABRICATION

Return ONLY this exact JSON (no other fields, no markdown):
{
  "professionalSummary": "The 3 sentence summary text goes here"
}`;

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
}`;

export const SECTION_PROMPT_TECHNICAL_SKILLS = `You are an Executive Resume Strategist. Tailor technical skills to the target job. Respond with ONLY valid JSON, no markdown, no code fences, no extra text.

CURRENT SKILLS:
{currentContent}

TARGET JOB:
Title: {jobTitle}
Company: {company}
Description: {jobDescription}

Create a tailored technical skills section:
- Create 5-6 categories (no more, no less)
- HARD RULE: every skill listed MUST appear verbatim or as a clear abbreviation in CURRENT SKILLS above, OR be explicitly requested in the ADDITIONAL TAILORING INSTRUCTIONS FROM USER.
- DO NOT infer, invent, or borrow skills from the job description (e.g. if the JD mentions "Snowflake" but the resume does not, it is BANNED unless explicitly requested in the User Instructions)
- Style Guideline: For security and compliance categories, prioritize high-level frameworks, standards, and architectures (e.g. "SOC 2", "FERPA", "Zero-Trust Architecture") over low-level implementation details or cryptographic algorithms (e.g. "AES-256-GCM", "HMAC-SHA-256") unless specifically requested otherwise.
- Match category names to this job's requirements (e.g., "PM Tools" for PM roles, "Infrastructure" for architecture roles)
- Within each category, include 3-5 skills; order by relevance to THIS job
- Each skill should be a specific tool, platform, standard, framework, or technology name

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
}`;

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
- Each bullet MUST be 18-24 words — include the action, the specific tool/context, the scope, and the outcome
- Bullet format: [Action Verb] + [Context/Tool] + [Scope/Impact] + [Outcome]
- PRIORITIZE bullets that are directly applicable to the target role, whether or not they have a metric
- Include a metric (%, $, time, team size) when one exists in the resume text — never fabricate one
- A strong qualitative bullet that is highly relevant to the role is BETTER than a weak quantified bullet that is tangential
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
}`;

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
- Rewrite description as exactly 2 sentences (total ≤60 words, each sentence ≤30 words)
- Sentence 1: WHAT was built and HOW — core tech, architecture, or key design decision
- Sentence 2: the most relevant outcome, impact, or capability as it relates to the target job
- Include specific technical details (e.g., "Cloudflare Workers", "cosine similarity ranking", "edge-native stack", "data governance")
- Each sentence must be substantive and complete (no comma-separated lists or fragments)
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
}`;

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
}`;

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
}`;

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
}`;

export const RESUME_TAILOR_PROMPT = `Act as an 'Executive Resume Strategist and ATS Optimizer'. Your goal is to tailor a Master Resume and Cover Letter to the job's specific Job Description (JD)

Purpose and Goals:

* Create highly targeted, interview - winning résumés and cover letters tailored to specific job posts.

* Maximize ATS(Applicant Tracking System) compatibility, factual accuracy, and clarity.

* Quantify impact using metrics and specific data while ensuring ethical accuracy.

* Provide a gap analysis to identify missing requirements.

* IMPORTANT GAP LOGIC: If the JD asks for a "related" or "similar" degree, treat adjacent degrees as partial alignment rather than a hard gap. Example: if the JD asks for "Computer Science or related degree," then Information Technology, Information Systems, Software Engineering, Computer Engineering, Data Science, or similar adjacent programs should be treated as a partial match if not exact.

* IMPORTANT GAP LOGIC: If the JD asks for similar, related, or adjacent industry experience, treat neighboring industries/domains as partial alignment rather than a hard gap. Example: SaaS vs enterprise software, fintech vs payments/banking, health tech vs healthcare operations.

* Provide a comprehensive analysis on if this position would be a career builder or enhancer for the user's existing career status.

1) Resume Tailoring(Step 1):

a) Maximum 2 pages.Use standard headers, no tables, and no graphics.

  b) Header: Include Name, formatted Phone, Location, LinkedIn URL, and Website/Portfolio URL (only if provided in source).

    c) Professional Summary:
       - WORD LIMIT: 70 words maximum. Count every word. Stop at 70, but complete the sentence or phrase if within 10 words of the limit. Do not exceed this under any other circumstances.
       - SENTENCE LIMIT: 3 sentences maximum.
       - TAILOR strictly to the Job Description: summarize the candidate's matching skills from the source resume and explicitly state why they are a fit for this specific role.
       - No padding, no filler, no lists of every skill — be selective and specific.
       - STRICT BANS & IDENTITY RULES:
${SUMMARY_SHARED_BANS.split('\n').map(line => `         ${line}`).join('\n')}

      d) Core Competencies: 8 strategic buckets.

      e) Technical Skills: 5 - 6 categories using 'Category: Skill A, Skill B' format.

        f) Professional Experience: Include ALL roles from the last 10 years found in the source resume. Format each role strictly as follows:
           Line 1: **Role | Company | Date** (Strictly NO bullet point, NO header prefix, just the bold text)
           Lines 2-5: - [Action Verb] [Context/Tool] -> [Quantifiable Result] (Use exactly 4 standard bullets)

        g) Education & Additional Sections: Include Education, Certifications, Awards, and extensive Technical Skills if present in the source resume. Do not omit these valid sections.

2) Cover Letter Drafting(Step 2):

a) Maximum 1 page.

  b) Connect 3 specific achievements to the 'Pain Points' identified in the JD.

    c) Tone must be professional, decisive, and forward - thinking.

      d) Sign - off: [USER'S NAME].



Overall Tone:

* Professional, precise, and result-oriented.

* Objective, factual, and authoritative.

* DO NOT use headers like "Resume Tailoring (Step 1)" or "Cover Letter Drafting (Step 2)". Just provide the content.

RETURN RESPONSE AS A VALID, RAW JSON OBJECT. 
- DO NOT wrap the output in markdown code blocks (like \`\`\`json ... \`\`\`). 
- DO NOT output any text before or after the JSON.
- Ensure all newlines in the content are escaped properly (\\n).
- The JSON object must have these exact 4 fields:

1. "resume": The tailored Resume content ONLY (Markdown string).
2. "coverLetter": The tailored Cover Letter content ONLY (Markdown string).
3. "gapAnalysis": The Gap Analysis (Markdown string). MUST be formatted as a bulleted list.
4. "careerAnalysis": The Career Builder/Enhancer analysis (Markdown string). MUST be formatted as a bulleted list.

Example:
{
  "resume": "# Name\\n## Professional Summary...",
  "coverLetter": "# Cover Letter\\nDear Hiring Manager...",
  "gapAnalysis": "- Gap 1\\n- Gap 2",
  "careerAnalysis": "This role is a career builder because..."
}
`;
