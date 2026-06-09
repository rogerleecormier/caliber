export const ATS_SECTION_ORDER = [
  "Name Header",
  "Contact Information",
  "Professional Summary",
  "Core Competencies",
  "Technical Skills",
  "Professional Experience",
  "Education",
  "Certifications",
  "Personal Projects",
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
  education: Array<{
    degree: string;
    fieldOfStudy?: string;
    institution: string;
    year: string;
  }>;
  certifications: string[];
  personalProjects?: Array<{
    name: string;
    description: string;
    technologies?: string[];
    url?: string;
  }>;
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

NO FABRICATION: Every word must come from the candidate's actual resume data. Never infer adjacent skills, embellish achievements, or invent metrics. Use only what is explicitly in the structured data or raw resume text.

EXPERIENCE COUNT: The candidate has exactly {experienceCount} job(s). Output MUST contain exactly {experienceCount} experience entries — no omissions, no merges.

TAILORING PROCESS (in order):
1. Extract from the JD: required skills/tools, methodologies, business outcomes, seniority scope.
2. For each candidate role, identify 10+ distinct achievements in the raw resume text.
3. SELECT the 6 achievements per role that best match THIS JD — JD fit is the primary criterion; metric availability is secondary. Different JDs must produce different bullet selections.
4. Reword bullets using the JD's own language patterns.
5. Preserve exactly: company names, titles, dates, certifications, education.

ADDITIONAL TAILORING GUIDANCE is mandatory — reflect it in bullets and competencies wherever the candidate's data supports it.

SECTIONS:
- Professional Summary: exactly 3 sentences, ≤100 words, grounded only in the resume. Sentence 1: title, years of experience, core domains. Sentence 2: the candidate's most relevant strength or track record for this role — a real capability or pattern of success; include a metric only if one fits naturally, not as a requirement. Sentence 3: a forward-looking value statement — connect the candidate's specific background to what they will deliver or contribute at this company and in this role. No filler — ban "I bring", "I leverage", "innovative solutions", "passionate about", "dynamic environment", "I am confident", "I am qualified", "qualified because", "my qualifications". Every sentence must state something specific and true about this candidate.
- Core Competencies: exactly 8, from skills explicitly in the resume. Prioritize JD keyword alignment and tailoring guidance.
- Technical Skills: 5–6 categories, only tools/methodologies in the candidate's data. Match categories to the JD (PM tools for PM roles, infra tools for architecture roles, etc.).
- Professional Experience: exactly 6 bullets per role.
  BULLET FORMAT — [Action Verb] + [What I Did] + [Result] + [Metric if available in resume text].
  JD fit picks the bullet. Surface real metrics (%, $, time, team size) when they exist in the resume text — never fabricate. If no metric exists, state the strongest factual result.
  Example with metric: "Spearheaded AP automation using Ramp and NetSuite, reducing month-end close time by 35% and cutting manual effort by 70%."
  Example without metric: "Led cross-functional stakeholder alignment across engineering, finance, and operations to deliver ERP cutover on schedule."
- Education: degree type, field of study, institution, year — copied exactly.
- Certifications: copy every certification — omit none (PMP, CompTIA A+/Network+/Security+, CCNA, AWS, etc.).
- Personal Projects: include only if present in the candidate's data or raw resume text. Each project must have a name and description (1–2 sentences max). Include technologies array if mentioned. Include url if present. Omit this section entirely if no personal projects exist.

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
  "education": [{"degree":"string","fieldOfStudy":"string","institution":"string","year":"string"}],
  "certifications": ["string"],
  "personalProjects": [{"name":"string","description":"string","technologies":["string"],"url":"string"}]
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
