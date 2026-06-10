/**
 * Greenhouse URL and Organization Extractor
 *
 * Provides utilities to identify and extract Greenhouse organization names
 * from boards.greenhouse.io/* URLs within payloads.
 */

/**
 * Regex pattern to match boards.greenhouse.io/* URLs
 * Captures the organization slug from the first path segment
 * Examples:
 * - https://boards.greenhouse.io/acme/jobs
 * - https://boards.greenhouse.io/acme
 * - https://example.boards.greenhouse.io/jobs
 */
const GREENHOUSE_URL_PATTERN = /https:\/\/([a-z0-9-]+\.)?boards\.greenhouse\.io\/([a-z0-9-]+)/i

/**
 * Extract Greenhouse organization names from a payload string.
 * Searches for all boards.greenhouse.io/* URLs and extracts org names.
 *
 * @param payload - Any string that may contain Greenhouse URLs
 * @returns Array of unique org names found, or empty array if none
 */
export function extractGreenhouseOrgsFromPayload(payload: string): string[] {
  const orgs = new Set<string>()
  const matches = payload.matchAll(GREENHOUSE_URL_PATTERN)

  for (const match of matches) {
    const orgName = match[2]
    if (orgName) {
      orgs.add(orgName.toLowerCase())
    }
  }

  return Array.from(orgs)
}

/**
 * Check if a URL is a Greenhouse boards URL
 */
export function isGreenhouseUrl(url: string): boolean {
  return GREENHOUSE_URL_PATTERN.test(url)
}

/**
 * Extract org name from a single Greenhouse URL
 * Returns null if the URL is not a valid Greenhouse URL
 */
export function extractOrgFromGreenhouseUrl(url: string): string | null {
  const match = url.match(GREENHOUSE_URL_PATTERN)
  return match ? match[2]?.toLowerCase() || null : null
}
