export const ATS_SECTION_ORDER = [
  "Name Header",
  "Contact Information",
  "Professional Summary",
  "Core Competencies",
  "Technical Skills",
  "Professional Experience",
  "Selected Projects",
  "Education",
  "Certifications",
  "Awards",
] as const;

export type AtsSection = (typeof ATS_SECTION_ORDER)[number];

export interface AtsResumeContent {
  nameHeader: string;
  contactInfo: string;
  professionalSummary: string;
  coreCompetencies: string[];
  technicalSkills: Array<{
    category: string;
    skills: string[];
  }>;
  experience: Array<{
    title: string;
    company: string;
    dates: string;
    bullets: string[];
  }>;
  projects?: Array<{
    name: string;
    description: string;
  }>;
  education: Array<{
    degree: string;
    fieldOfStudy?: string;
    institution: string;
    year: string;
  }>;
  certifications: string[];
  awards?: string[];
}

export interface StrategicAssessment {
  matchScore: number;
  matchRationale: string;
  gapAnalysis: Array<{
    requirement: string;
    status: "covered" | "partial" | "missing";
    suggestion?: string;
  }>;
  strategyNote: string;
  careerAnalysis: {
    trajectory: string;
    recommendation: "pursue" | "consider" | "pass";
    reasoning: string;
  };
}

export interface KeywordMapping {
  keyword: string;
  priority: "critical" | "high" | "medium" | "nice_to_have";
  placement: string;
}

export interface CoverLetterContent {
  greeting: string;
  opening: string;
  bullets: string[];
  body?: string;
  closing: string;
  signoff: string;
  candidateName: string;
}

export const STRATEGIC_ASSESSMENT_PROMPT = `You are an Executive Resume Strategist. Score this candidate against the target job and return ONLY valid JSON.

CANDIDATE DATA: {candidateData}
TARGET JOB: {jobDescription}

Notes: Mark adjacent degrees/experience as "partial" not "missing". Do not invent gaps.

{
  "matchScore": 0-100,
  "matchRationale": "string",
  "gapAnalysis": [{"requirement":"string","status":"covered|partial|missing","suggestion":"string"}],
  "strategyNote": "string — how to position candidate background to mitigate gaps",
  "careerAnalysis": {"trajectory":"string","recommendation":"pursue|consider|pass","reasoning":"string"}
}`;

