import { eq } from "drizzle-orm";
import type { DrizzleD1Database } from "@/db/db";
import { schema } from "@/db/db";

export interface UserPreferences {
  preferredTitles: string[];
  seniorityLevel: string | null;
  preferredIndustries: string[];
  excludedIndustries: string[];
  preferredLocations: string[];
  remotePreference: string | null; // 'remote' | 'hybrid' | 'onsite' | 'any'
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string | null;
  employmentTypes: string[];
  excludedCompanies: string[];
  excludedKeywords: string[];
}

function safeArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export interface UserProfile {
  text: string | null;
  preferences: UserPreferences;
}

/** Load the user's resume + preferences and compose the text used for embedding/scoring. */
export async function getUserProfile(
  db: DrizzleD1Database,
  userId: number,
): Promise<UserProfile> {
  const [resume] = await db
    .select()
    .from(schema.masterResume)
    .where(eq(schema.masterResume.userId, userId))
    .limit(1);

  const preferences: UserPreferences = {
    preferredTitles: safeArray(resume?.preferredTitles),
    seniorityLevel: resume?.seniorityLevel ?? null,
    preferredIndustries: safeArray(resume?.preferredIndustries),
    excludedIndustries: safeArray(resume?.excludedIndustries),
    preferredLocations: safeArray(resume?.preferredLocations),
    remotePreference: resume?.remotePreference ?? null,
    salaryMin: resume?.salaryMin ?? null,
    salaryMax: resume?.salaryMax ?? null,
    salaryCurrency: resume?.salaryCurrency ?? null,
    employmentTypes: safeArray(resume?.employmentTypes),
    excludedCompanies: safeArray(resume?.excludedCompanies),
    excludedKeywords: safeArray(resume?.excludedKeywords),
  };

  if (!resume) return { text: null, preferences };

  const chunks: string[] = [];
  if (resume.rawText) chunks.push(`Resume:\n${resume.rawText}`);
  else if (resume.summary) chunks.push(`Summary:\n${resume.summary}`);

  const competencies = safeArray(resume.competencies);
  const tools = safeArray(resume.tools);
  if (competencies.length > 0) chunks.push(`Core Competencies: ${competencies.join(", ")}`);
  if (tools.length > 0) chunks.push(`Tools: ${tools.join(", ")}`);
  if (preferences.preferredTitles.length > 0)
    chunks.push(`Target Roles: ${preferences.preferredTitles.join(", ")}`);
  if (preferences.preferredIndustries.length > 0)
    chunks.push(`Preferred Industries: ${preferences.preferredIndustries.join(", ")}`);

  return { text: chunks.length > 0 ? chunks.join("\n\n") : null, preferences };
}
