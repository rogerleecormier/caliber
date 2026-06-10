# Rate Limiting Guide — Jooble API (500 req/month)

## Overview

Jooble allows **500 API requests per month** on the free tier. This guide explains how rate limiting is implemented and how to monitor/manage quota.

## Strategy

### Defense in Depth

1. **Primary: KV Caching (1-hour TTL)**
   - Same search within 1 hour = cache hit (0 API calls)
   - ~95% of requests typically come from cache
   - Most effective rate limit

2. **Secondary: Rate Limit Tracking**
   - Monthly counter in KV tracking API calls
   - Automatic alerts at 80% quota
   - Circuit breaker at 100% (or 90% in strict mode)

3. **Tertiary: Graceful Degradation**
   - If rate limit exceeded, return empty results (not error)
   - Allows service to continue, just without Jooble data
   - Other sources (Adzuna, Remotive) still work

### Realistic Usage

```
500 requests/month = ~16.7 requests/day
```

Typical scenarios:
- ✅ **10 users, 5 searches each/day**: ~50 requests/month → Safe
- ✅ **100 users, 2 searches each/day**: ~200 requests/month → Safe
- ⚠️ **1000 users, 1 search each/day**: ~1000 requests/month → Over limit
- ❌ **Public search API**: Unlimited users → Will hit limit

## How It Works

### Automatic Tracking

Every successful Jooble API call increments a counter in KV:

```typescript
await incrementApiCall(kv, 'jooble'); // Called after successful response
```

**Key format**: `rate_limit:jooble:2025-06` (YYYY-MM)
- Resets monthly
- KV TTL: 35 days (covers month + buffer)
- Automatic cleanup via KV expiration

### Status Checking

Check quota at any time:

```typescript
import { getRateLimitStatus } from '@/lib/services';

const status = await getRateLimitStatus(kv, 'jooble');
console.log(`${status.currentCount}/${status.maxRequests} (${status.percentUsed}%) used`);
console.log(`Can make request: ${status.canMakeRequest}`);
console.log(`Should alert: ${status.shouldAlert}`); // True at 80%+
```

Returns:
```typescript
{
  currentCount: 150,
  maxRequests: 500,
  percentUsed: 30,
  daysRemaining: 20,
  canMakeRequest: true,
  shouldAlert: false
}
```

### Circuit Breaker

Check before making a call:

```typescript
import { canMakeJoobleRequest } from '@/lib/services';

const { allowed, reason } = await canMakeJoobleRequest(kv);
if (!allowed) {
  console.warn(reason); // "Jooble rate limit exceeded: 100% used"
  // Return cached results or skip Jooble source
}
```

**Strict mode** (stops at 90%):
```typescript
const { allowed } = await canMakeJoobleRequest(kv, true); // strictMode = true
```

## Implementation

### In JoobleService (Automatic)

The service already includes rate limit checking:

```typescript
// Before calling API
const rateLimit = await canMakeJoobleRequest(this.kv);
if (!rateLimit.allowed) {
  console.warn(rateLimit.reason);
  return []; // Graceful degradation
}

// After successful call
await incrementApiCall(this.kv, 'jooble');

// Check if approaching limit
const status = await getRateLimitStatus(this.kv);
if (status.shouldAlert) {
  console.warn(`⚠️ Jooble quota approaching: ${status.percentUsed}% used`);
}
```

### In Your API Route (Optional Monitoring)

```typescript
import { getRateLimitStatus } from '@/lib/services';

export async function POST({ context }: any) {
  // Check quota before processing
  const status = await getRateLimitStatus(context.KV, 'jooble');

  if (!status.canMakeRequest) {
    return json({
      success: false,
      error: 'Jooble API quota exhausted for this month',
      status
    }, { status: 429 });
  }

  // ... rest of search logic
}
```

## Monitoring & Alerts

### Log Output

The service logs warnings to console:

```
⚠️ Jooble API quota approaching: 400/500 (80%) used
```

### Dashboard (Optional)

Create a simple dashboard page:

```typescript
import { getRateLimitStatus } from '@/lib/services';

export default function ApiQuotaPage() {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    fetch('/api/admin/quota').then(r => r.json()).then(setStatus);
  }, []);

  if (!status) return <div>Loading...</div>;

  const percentUsed = status.percentUsed;
  const color = percentUsed > 80 ? 'red' : percentUsed > 50 ? 'yellow' : 'green';

  return (
    <div>
      <h2>Jooble API Quota</h2>
      <p>{status.currentCount} / {status.maxRequests}</p>
      <progress value={percentUsed} max={100} style={{ color }} />
      <p>{percentUsed}% used</p>
      <p>{status.daysRemaining} days remaining in month</p>
      {status.shouldAlert && (
        <div style={{ color: 'red' }}>⚠️ Approaching quota limit</div>
      )}
    </div>
  );
}
```

