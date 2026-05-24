
/**
 * Extracts salary range from a job description string.
 * Supports various formats like:
 * - $100k - $150k
 * - $100,000 - $150,000
 * - 100k-150k
 * - USD 100k - 150k
 */
export function extractSalaryFromDescription(description: string): string | null {
  if (!description) return null;

  // Common salary patterns
  const patterns = [
    // $100k - $150k or $100k-$150k (with optional space, optional k on first)
    /\$(\d{2,3})k?\s*(?:-|to)\s*\$(\d{2,3})k/i,
    
    // $100k - 150k (dollar on first only)
    /\$(\d{2,3})k?\s*(?:-|to)\s*(\d{2,3})k/i,

    // $100,000 - $150,000 (standard)
    /\$(\d{1,3}(?:,\d{3})+)\s*(?:-|to|—|–)\s*\$(\d{1,3}(?:,\d{3})+)/i,
    
    // $100,000 — $150,000 (em dash/en dash/hyphen) with optional USD suffix
    /\$(\d{1,3}(?:,\d{3})+)\s*[—–-]\s*\$(\d{1,3}(?:,\d{3})+)(?:\s*USD)?/i,
    
    // USD 100k - 150k or USD 120,000 - 180,000
    /USD\s*(\d{1,3}(?:,\d{3})*|\d{2,3})k?\s*(?:-|to)\s*(\d{1,3}(?:,\d{3})*|\d{2,3})k?/i,
    
    // £50k - £70k
    /£(\d{2,3})k\s*(?:-|to)\s*£(\d{2,3})k/i,
    
    // €50k - €70k
    /€(\d{2,3})k\s*(?:-|to)\s*€(\d{2,3})k/i,
    
    // 100k - 150k (no currency symbol, but explicit 'k')
    /\b(\d{2,3})k\s*(?:-|to)\s*(\d{2,3})k\b/i,

    // Hourly: $50 - $80 per hour
    /\$(\d{2,3})\s*(?:-|to)\s*\$(\d{2,3})\s*per\s*hour/i,

    // Single value: $150,000+
    /\$(\d{1,3}(?:,\d{3})+)\+/i
  ];

  for (const pattern of patterns) {
    const match = description.match(pattern);
    if (match) {
      return match[0];
    }
  }

  return null;
}
