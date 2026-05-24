import type { CloudflareEnv } from "@/lib/cloudflare";
import {
  allocateTokenBudgets,
  callClaude,
  truncateToTokenBudget,
  WORKERS_AI_CONTEXT_WINDOW_TOKENS,
} from "@/lib/ai-gateway";
import { jsonrepair } from "jsonrepair";

export interface SalaryAssessment {
  listed: string | null;
  projectedRange: string;
  assessment: string;
}

export interface CareerAnalysis {
  trajectory: string;
  recommendation: "pursue" | "consider" | "pass";
  reasoning: string;
  salaryAssessment?: SalaryAssessment;
}

export interface CultureSignal {
  signal: string;
  interpretation: string;
  sentiment: "positive" | "neutral" | "warning";
}

export interface RedFlag {
  flag: string;
  reason: string;
}

export interface JobInsightsSection {
  workLifeBalance: "excellent" | "good" | "moderate" | "demanding" | "unknown";
  remoteFlexibility: "fully_remote" | "hybrid" | "office" | "unknown";
  seniorityLevel: "entry" | "mid" | "senior" | "lead" | "executive" | "unknown";
  cultureSignals: CultureSignal[];
  redFlags: RedFlag[];
}

export interface GapItem {
  requirement: string;
  status: "covered" | "partial" | "missing";
  requirementType?: "required" | "preferred";
  suggestion: string;
}

export interface ComprehensiveAnalysis {
  matchScore: number;
  gapAnalysis: GapItem[];
  recommendations: string[];
  pursue: boolean;
  pursueJustification: string;
  keywords: string[];
  jobTitle: string;
  company: string;
  industry: string;
  location: string;
  strategyNote: string;
  personalInterest: string;
  careerAnalysis: CareerAnalysis;
  insights?: JobInsightsSection;
}

const GAP_STOP_WORDS = new Set([
  "the","and","for","with","that","this","from","into","your","you","are","was","were","have","has","had","will","would","should","could","about","over","under","through","while","where","when","what","which","years","year","experience","required","preferred","ability","strong","knowledge","skills","skill",
]);

const TOOL_REQUIREMENT_GENERIC_TERMS = new Set([
  "basic","familiar","with","or","other","portfolio","program","project","management","software","platform","tool","tools","system","systems","application","applications",
]);

const NAMED_TECH_PATTERN_MAP: Array<{ key: string; pattern: RegExp }> = [
  { key: "google-cloud", pattern: /\b(google cloud|gcp|google cloud platform)\b/ },
  { key: "kubernetes", pattern: /\b(kubernetes|k8s)\b/ },
  { key: "docker", pattern: /\b(docker|dockerized)\b/ },
  { key: "aws", pattern: /\b(aws|amazon web services)\b/ },
  { key: "azure", pattern: /\b(azure|microsoft azure)\b/ },
  { key: "terraform", pattern: /\b(terraform)\b/ },
  { key: "ansible", pattern: /\b(ansible)\b/ },
  { key: "jenkins", pattern: /\b(jenkins)\b/ },
  { key: "langchain", pattern: /\b(langchain)\b/ },
  { key: "n8n", pattern: /\b(n8n)\b/ },
  { key: "dify", pattern: /\b(dify)\b/ },
];

const AI_ORCHESTRATION_TECH_KEYS = new Set(["langchain", "n8n", "dify"]);

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9+.#\s-]/g, " ").replace(/\s+/g, " ").trim();
}

function extractKeywordTokens(text: string): string[] {
  return normalizeText(text).split(" ").map((t) => t.trim()).filter((t) => t.length >= 3 && !GAP_STOP_WORDS.has(t));
}

function extractToolSpecificTokens(text: string): string[] {
  return normalizeText(text).split(" ").map((t) => t.trim()).filter((t) => t.length >= 3 && !TOOL_REQUIREMENT_GENERIC_TERMS.has(t));
}

function getMentionedNamedTechKeys(text: string): string[] {
  const n = normalizeText(text);
  return NAMED_TECH_PATTERN_MAP.filter(({ pattern }) => pattern.test(n)).map(({ key }) => key);
}

function hasExplicitNamedTechEvidence(requirement: string, evidenceText: string): boolean {
  const keys = getMentionedNamedTechKeys(requirement);
  if (keys.length === 0) return false;
  return keys.every((key) => { const e = NAMED_TECH_PATTERN_MAP.find((d) => d.key === key); return e ? e.pattern.test(evidenceText) : false; });
}

function isNamedTechRequirement(requirement: string): boolean {
  return getMentionedNamedTechKeys(requirement).length > 0;
}