export const RESUME_GENERATION_PROMPT = `You are an Executive Resume Strategist and ATS Optimizer. Generate a targeted resume as valid JSON only.

NO FABRICATION — READ CAREFULLY, THIS IS THE MOST IMPORTANT RULE:
- Every responsibility, duty, tool, scope detail, and metric in every bullet MUST be traceable to a specific sentence in the candidate's structured data or raw resume text below. If you cannot point to where it comes from, do not write it.
- Do NOT add a responsibility just because the job description mentions it or because it's typical for the job title (e.g., do not add "budget management," "procurement," "staff supervision," "P&L ownership," or any other duty unless the candidate's resume text explicitly says they did it).
- Do NOT infer adjacent skills, embellish scope (team size, budget size, number of stakeholders), or invent metrics that aren't in the source text.
- It is CORRECT and EXPECTED for some bullets to not perfectly match the JD — do not manufacture alignment that isn't real. A slightly-less-tailored-but-true bullet is always better than a fabricated one.

EXPERIENCE COUNT: The candidate has exactly {experienceCount} job(s). Output MUST contain exactly {experienceCount} experience entries — no omissions, no merges.

TAILORING PROCESS (in order):
1. Extract from the JD: required skills/tools, methodologies, business outcomes, seniority scope.
2. For each candidate role, identify 10+ distinct achievements ACTUALLY DESCRIBED in the raw resume text — do not generate achievements the JD implies should exist.
3. SELECT the 6 achievements per role that best match THIS JD from what is actually in the source — JD fit is the primary criterion among real achievements; metric availability is secondary. Different JDs must produce different bullet selections, but only from real material.
4. Reword bullets using the JD's own vocabulary/phrasing ONLY where the underlying duty, tool, or outcome already exists in the source text. Rewording changes word choice, not substance — never use this step to introduce a responsibility that wasn't there.
5. Preserve exactly: company names, titles, dates, certifications, education.

ADDITIONAL TAILORING GUIDANCE is mandatory where the candidate's actual data supports it — it never authorizes adding unsupported content.

SECTIONS:
- Professional Summary: exactly 3 sentences, ≤100 words, grounded only in the resume. Sentence 1: title, years of experience, core domains. Sentence 2: the candidate's most relevant strength or track record for this role — a real capability or pattern of success; include a metric only if one fits naturally, not as a requirement. Sentence 3: a forward-looking value statement — connect the candidate's specific background to what they will deliver or contribute at this company and in this role. No filler — ban "I bring", "I leverage", "innovative solutions", "passionate about", "dynamic environment", "I am confident", "I am qualified", "qualified because", "my qualifications". Every sentence must state something specific and true about this candidate.
- Core Competencies: exactly 8, from skills explicitly in the resume. Prioritize JD keyword alignment and tailoring guidance.
- Technical Skills: 5–6 categories, only tools/methodologies in the candidate's data. Match categories to the JD (PM tools for PM roles, infra tools for architecture roles, etc.).
- Professional Experience: exactly 6 bullets per role.
  BULLET FORMAT — [Action Verb] + [What I Did, with specific context/scope/tools] + [Result] + [Metric if available in resume text]. Aim for a full, substantive sentence of roughly 25-35 words that includes real context (which tools, which stakeholders, what scale) alongside the result — but the length must come from real specifics already in the source text. NEVER pad a bullet with an invented tool, stakeholder group, scope detail, or duty just to hit the target length; a shorter, fully accurate bullet is always correct over a longer one with any unsupported detail.
  JD fit picks the bullet. Surface real metrics (%, $, time, team size) when they exist in the resume text — never fabricate. If no metric exists, state the strongest factual result with full context.
  Example with metric: "Spearheaded AP automation across Ramp and NetSuite for 150+ client schools, redesigning approval workflows and reconciliation controls to reduce month-end close time by 35% and cut manual effort by 70%."
  Example without metric: "Led cross-functional stakeholder alignment across engineering, finance, and operations teams spanning three time zones to define governance requirements and deliver the ERP cutover on schedule."
  Before finalizing each bullet, verify: every noun and claim in it (tools, teams, scope, outcome) appears somewhere in the candidate's structured data or raw resume text. If any part doesn't, remove or rewrite that part using only supported content.
- Selected Projects: If the candidate resume text contains a personal-projects, side-project, or product/engineering portfolio section (independently built applications, open-source work, hackathon entries, etc.), include EVERY project listed there. For each, write a fuller 2-3 sentence description (not a single condensed clause) covering what the project is, the key technologies/architecture used, and its most relevant technical or business impact. Do NOT omit this section or drop any project if the source resume text contains one; only omit the "projects" field entirely if no such section exists in the resume text.
- Education: degree type, field of study, institution, year — copied exactly.
- Certifications: copy every certification — omit none (PMP, CompTIA A+/Network+/Security+, CCNA, AWS, etc.).
- Awards: If the candidate resume text contains an awards, honors, or recognitions section, copy EVERY award/honor listed there verbatim — omit none. Only omit the "awards" field entirely if no such section exists in the resume text.

CANDIDATE STRUCTURED DATA:
{candidateData}

CANDIDATE RESUME TEXT:
{rawResumeText}

TARGET JOB — Title: {jobTitle} | Company: {company}
DESCRIPTION: {jobDescription}
KEYWORDS: {keywords}
TAILORING GUIDANCE: {extraGuidance}

Respond with valid JSON only:
{
  "nameHeader": "string",
  "contactInfo": "string (Email | Phone | LinkedIn | Website)",
  "professionalSummary": "string",
  "coreCompetencies": ["string x8"],
  "technicalSkills": [{"category": "string", "skills": ["string"]}],
  "experience": [{"title":"string","company":"string","dates":"string","bullets":["string x6"]}],
  "projects": [{"name":"string","description":"string"}],
  "education": [{"degree":"string","fieldOfStudy":"string","institution":"string","year":"string"}],
  "certifications": ["string"],
  "awards": ["string"]
}`;

