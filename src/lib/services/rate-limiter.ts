// Rate limiting utilities for Jooble API (500 req/month)
// Tracks API calls in KV to prevent exceeding quota

interface RateLimitConfig {
  maxRequests: number; // 500 for Jooble
  windowDays: number;  // 30 days
  alertThreshold: number; // Alert at 80%
}

interface RateLimitStatus {
  currentCount: number;
  maxRequests: number;
  percentUsed: number;
  daysRemaining: number;
  canMakeRequest: boolean;
  shouldAlert: boolean;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  maxRequests: 500, // Jooble free tier
  windowDays: 30,
  alertThreshold: 0.8, // Alert at 80%
};

// Key format: "rate_limit:jooble:2025-06" (YYYY-MM)
function getRateLimitKey(source: string, date: Date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  return `rate_limit:${source}:${year}-${month}`;
}

export async function incrementApiCall(
  kv: any, // KVNamespace
  source: string = 'jooble'
): Promise<number> {
  const key = getRateLimitKey(source);
  const current = (await kv.get(key)) || '0';
  const count = parseInt(current, 10) + 1;

  // Store count with 35-day TTL (extends beyond 30-day window to catch edge cases)
  await kv.put(key, String(count), {
    expirationTtl: 35 * 24 * 60 * 60,
  });

  return count;
}

export async function getRateLimitStatus(
  kv: any,
  source: string = 'jooble',
  config: RateLimitConfig = DEFAULT_CONFIG
): Promise<RateLimitStatus> {
  const key = getRateLimitKey(source);
  const current = (await kv.get(key)) || '0';
  const count = parseInt(current, 10);

  const percentUsed = count / config.maxRequests;
  const canMakeRequest = count < config.maxRequests;
  const shouldAlert = percentUsed >= config.alertThreshold;

  // Days remaining in current month
  const now = new Date();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const daysRemaining = Math.ceil(
    (monthEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  return {
    currentCount: count,
    maxRequests: config.maxRequests,
    percentUsed: Math.round(percentUsed * 100),
    daysRemaining,
    canMakeRequest,
    shouldAlert,
  };
}

export async function resetRateLimitIfNewMonth(
  kv: any,
  source: string = 'jooble'
): Promise<void> {
  // Automatically clean up old month's counter (optional manual reset)
  // This is handled by KV expiration TTL, but useful for manual cleanup
  const currentKey = getRateLimitKey(source);
  const previousMonth = new Date();
  previousMonth.setMonth(previousMonth.getMonth() - 1);
  const previousKey = getRateLimitKey(source, previousMonth);

  await kv.delete(previousKey);
}

export async function logApiCall(
  kv: any,
  source: string = 'jooble',
  endpoint: string = '',
  params?: Record<string, unknown>
): Promise<void> {
  // Optional: Store detailed call logs for debugging
  const logKey = `api_calls:${source}:${Date.now()}`;
  const logEntry = {
    timestamp: new Date().toISOString(),
    source,
    endpoint,
    params,
  };

  // Keep logs for 24 hours only (cost optimization)
  await kv.put(logKey, JSON.stringify(logEntry), {
    expirationTtl: 24 * 60 * 60,
  });
}

// Utility: Format status for human-readable display
export function formatRateLimitStatus(status: RateLimitStatus): string {
  return (
    `API Rate Limit Status: ${status.currentCount}/${status.maxRequests} (${status.percentUsed}%) | ` +
    `Days remaining: ${status.daysRemaining} | ` +
    `Status: ${status.canMakeRequest ? '✅ OK' : '❌ EXCEEDED'}`
  );
}

// Utility: Circuit breaker check
export async function canMakeJoobleRequest(
  kv: any,
  strictMode: boolean = false // If true, stops at 90% instead of 100%
): Promise<{ allowed: boolean; reason?: string }> {
  const status = await getRateLimitStatus(kv, 'jooble');

  const threshold = strictMode ? 0.9 : 1.0;
  const allowed = (status.currentCount / status.maxRequests) < threshold;

  return {
    allowed,
    reason: !allowed
      ? `Jooble rate limit ${strictMode ? 'approaching' : 'exceeded'}: ${status.percentUsed}% used`
      : undefined,
  };
}