function hasPortfolioProgramSoftwareEvidence(evidenceText: string): boolean {
  return /(clarity|planview|asana|smartsheet|monday\.com|monday|jira|ms project|microsoft project|workfront|service ?now ppm|portfolio management software|program management software|project management software)/.test(evidenceText);
}

function hasNamedToolRequirementWithoutDirectEvidence(requirement: string, evidenceText: string): boolean {
  const n = normalizeText(requirement);
  const namedTools = ["clarity","planview","workfront","service now ppm","servicenow ppm","google cloud","google cloud platform","gcp","kubernetes","k8s","docker","aws","azure","terraform","ansible","jenkins","langchain","n8n","dify"];
  return namedTools.some((tool) => n.includes(tool) && !evidenceText.includes(tool));
}

type EvidenceStatus = "none" | "partial" | "covered";

interface GapEvidenceAssessment {
  id: number;
  evidenceStatus: EvidenceStatus;
}

const CERTIFICATION_PATTERN_MAP: Array<{ key: string; pattern: RegExp }> = [
  { key: "csm", pattern: /\b(csm|certified scrum master)\b/ },
  { key: "safe-agilist", pattern: /\b(safe(?:\s+agilist)?|sa\b|leading\s+safe)\b/ },
  { key: "pmp", pattern: /\b(pmp|project management professional)\b/ },
  { key: "prince2", pattern: /\b(prince2|prince\s*2)\b/ },
  { key: "lean-six-sigma", pattern: /\b(lean\s+six\s+sigma|six\s+sigma)\b/ },
  { key: "itil", pattern: /\bitil\b/ },
];

function getMentionedCertificationKeys(text: string): string[] {
  const n = normalizeText(text);
  return CERTIFICATION_PATTERN_MAP.filter(({ pattern }) => pattern.test(n)).map(({ key }) => key);
}

function hasAnyCertificationSignal(evidenceText: string): boolean {
  return /(certified|certification|certificate|credential|pmp|scrum master|safe|agilist|prince2|itil|six sigma)/.test(evidenceText);
}

function isCertificationRequirement(requirement: string): boolean {
  return /(certified|certification|certificate|credential|csm|scrum master|safe|agilist|pmp|project management professional|prince2|itil|six sigma)/.test(normalizeText(requirement));
}

function isEducationRequirement(requirement: string): boolean {
  return /(bachelor|master|mba|phd|doctorate|degree|education|university|college|academic|graduation|undergraduate|graduate)/.test(normalizeText(requirement));
}

function hasAnyDegreeEvidence(evidenceText: string): boolean {
  return /\b(bachelor|master|mba|phd|doctorate|b\.?s\.?|b\.?a\.?|m\.?s\.?|m\.?a\.?|degree|university|college)\b/.test(evidenceText);
}

function hasExplicitEducationOptionEvidence(requirement: string, evidenceText: string): boolean {
  const n = normalizeText(requirement);
  if (!hasAnyDegreeEvidence(evidenceText)) return false;

  const optionPatterns: RegExp[] = [];

  if (/information technology|it\b/.test(n)) {
    optionPatterns.push(/\b(information technology|it)\b/);
  }
  if (/information systems|management information systems|mis\b/.test(n)) {
    optionPatterns.push(/\b(information systems|management information systems|mis)\b/);
  }
  if (/computer science|cs\b/.test(n)) {
    optionPatterns.push(/\b(computer science|cs)\b/);
  }
  if (/software engineering/.test(n)) {
    optionPatterns.push(/\bsoftware engineering\b/);
  }
  if (/computer engineering/.test(n)) {
    optionPatterns.push(/\bcomputer engineering\b/);
  }
  if (/business|business administration/.test(n)) {
    optionPatterns.push(/\b(business|business administration|mba)\b/);
  }
  if (/healthcare|health care|public health|health administration/.test(n)) {
    optionPatterns.push(/\b(healthcare|health care|public health|health administration)\b/);
  }
  if (/data science|analytics/.test(n)) {
    optionPatterns.push(/\b(data science|analytics|statistics|mathematics)\b/);
  }

  return optionPatterns.some((pattern) => pattern.test(evidenceText));
}

function isITProjectManagementRequirement(requirement: string): boolean {
  const n = normalizeText(requirement);
  return /(it project management|technical project management|technology project management|technical program management|it program management)/.test(n);
}

function hasITProjectManagementEvidence(evidenceText: string): EvidenceStatus {
  if (/(it project management|technical project management|technology project management|technical program management|it program management)/.test(evidenceText)) {
    return "covered";
  }
  if (/(project management|program management|portfolio management)/.test(evidenceText) && /(technical|technology|software|systems|infrastructure|cloud|application|implementation|digital|platform)/.test(evidenceText)) {
    return "covered";
  }
  if (/(project management|program management|portfolio management|pmp|project management professional|scrum master)/.test(evidenceText)) {
    return "partial";
  }
  return "none";
}