export const ADDITIONAL_SECTIONS_PROMPT = `You are a precise resume data extractor. Your ONLY job is to find and copy two optional sections from the candidate's resume text — do not summarize, tailor, or rewrite anything else.

NO FABRICATION: Copy only what is explicitly present in the resume text below. If a section does not exist in the text, return an empty array for it — do not invent one.

1. SELECTED PROJECTS: Look for a personal-projects, side-project, or product/engineering portfolio section (independently built applications, open-source work, hackathon entries, etc. — often titled something like "Projects," "Portfolio," "Selected Product & Engineering Portfolio," or similar). If found, list EVERY project mentioned there. For each, give its name and a fuller 2-3 sentence description — what the project is, the key technologies/architecture used, and its most relevant technical or business impact — prioritizing relevance to the target job below when choosing which details to keep. Do not compress this down to a single short clause, and do not drop any project that appears in the source section.

2. AWARDS: Look for an awards, honors, or recognitions section (often titled "Awards," "Honors," "Awards & Honors," or similar). If found, copy EVERY award/honor listed there VERBATIM, word for word — omit none.

CANDIDATE RESUME TEXT:
{rawResumeText}

TARGET JOB — Title: {jobTitle} | Company: {company}

Respond with valid JSON only, no text before or after:
{
  "projects": [{"name": "string", "description": "string"}],
  "awards": ["string"]
}`;

export const COVER_LETTER_PROMPT = `You are an Executive Resume Strategist. Write a cover letter as valid JSON only. No fabrication — use only real achievements and metrics from the candidate's resume.

OPENING (most important):
- First word MUST be one of: "Imagine", "Consider", "Picture", "When", "What" — use whichever fits naturally with the achievement.
- Frame the opening as a complete sentence that draws the reader into a scenario or result, then follow with a second sentence connecting it to this role at {company}.
- Do NOT open with "I", "As a", "With my", "Reduced", "Led", or any fragment. The first sentence must be grammatically complete.
- Example: "Imagine cutting month-end close time by 35% through a full AP modernization — that's what I delivered at Vertex Education, and it's exactly the kind of impact I'm looking to bring to {company}."

BULLETS: exactly 3. Each is one complete sentence: [Action verb] + [what was done] + [specific result with metric]. No explanatory tails ("demonstrating my ability to...", "as evidenced by...", "such as..."). End at the result.
CLOSING: one short paragraph connecting this candidate's specific background to THIS company's stated needs. No generic phrases ("passion for", "I am confident", "I look forward to").
TONE: direct, confident, professional.
TAILORING GUIDANCE is mandatory where the resume supports it.

CANDIDATE DATA: {candidateData}
CANDIDATE RESUME TEXT: {rawResumeText}

TARGET JOB — Title: {jobTitle} | Company: {company}
DESCRIPTION: {jobDescription}
PAIN POINTS: {painPoints}
TAILORING GUIDANCE: {extraGuidance}

{
  "greeting": "Dear Hiring Manager,",
  "opening": "string",
  "bullets": ["string", "string", "string"],
  "closing": "string",
  "signoff": "string",
  "candidateName": "string"
}`;

export const KEYWORD_VERIFICATION_PROMPT = `Analyze keyword placement and missing keywords.

JD KEYWORDS:
{jdKeywords}

RESUME CONTENT:
{resumeContent}

Respond with JSON:
{
  "keywordMappings": [
    {"keyword": "string", "priority": "critical|high|medium|nice_to_have", "placement": "section name or NOT FOUND"}
  ],
  "excludedKeywords": [
    {"keyword": "string", "transferableBridge": "string"}
  ],
  "assumptions": ["[ASSUMPTION] notes"],
  "verifications": ["[VERIFY] notes"]
}`;