### Email/Slack Alerts (Optional)

Send alert when hitting 80% quota:

```typescript
async function checkAndAlertQuota(kv: KVNamespace) {
  const status = await getRateLimitStatus(kv);

  if (status.shouldAlert && !status.shouldAlert_already_sent) {
    // Send email/Slack message
    await sendAlert({
      title: '⚠️ Jooble API Quota Alert',
      message: `${status.currentCount}/${status.maxRequests} (${status.percentUsed}%) used`,
      daysRemaining: status.daysRemaining
    });

    // Mark alert as sent (in KV) to avoid spamming
    await kv.put('rate_limit:jooble:alert_sent', 'true', { 
      expirationTtl: 24 * 60 * 60 
    });
  }
}
```

## API Reference

### incrementApiCall(kv, source)
Track a successful API call. Called automatically by JoobleService.

```typescript
await incrementApiCall(kv, 'jooble');
// Returns: new count (number)
```

### getRateLimitStatus(kv, source, config?)
Get current quota status.

```typescript
const status = await getRateLimitStatus(kv, 'jooble');
// {
//   currentCount: 150,
//   maxRequests: 500,
//   percentUsed: 30,
//   daysRemaining: 20,
//   canMakeRequest: true,
//   shouldAlert: false
// }
```

### canMakeJoobleRequest(kv, strictMode?)
Check if a request can be made without exceeding limit.

```typescript
const { allowed, reason } = await canMakeJoobleRequest(kv);
// allowed: true if count < 500 (or < 450 in strict mode)
// reason: error message if not allowed
```

### resetRateLimitIfNewMonth(kv, source)
Manual reset for testing. Normally not needed (auto-cleanup via TTL).

```typescript
await resetRateLimitIfNewMonth(kv, 'jooble');
```

## What Happens If You Exceed Limit?

### Jooble's Response
Returns HTTP 429 or 400 error when quota exceeded.

### Our Handling
1. JoobleService checks limit before API call → Returns empty array (graceful)
2. If API call fails with 429 → Error thrown (logged)
3. JobAggregatorService still returns results from other sources (Adzuna, Remotive)

### User Experience
- Search still works (other sources used)
- Jooble results just won't appear
- No errors shown to user

## Cost Analysis

**KV Operations per search**:
- 1 read (check cache)
- 1 read (check rate limit)
- 1 write (increment counter if API called)
- 1 write (cache result if API called)

**Cost**: ~$0.50/million KV operations
- 500 API calls/month = ~$0.001/month (negligible)

## When to Upgrade?

Consider upgrading Jooble plan if:
- ✅ Consistently hitting limit (>400/month)
- ✅ Growing user base (expect more searches)
- ✅ Want dedicated Jooble coverage

Jooble paid tiers: Contact them directly for pricing

## Examples

### Monitor quota in component

```typescript
import { useEffect, useState } from 'react';
import { getRateLimitStatus } from '@/lib/services';

export function QuotaStatus() {
  const [status, setStatus] = useState(null);

  useEffect(() => {
    // Fetch from your API endpoint
    fetch('/api/services/quota').then(r => r.json()).then(setStatus);
  }, []);

  if (!status) return null;

  return (
    <div className="text-sm text-gray-600">
      API Quota: {status.currentCount}/{status.maxRequests}
      {status.shouldAlert && (
        <span className="ml-2 text-red-600">⚠️ Approaching limit</span>
      )}
    </div>
  );
}
```

### API endpoint for quota

```typescript
// src/routes/api/services/quota.ts
import { getRateLimitStatus } from '@/lib/services';

export async function GET({ context }: any) {
  const status = await getRateLimitStatus(context.KV, 'jooble');
  return json(status);
}
```

## FAQ

**Q: Do I need rate limiting if using cache?**
A: Cache covers most cases, but rate limiting adds safety net if:
- Bursts of unique searches
- Bug in cache layer
- Multiple sources querying simultaneously

**Q: What if I hit the limit mid-month?**
A: Service gracefully degrades. Search still works, just no Jooble results. You get 2 sources (Adzuna, Remotive) instead of 3.

**Q: How do I reset the counter for testing?**
A: In development:
```typescript
await kv.delete('rate_limit:jooble:2025-06');
```

**Q: Can I upgrade Jooble quota?**
A: Contact Jooble Team directly with your API key. Current limit: 500/month.

---

**Summary**: Rate limiting is **automatic** and **transparent**. Cache + circuit breaker keep you safe. Monitor with `getRateLimitStatus()` if needed.