function hasAdjacentEducationEvidence(requirement: string, evidenceText: string): boolean {
  const n = normalizeText(requirement);
  if (!hasAnyDegreeEvidence(evidenceText)) return false;

  if (/computer science|cs\b/.test(n)) {
    return /(information technology|information systems|management information systems|software engineering|computer engineering|data science|cybersecurity|informatics)/.test(evidenceText);
  }

  if (/information technology|it\b/.test(n)) {
    return /(computer science|information systems|management information systems|software engineering|computer engineering|cybersecurity|informatics)/.test(evidenceText);
  }

  if (/information systems|management information systems|mis\b/.test(n)) {
    return /(computer science|information technology|software engineering|computer engineering|data science|cybersecurity|informatics)/.test(evidenceText);
  }

  if (/software engineering/.test(n)) {
    return /(computer science|information technology|information systems|computer engineering|data science|cybersecurity)/.test(evidenceText);
  }

  if (/computer engineering/.test(n)) {
    return /(computer science|software engineering|information technology|information systems|data science|cybersecurity)/.test(evidenceText);
  }

  if (/data science|analytics/.test(n)) {
    return /(computer science|statistics|mathematics|information systems|information technology|computer engineering)/.test(evidenceText);
  }

  if (/related degree|similar degree|or related/.test(n)) return true;
  return false;
}

function isDomainContextRequirement(requirement: string): boolean {
  return /(fintech|financial technology|financial services|banking|payments|healthcare|health tech|medtech|ecommerce|retail tech|insurtech|saas|regulated industry|industry experience|domain experience|sector experience|similar industry|related industry|adjacent industry|enterprise software|b2b software|b2c|consumer|automotive|industrial|manufacturing|mobility|transportation|aerospace|energy|utilities)/.test(normalizeText(requirement));
}

function hasExplicitDomainEvidence(requirement: string, evidenceText: string): boolean {
  const n = normalizeText(requirement);
  if (/automotive/.test(n) && /\bautomotive\b/.test(evidenceText)) return true;
  if (/industrial/.test(n) && /\bindustrial\b/.test(evidenceText)) return true;
  if (/manufacturing/.test(n) && /\bmanufacturing\b/.test(evidenceText)) return true;
  if (/mobility|transportation/.test(n) && /\b(mobility|transportation|transport)\b/.test(evidenceText)) return true;
  if (/aerospace/.test(n) && /\baerospace\b/.test(evidenceText)) return true;
  if (/energy|utilities/.test(n) && /\b(energy|utilities|utility)\b/.test(evidenceText)) return true;
  if (/fintech|financial technology/.test(n) && /(fintech|payments?|banking|financial services)/.test(evidenceText)) return true;
  if (/healthcare|health tech|medtech/.test(n) && /(healthcare|health tech|medtech|clinical|patient|provider|ehr|emr)/.test(evidenceText)) return true;
  if (/ecommerce|retail tech/.test(n) && /(ecommerce|retail|marketplace|merchant|checkout|fulfillment)/.test(evidenceText)) return true;
  return false;
}

function hasTransferableDomainEvidence(requirement: string, evidenceText: string): boolean {
  const n = normalizeText(requirement);
  if (/fintech|financial technology/.test(n)) return /(payments?|payment processing|banking|financial services|pci|fraud|kyc|aml|risk|compliance|treasury|subscription billing|merchant|card|lending|insurance)/.test(evidenceText);
  if (/healthcare|health tech|medtech/.test(n)) return /(hipaa|clinical|patient|provider|ehr|emr|care management|health plan|medical device|pharmacy)/.test(evidenceText);
  if (/ecommerce|retail tech/.test(n)) return /(checkout|cart|merchant|sku|inventory|fulfillment|order management|marketplace|consumer platform)/.test(evidenceText);
  if (/automotive|industrial|manufacturing|mobility|transportation/.test(n)) return /(hardware|embedded|supply chain|operations|warehouse|logistics|field service|iot|platform|systems integration)/.test(evidenceText);
  if (/saas|enterprise software|b2b software/.test(n)) return /(software|platform|subscription|enterprise|b2b|workflow|implementation|customer success|product|cloud)/.test(evidenceText);
  if (/consumer|b2c/.test(n)) return /(consumer platform|marketplace|ecommerce|retail|mobile app|growth|acquisition)/.test(evidenceText);
  if (/similar industry|related industry|adjacent industry|industry experience|domain experience|sector experience/.test(n)) {
    return /(saas|software|enterprise|b2b|b2c|payments|banking|financial services|healthcare|health tech|medtech|ecommerce|retail|marketplace|regulated|compliance|insurance|cloud)/.test(evidenceText);
  }
  return false;
}

