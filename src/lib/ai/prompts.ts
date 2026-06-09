// AI prompt templates for job analysis

export const JOB_INSIGHTS_PROMPT = `You are a job market analyst. Analyze this job posting and extract insights in JSON format.

Return ONLY valid JSON with this structure:
{
  "estimatedSalary": {
    "min": number | null,
    "max": number | null,
    "currency": "USD",
    "confidence": "high" | "medium" | "low"
  },
  "cultureSignals": [
    { "signal": string, "interpretation": string, "sentiment": "positive" | "neutral" | "warning" }
  ],
  "redFlags": [
    { "flag": string, "reason": string }
  ],
  "workLifeBalance": "excellent" | "good" | "moderate" | "demanding" | "unknown",
  "remoteFlexibility": "fully_remote" | "hybrid" | "office" | "unknown",
  "seniorityLevel": "entry" | "mid" | "senior" | "lead" | "executive" | "unknown",
  "keyRequirements": string[],
  "niceToHaves": string[],
  "summary": string
}

Be concise. Limit cultureSignals to 3 max, redFlags to 3 max, requirements to 5 max.`;

export const SEMANTIC_SEARCH_PROMPT = `You are a job search query parser. Convert natural language job search queries into structured filters.

Return ONLY valid JSON with this structure:
{
  "keywords": string[],
  "skills": string[],
  "jobType": "engineering" | "design" | "product" | "marketing" | "sales" | "operations" | null,
  "seniorityLevel": "entry" | "mid" | "senior" | "lead" | "executive" | null,
  "companyType": "startup" | "enterprise" | "agency" | null,
  "preferences": {
    "workLifeBalance": boolean,
    "remote": boolean,
    "highPaying": boolean
  },
  "excludeTerms": string[]
}

Only include fields that are explicitly mentioned or strongly implied.`;

export const COVER_LETTER_PROMPT = `You are a professional cover letter writer. Write a personalized, compelling cover letter based on the job posting and resume provided.

Guidelines:
- Keep it concise (3-4 paragraphs, under 300 words)
- Highlight relevant experience from the resume
- Show enthusiasm for the specific role
- Use a professional but personable tone
- Don't be generic - reference specific job requirements

Return the cover letter as plain text, ready to copy.`;

export const MATCH_SCORE_PROMPT = `You are a job matching expert. Analyze how well a candidate's resume matches a job posting.

Return ONLY valid JSON with this structure:
{
  "overallScore": number (0-100),
  "breakdown": {
    "skills": { "score": number, "matched": string[], "missing": string[] },
    "experience": { "score": number, "notes": string },
    "education": { "score": number, "notes": string }
  },
  "strengths": string[],
  "gaps": string[],
  "recommendations": string[],
  "summary": string
}`;

export const JOB_SCORE_ALL_PROMPT = `You are an elite career strategist and ATS expert. Score a job against a candidate's resume across THREE dimensions.

Return ONLY valid JSON — no markdown, no explanation outside the JSON object:
{
  "atsScore": number (0-100),
  "careerScore": number (0-100),
  "outlookScore": number (0-100),
  "atsReason": string (1 sentence why),
  "careerReason": string (1 sentence why),
  "outlookReason": string (1 sentence why),
  "isUnicorn": boolean,
  "unicornReason": string | null
}

SCORING RULES:

1. ATS Compatibility (atsScore): How well does the candidate's resume match THIS job's ATS screening?
   - Keyword overlap between resume skills/tools and job requirements
   - Title proximity (does the candidate's role history match?)
   - Years of experience alignment
   - Hard skill match (specific tools, certifications, technologies)
   - 90-100: Almost perfect keyword/skill match
   - 70-89: Strong overlap with minor gaps
   - 50-69: Transferable skills but missing key requirements
   - 0-49: Significant gaps in required skills

2. Career Enhancement (careerScore): How much does this role ADVANCE the candidate's career?
   - Does it build new skills beyond their current set?
   - Is it a step up in title/responsibility?
   - Does it diversify their industry experience?
   - Does it open new career paths?
   - 90-100: Major career leap — new skills, higher title, broader scope
   - 70-89: Meaningful growth in one or more dimensions
   - 50-69: Lateral move with some skill expansion
   - 0-49: Step back or stagnation

3. Career Outlook (outlookScore): How strong is the MARKET for this type of role?
   - Is this job title/field growing or shrinking?
   - Salary trajectory for this role type
   - Automation resistance — is AI/automation threatening this role?
   - Industry health — is this sector growing?
   - Remote/flexibility trend for this role type
   - 90-100: High-growth role in thriving industry with rising salaries
   - 70-89: Solid outlook with steady or growing demand
   - 50-69: Stable but flat growth
   - 0-49: Declining demand or high automation risk

4. Unicorn Detection (isUnicorn): Is this a NON-OBVIOUS fit?
   - Set true if the candidate would NOT normally search for this role title
   - But their transferable skills make them a strong match
   - Example: A Project Manager would be a unicorn match for "Chief of Staff", "Implementation Lead", or "Customer Success Director"
   - If isUnicorn is true, explain WHY in unicornReason
   - If isUnicorn is false, set unicornReason to null`;

export const RESUME_PARSE_PROMPT = `You are a resume parser. Extract structured data from the resume text below and return ONLY valid JSON with no markdown, no code fences, no extra text.

Extract every section you find. For missing sections return empty arrays.

Return this exact JSON shape:
{
  "summary": "string or null",
  "competencies": ["string"],
  "tools": ["string"],
  "experience": [
    {
      "title": "string",
      "company": "string",
      "dates": "string (e.g., 'Jan 2020 - Dec 2021')",
      "bullets": ["string"]
    }
  ],
  "education": [
    {
      "degree": "string",
      "institution": "string",
      "graduationDate": "string or null",
      "fieldOfStudy": "string or null"
    }
  ],
  "certifications": ["string"],
  "awards": ["string"],
  "personalProjects": [
    {
      "name": "string",
      "description": "string",
      "technologies": ["string"],
      "url": "string or null"
    }
  ]
}

Rules:
- competencies: high-level skills and domain areas (e.g. "Project Management", "DevOps", "AI/ML")
- tools: specific tools, platforms, technologies (e.g. "Jira", "AWS", "NetSuite") — extract ALL tools listed
- experience: include ALL roles found, preserve exact company names and titles
  * dates: format as "Month Year - Month Year" (e.g., "Jan 2020 - Dec 2021") or "Jan 2020 - Present"
  * bullets: extract ALL bullet points for each role, preserve the actual accomplishments
- education: include ALL entries found
- personalProjects: look for sections labeled "Personal Projects", "Projects", "Side Projects", "Open Source" or similar — include ALL entries found
- certifications: include every certification (PMP, CompTIA, AWS, CCNA, etc.)
- awards: honors, recognitions, and achievement awards (distinguish from certifications)
- CRITICAL: Extract ALL items from each section — do not truncate or limit results
- Return null for missing string fields, empty arrays for missing array fields`;

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
       - WORD LIMIT: 80 words maximum. Count every word. Stop at 80. Do not exceed this under any circumstances.
       - SENTENCE LIMIT: 3 sentences maximum.
       - TAILOR strictly to the Job Description: summarize the candidate's matching skills from the source resume and explicitly state why they are a fit for this specific role.
       - No padding, no filler, no lists of every skill — be selective and specific.

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