function hasTransferableSkillEvidence(requirement: string, evidenceText: string): boolean {
  if (isCertificationRequirement(requirement) || isEducationRequirement(requirement) || isNamedTechRequirement(requirement)) return false;
  if (hasTransferableDomainEvidence(requirement, evidenceText)) return true;
  const tokens = extractKeywordTokens(requirement).filter((t) => !["fintech","industry","domain","experience","background"].includes(t));
  if (tokens.length === 0) return false;
  const matches = tokens.filter((t) => evidenceText.includes(t)).length;
  return matches >= 1 && matches < Math.max(2, Math.ceil(tokens.length * 0.7));
}

function getCertificationEvidenceStatus(requirement: string, evidenceText: string): EvidenceStatus {
  const keys = getMentionedCertificationKeys(requirement);
  if (keys.length > 0) {
    const covered = keys.some((key) => { const e = CERTIFICATION_PATTERN_MAP.find((d) => d.key === key); return e ? e.pattern.test(evidenceText) : false; });
    return covered ? "covered" : "none";
  }
  return hasAnyCertificationSignal(evidenceText) ? "covered" : "none";
}

export function buildResumeEvidenceText(resumeRow: {
  rawText: string | null; summary: string | null; competencies: string | null;
  tools: string | null; certifications: string | null; experience: string | null; education: string | null;
}): string {
  const chunks: string[] = [];
  if (resumeRow.rawText) chunks.push(resumeRow.rawText);
  if (resumeRow.summary) chunks.push(resumeRow.summary);
  const parseStringArray = (v: string | null): string[] => { if (!v) return []; try { const p = JSON.parse(v); return Array.isArray(p) ? p.map(String) : []; } catch { return []; } };
  const parseExperience = (v: string | null): string[] => { if (!v) return []; try { const p = JSON.parse(v); return Array.isArray(p) ? p.map((i) => JSON.stringify(i)) : []; } catch { return []; } };
  const parseEducation = (v: string | null): string[] => { if (!v) return []; try { const p = JSON.parse(v); return Array.isArray(p) ? p.map((i) => JSON.stringify(i)) : []; } catch { return []; } };
  chunks.push(
    ...parseStringArray(resumeRow.competencies),
    ...parseStringArray(resumeRow.tools),
    ...parseStringArray(resumeRow.certifications),
    ...parseExperience(resumeRow.experience),
    ...parseEducation(resumeRow.education),
  );
  return normalizeText(chunks.join("\n"));
}

function getGapEvidenceStatus(requirement: string, evidenceText: string): EvidenceStatus {
  const n = normalizeText(requirement);
  if (!n) return "none";
  if (isCertificationRequirement(requirement)) return getCertificationEvidenceStatus(requirement, evidenceText);
  if (isEducationRequirement(requirement)) {
    if (hasExplicitEducationOptionEvidence(requirement, evidenceText)) return "covered";
    if (evidenceText.includes(n)) return "covered";
    if (hasAdjacentEducationEvidence(requirement, evidenceText)) return "partial";
    if (hasAnyDegreeEvidence(evidenceText) && /(related degree|similar degree|or related)/.test(n)) return "partial";
    return "none";
  }
  if (isDomainContextRequirement(requirement)) {
    if (hasExplicitDomainEvidence(requirement, evidenceText)) return "covered";
    if (hasTransferableDomainEvidence(requirement, evidenceText)) return "partial";
    return "none";
  }
  if (isITProjectManagementRequirement(requirement)) {
    return hasITProjectManagementEvidence(evidenceText);
  }
  if (isNamedTechRequirement(requirement)) {
    if (hasExplicitNamedTechEvidence(requirement, evidenceText)) return "covered";
    const keys = getMentionedNamedTechKeys(requirement);
    if (keys.some((k) => AI_ORCHESTRATION_TECH_KEYS.has(k))) return /(ai workflow|llm orchestration|prompt chaining|agent workflow|rag pipeline|workflow automation)/.test(evidenceText) ? "partial" : "none";
    return /(container|containerized|cloud|infrastructure|devops|platform engineering|sre)/.test(evidenceText) ? "partial" : "none";
  }
  const isToolReq = /(software|platform|tool|system|application)/.test(n);
  if (evidenceText.includes(n)) return "covered";
  if ((n.includes("agile") || n.includes("scrum")) && /(agile|scrum|kanban|safe|waterfall|hybrid|pmp|project management professional)/.test(evidenceText)) return "covered";
  if (n.includes("project management") && /(pmp|project management professional|program management|portfolio management|scrum master)/.test(evidenceText)) {
    if (isToolReq && !hasPortfolioProgramSoftwareEvidence(evidenceText)) return "partial";
    if (isToolReq && hasNamedToolRequirementWithoutDirectEvidence(requirement, evidenceText)) return "partial";
    return "covered";
  }
  if (n.includes("stakeholder") && /(stakeholder|cross functional|executive communication|client facing|vendor management)/.test(evidenceText)) return "covered";
  if (isToolReq) {
    if (hasNamedToolRequirementWithoutDirectEvidence(requirement, evidenceText)) return hasPortfolioProgramSoftwareEvidence(evidenceText) ? "partial" : "none";
    const toolTokens = extractToolSpecificTokens(requirement);
    if (toolTokens.length > 0 && toolTokens.filter((t) => evidenceText.includes(t)).length > 0) return "covered";
    if (hasPortfolioProgramSoftwareEvidence(evidenceText)) return "covered";
    if (/(pmp|project management professional|program management|portfolio management)/.test(evidenceText)) return "partial";
  }
  const tokens = extractKeywordTokens(requirement);
  if (tokens.length === 0) return "none";
  const matches = tokens.filter((t) => evidenceText.includes(t)).length;
  const ratio = matches / tokens.length;
  if (ratio >= 0.7 || (tokens.length >= 4 && matches >= 3)) return "covered";
  if (ratio >= 0.45 || matches >= 2) return "partial";
  if (hasTransferableSkillEvidence(requirement, evidenceText)) return "partial";
  return "none";
}

function buildRefinedSuggestion(requirement: string, evidenceStatus: Exclude<EvidenceStatus, "none">): string {
  if (isCertificationRequirement(requirement)) return evidenceStatus === "partial" ? "Adjacent certification evidence appears in the resume source, but not the exact credential listed; keep this as a gap unless the specific certification is earned." : "The specific certification appears in the resume source; make the credential line explicit in summary and skills so ATS and recruiters can quickly verify it.";
  if (isEducationRequirement(requirement)) return evidenceStatus === "partial" ? "An adjacent or related degree appears in the resume source; position it as partial alignment rather than a hard gap unless the exact degree is explicitly required." : "Education requirement appears covered in the resume source; ensure degree and institution are explicit and easy to find.";
  if (isNamedTechRequirement(requirement)) return evidenceStatus === "partial" ? "Adjacent infrastructure or cloud evidence appears in the resume source, but the named technology is not explicit; keep this as a partial match unless the exact platform/tool is listed." : "The named platform or tool appears explicitly in the resume source; make that technology mention easy to spot in summary, skills, or role bullets.";
  if (/(software|platform|tool|system|application)/.test(normalizeText(requirement))) return evidenceStatus === "partial" ? "Partial evidence appears in the resume source; make the specific tool/platform alignment more explicit in bullets and skills." : "Evidence appears in the resume source; tighten wording in tailored bullets/summary so this alignment is explicit for ATS and recruiters.";
  if (evidenceStatus === "partial") return isDomainContextRequirement(requirement) ? "Adjacent or related industry/domain evidence appears in the resume source; position it as partial alignment and map those examples directly to this requirement." : "Partial evidence appears in the resume source; strengthen wording with concrete examples and measurable outcomes.";
  return "Evidence appears in the resume source; tighten wording in tailored bullets/summary so this alignment is explicit for ATS and recruiters.";
}

const GAP_EVIDENCE_AI_MAX_TOKENS = 1_800;
const GAP_EVIDENCE_RESUME_TOKEN_BUDGET = 8_000;

async function assessGapEvidenceWithAI(gapAnalysis: GapItem[], evidenceText: string, env: Partial<CloudflareEnv>): Promise<Map<number, EvidenceStatus> | null> {
  if (!env.AI || gapAnalysis.length === 0 || !evidenceText.trim()) return null;
  const evidenceSnippet = truncateToTokenBudget(evidenceText, GAP_EVIDENCE_RESUME_TOKEN_BUDGET, { marker: "\n...[truncated]...\n", preserveHeadRatio: 0.7 });
  const requirementsPayload = gapAnalysis.map((item, i) => ({ id: i, requirement: item.requirement, requirementType: item.requirementType ?? "required" }));
  const systemMsg = "You are a strict JSON-only evaluator for resume-to-job requirement evidence mapping.";
  const userMsg = `Evaluate each requirement against the resume evidence and return only JSON.\n\nRESUME EVIDENCE:\n${evidenceSnippet}\n\nREQUIREMENTS:\n${JSON.stringify(requirementsPayload)}\n\nRules: certifications and named tools require explicit evidence for "covered". Education can be "partial" when the candidate has an adjacent degree and the JD asks for a related/similar degree. Industry/domain experience can be "partial" when the candidate has adjacent or neighboring domain experience. Adjacent/transferable = "partial". None = "none".\n\nReturn exactly:\n{\n  "assessments": [\n    { "id": 0, "evidenceStatus": "covered|partial|none" }\n  ]\n}`;
  try {
    const rawResponse = await callClaude(env, [{ role: "system", content: systemMsg }, { role: "user", content: userMsg }], { maxTokens: GAP_EVIDENCE_AI_MAX_TOKENS });
    const rawStr = typeof rawResponse === "string" ? rawResponse : JSON.stringify(rawResponse);
    const jsonStart = rawStr.indexOf("{"); const jsonEnd = rawStr.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) return null;
    const jsonSlice = rawStr.slice(jsonStart, jsonEnd + 1);
    let parsed: { assessments?: GapEvidenceAssessment[] };
    try { parsed = JSON.parse(jsonSlice) as { assessments?: GapEvidenceAssessment[] }; }
    catch { parsed = JSON.parse(jsonrepair(jsonSlice)) as { assessments?: GapEvidenceAssessment[] }; }
    const assessments = Array.isArray(parsed.assessments) ? parsed.assessments : [];
    const statusMap = new Map<number, EvidenceStatus>();
    for (const a of assessments) {
      if (typeof a.id === "number" && (a.evidenceStatus === "covered" || a.evidenceStatus === "partial" || a.evidenceStatus === "none")) statusMap.set(a.id, a.evidenceStatus);
    }
    return statusMap;
  } catch { return null; }
}

function classifyRequirementType(text: string): "required" | "preferred" {
  const n = normalizeText(text);
  if (/(required|must have|must|mandatory|minimum qualification|minimum requirement|need to have|essential)/.test(n)) return "required";
  if (/(preferred|nice to have|plus|desired|ideally|bonus|would be beneficial|strongly preferred)/.test(n)) return "preferred";
  return "required";
}

export function normalizeGapAnalysisItems(gapAnalysis: GapItem[]): GapItem[] {
  return gapAnalysis.map((item) => {
    const inferred = classifyRequirementType(`${item.requirement ?? ""} ${item.suggestion ?? ""}`);
    return { ...item, requirementType: item.requirementType === "preferred" ? "preferred" : inferred };
  });
}

export async function refineGapAnalysisWithEvidence(gapAnalysis: GapItem[], evidenceText: string, env: Partial<CloudflareEnv>): Promise<GapItem[]> {
  const aiStatuses = await assessGapEvidenceWithAI(gapAnalysis, evidenceText, env);
  const fallbackStatuses = gapAnalysis.map((item) => getGapEvidenceStatus(item.requirement, evidenceText));

  if (!aiStatuses) {
    return gapAnalysis.map((item, i) => {
      const s = fallbackStatuses[i];
      if (s === "none") return item;
      if (s === "partial") return { ...item, status: "partial", suggestion: buildRefinedSuggestion(item.requirement, "partial") };
      return { ...item, status: "covered", suggestion: buildRefinedSuggestion(item.requirement, "covered") };
    });
  }
  return gapAnalysis.map((item, i) => {
    const aiStatus = aiStatuses.get(i);
    const fallbackStatus = fallbackStatuses[i];
    const s = !aiStatus
      ? fallbackStatus
      : aiStatus === "none" && fallbackStatus !== "none"
      ? fallbackStatus
      : isDomainContextRequirement(item.requirement)
      ? fallbackStatus
      : aiStatus;
    if (!s) return item;
    if (s === "none") return { ...item, status: "missing", suggestion: item.suggestion || "No direct evidence appears in the resume source; add explicit experience if this requirement is important for the target role." };
    if (s === "partial") return { ...item, status: "partial", suggestion: buildRefinedSuggestion(item.requirement, "partial") };
    return { ...item, status: "covered", suggestion: buildRefinedSuggestion(item.requirement, "covered") };
  });
}

function clamp(value: number, min: number, max: number): number { return Math.min(max, Math.max(min, value)); }

export function calibrateMatchScore(analysis: ComprehensiveAnalysis): number {
  const gaps = Array.isArray(analysis.gapAnalysis) ? analysis.gapAnalysis : [];
  if (gaps.length === 0) return clamp(Math.round(analysis.matchScore || 0), 1, 100);
  let weightedEarned = 0, weightedPossible = 0, requiredMissing = 0, preferredMissing = 0, requiredPartial = 0, preferredPartial = 0;
  for (const item of gaps) {
    const isPref = item.requirementType === "preferred";
    const w = isPref ? 0.65 : 1;
    const pc = isPref ? 0.5 : 0.65;
    weightedPossible += w;
    if (item.status === "covered") { weightedEarned += w; continue; }
    if (item.status === "partial") { weightedEarned += w * pc; isPref ? preferredPartial++ : requiredPartial++; continue; }
    isPref ? preferredMissing++ : requiredMissing++;
  }
  const coverageScore = weightedPossible > 0 ? (weightedEarned / weightedPossible) * 100 : 0;
  const deterministicScore = clamp(Math.round(coverageScore - Math.pow(requiredMissing, 1.14) * 7 - Math.pow(preferredMissing, 1.02) * 2 - Math.pow(requiredPartial, 1.02) * 0.8 - Math.pow(preferredPartial, 1.01) * 0.35 + (requiredMissing + preferredMissing === 0 ? 2 : 0)), 1, 100);
  let calibrated = Math.round(deterministicScore * 0.7 + clamp(Math.round(analysis.matchScore || 0), 1, 100) * 0.3);
  if (requiredMissing >= 5) calibrated = Math.min(calibrated, 50);
  else if (requiredMissing >= 3) calibrated = Math.min(calibrated, 70);
  else if (requiredMissing >= 1) calibrated = Math.min(calibrated, 89);
  return clamp(calibrated, 1, 100);
}

const MIN_SCORE_TO_PURSUE = 70;
const MIN_SCORE_TO_CONSIDER = 45;

export function enforceRecommendationThresholds(analysis: ComprehensiveAnalysis): ComprehensiveAnalysis {
  const score = analysis.matchScore;
  const careerRec = analysis.careerAnalysis?.recommendation;
  if (score < MIN_SCORE_TO_PURSUE) {
    const downgraded = score >= MIN_SCORE_TO_CONSIDER ? "consider" : "pass";
    return { ...analysis, pursue: false, pursueJustification: `Score ${score}/100 is below the pursue threshold of ${MIN_SCORE_TO_PURSUE}; recommendation downgraded to ${downgraded}. ` + (analysis.pursueJustification ?? ""), careerAnalysis: { ...analysis.careerAnalysis, recommendation: careerRec === "pursue" ? downgraded : (careerRec ?? downgraded) } };
  }
  return analysis;
}

export const ANALYSIS_OUTPUT_TOKEN_BUDGET = 6_144;
const ANALYSIS_PROMPT_OVERHEAD_TOKENS = 3_000;
export const ANALYSIS_CONTEXT_TOKEN_BUDGET = Math.min(48_000, WORKERS_AI_CONTEXT_WINDOW_TOKENS - ANALYSIS_OUTPUT_TOKEN_BUDGET - ANALYSIS_PROMPT_OVERHEAD_TOKENS);
export const ANALYSIS_MIN_SECTION_TOKENS = 4_000;

export function buildAnalysisPrompt(jdSnippet: string, resumeSnippet: string): { system: string; user: string } {
  return {
    system: `You are a JSON-only API. You are an Executive Resume Strategist, ATS Optimizer, and Job Market Analyst. Respond with ONLY a valid JSON object, nothing else. No markdown, no prose, no code fences. Start your response with { and end with }.`,
    user: `Perform a comprehensive analysis of this job posting against the candidate's resume.\n\nJOB POSTING:\n${jdSnippet}\n\nCANDIDATE RESUME:\n${resumeSnippet}\n\nReturn a JSON object with these exact keys:\n{\n  "jobTitle": "string",\n  "company": "string",\n  "industry": "string",\n  "location": "string",\n  "matchScore": integer 1-100,\n  "gapAnalysis": [{"requirement": "string", "requirementType": "required|preferred", "status": "covered|partial|missing", "suggestion": "string"}],\n  "recommendations": ["string"],\n  "pursue": boolean,\n  "pursueJustification": "string",\n  "keywords": ["string"],\n  "strategyNote": "string",\n  "personalInterest": "string",\n  "careerAnalysis": {"trajectory": "string", "recommendation": "pursue|consider|pass", "reasoning": "string", "salaryAssessment": {"listed": "string|null", "projectedRange": "string", "assessment": "string"}},\n  "insights": {\n    "workLifeBalance": "excellent|good|moderate|demanding|unknown",\n    "remoteFlexibility": "fully_remote|hybrid|office|unknown",\n    "seniorityLevel": "entry|mid|senior|lead|executive|unknown",\n    "cultureSignals": [{"signal": "string", "interpretation": "string", "sentiment": "positive|neutral|warning"}],\n    "redFlags": [{"flag": "string", "reason": "string"}]\n  }\n}\n\nGAP ANALYSIS COVERAGE RULES:\n- Extract a BROAD requirement set from the ENTIRE JD, not just the top 3 themes.\n- Read every section and every paragraph, including narrative copy, logistics, client expectations, travel notes, ways-of-working language, delivery descriptions, and company/context paragraphs when they imply candidate expectations.\n- Capture requirements that are hidden in plain sight, even when they are not in a bullet list or not under headings like \"Requirements\" or \"What You'll Bring\".\n- When the JD contains multiple requirement bullets or multiple implied expectations, reflect that breadth in gapAnalysis.\n- Target 8-12 distinct gapAnalysis items when the JD contains enough requirements.\n- Use explicit qualification bullets, delivery expectations, and implied fit constraints from across the full posting.\n- Include logistical constraints if they are material to fit, such as hybrid/on-site expectations, travel expectations, location/commutable-distance expectations, or required client presence.\n- Do NOT collapse unrelated requirements into one combined row. Keep separate items for distinct concepts like consulting leadership, PMO transformation, healthcare domain, entertainment/hospitality domain, SDLC ownership, cloud platforms, AI-enabled delivery tools, stakeholder management, agile delivery, communication/influence, travel, hybrid work, and client-facing presence.\n- Keep each requirement short, atomic, and specific.\n- Mark each item as required or preferred based on the JD language and context.\n\nMATCH SCORE: 90-100=near-perfect, 75-89=strong, 60-74=moderate, 40-59=weak, 1-39=unqualified. If 3+ required requirements are missing, score cannot exceed 70. If 5+ required requirements are missing, score cannot exceed 50. Preferred requirements should influence score less than required ones.\n\nSTRICT EVIDENCE: Do not infer certifications or named tool experience not explicitly in the resume. For education, if the JD asks for a related/similar degree, treat adjacent degrees as partial rather than missing unless the exact degree is strictly required. For industry/domain background, if the JD asks for similar/related industry experience, treat adjacent domain experience as partial rather than missing.\n\nTRANSFERABLE SKILLS: For non-cert/non-tech items, adjacent evidence = partial (not missing).\n\nINSIGHTS: Limit cultureSignals to 3 max, redFlags to 3 max. Base workLifeBalance and remoteFlexibility on signals in the job description. Set seniorityLevel from title and requirements.`,
  };
}

export async function runAnalysisPipeline(jdText: string, resumeText: string, resumeEvidenceText: string, env: Partial<CloudflareEnv>): Promise<ComprehensiveAnalysis> {
  const [jdBudget, resumeBudget] = allocateTokenBudgets([jdText, resumeText], ANALYSIS_CONTEXT_TOKEN_BUDGET, ANALYSIS_MIN_SECTION_TOKENS);
  const jdSnippet = truncateToTokenBudget(jdText, jdBudget, { marker: "\n...[jd truncated]...\n", preserveHeadRatio: 0.7 });
  const resumeSnippet = truncateToTokenBudget(resumeText, resumeBudget, { marker: "\n...[resume truncated]...\n", preserveHeadRatio: 0.65 });
  const { system, user } = buildAnalysisPrompt(jdSnippet, resumeSnippet);
  const rawResponse = await callClaude(env, [{ role: "system", content: system }, { role: "user", content: user }], { maxTokens: ANALYSIS_OUTPUT_TOKEN_BUDGET });
  const rawStr = typeof rawResponse === "string" ? rawResponse : JSON.stringify(rawResponse);
  const jsonStart = rawStr.indexOf("{"); const jsonEnd = rawStr.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) throw new Error(`AI did not return structured data (got: "${rawStr.slice(0, 80)}…"). Please try again.`);
  const jsonSlice = rawStr.slice(jsonStart, jsonEnd + 1);
  let analysis: ComprehensiveAnalysis;
  try { analysis = JSON.parse(jsonSlice) as ComprehensiveAnalysis; }
  catch { analysis = JSON.parse(jsonrepair(jsonSlice)) as ComprehensiveAnalysis; }
  if (Array.isArray(analysis.gapAnalysis)) analysis.gapAnalysis = normalizeGapAnalysisItems(analysis.gapAnalysis);
  if (resumeEvidenceText && Array.isArray(analysis.gapAnalysis)) analysis.gapAnalysis = await refineGapAnalysisWithEvidence(analysis.gapAnalysis, resumeEvidenceText, env);
  analysis.matchScore = calibrateMatchScore(analysis);
  analysis = enforceRecommendationThresholds(analysis);
  return analysis;
}

export function cleanJobUrl(raw: string): string {
  try {
    const url = new URL(raw);
    if (url.hostname.includes("linkedin.com") && url.pathname.includes("/jobs")) {
      const jobId = url.searchParams.get("currentJobId");
      if (jobId) return `https://www.linkedin.com/jobs/view/${jobId}/`;
    }
    const trackingParams = ["utm_source","utm_medium","utm_campaign","utm_content","utm_term","trackingId","refId","eBP"];
    for (const p of trackingParams) url.searchParams.delete(p);
    return url.toString();
  } catch { return raw; }
}
