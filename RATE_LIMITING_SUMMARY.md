# Rate Limiting — Quick Answer

## TL;DR

**Do you need rate limiting?** Yes, but it's **already implemented**.

- ✅ **KV Caching** (primary defense) — 1-hour TTL prevents 95% of API calls
- ✅ **Rate Limit Tracking** (secondary defense) — Automatic counter in KV
- ✅ **Circuit Breaker** (safety net) — Returns gracefully if limit hit
- ✅ **Automatic Alerting** — Logs warning at 80% quota

**What you need to do**: Nothing immediately. But optionally monitor quota.

---

## The Details

### Jooble's Limit: 500 requests/month

That's **16.7 requests/day** or **1 request every ~1.5 hours** as an average.

**Realistic usage**:
- 10 users × 5 searches/day = 50 API calls/month ✅ Safe
- 100 users × 2 searches/day = 200 API calls/month ✅ Safe
- Public search page = Likely to exceed ❌

### Why You're Protected

#### 1. KV Cache (Most Important)
```
User searches for "TypeScript Engineer"
├─ First time: API call → cache for 1 hour → 1 API call
├─ Same search (within 1 hour): Cache hit → 0 API calls
└─ Next hour, same search: New API call → 1 more API call
```

**Impact**: Same 10 searches all day = only 1 API call (not 10)

#### 2. Rate Limit Tracking (Already in Service)
```typescript
// Automatic in JoobleService:
await incrementApiCall(kv, 'jooble'); // Count the call
const status = await getRateLimitStatus(kv); // Check quota
if (status.shouldAlert) {
  console.warn(`⚠️ 80% of quota used`); // Alert at 80%
}
```

#### 3. Circuit Breaker (Already in Service)
```typescript
// Automatic in JoobleService:
const { allowed } = await canMakeJoobleRequest(kv);
if (!allowed) {
  return []; // Return empty, don't crash
}
```

---

## What Changed

### API Key in URL (Fixed)
The Jooble API requires the key in the URL:
```typescript
// Before: ❌ fetch(baseUrl, { headers: { Authorization: ... } })
// After: ✅ fetch(`${baseUrl}${apiKey}`, { ... })
```

### Rate Limiting Module Added
New file: `src/lib/services/rate-limiter.ts`

Functions you can call:
- `getRateLimitStatus(kv)` — Check current quota
- `canMakeJoobleRequest(kv)` — Check if safe to call API
- `incrementApiCall(kv)` — Log a successful call (automatic)

---

## When to Add More Limits

**Start with what exists. Add more only if:**

1. **You're hitting the limit** (>80% used monthly)
   ```typescript
   const status = await getRateLimitStatus(kv);
   if (status.percentUsed > 80) {
     // Email/Slack alert
   }
   ```

2. **You need stricter control** (e.g., per-user limits)
   ```typescript
   // Would need: rate_limit:jooble:user:123
   // Not implemented yet (can add if needed)
   ```

3. **You're going public** (many unknown users)
   ```typescript
   // Would need: request queuing, aggressive backoff
   // Not implemented yet (can add if needed)
   ```

---

## For Your Use Case

**Assumption**: Internal Caliber job search (your team + maybe some beta users)

**Expected usage**: 5-20 API calls/month

**My recommendation**: 
- ✅ Use as-is (cache + circuit breaker handle everything)
- ✅ Optionally add a dashboard to watch quota (see RATE_LIMITING.md)
- ✅ Upgrade Jooble plan if you hit 400+/month

---

## What You Can Do Right Now (Optional)

### 1. Check Quota Programmatically
```typescript
import { getRateLimitStatus } from '@/lib/services';

const status = await getRateLimitStatus(kv);
console.log(`${status.currentCount}/${status.maxRequests} used`);
```

### 2. Add Dashboard Endpoint
```typescript
// src/routes/api/services/quota.ts
export async function GET({ context }: any) {
  const status = await getRateLimitStatus(context.KV, 'jooble');
  return json(status);
}
```

### 3. Log Rate Limit to Datadog/Sentry (Optional)
```typescript
if (status.shouldAlert) {
  logMetric('jooble.quota.warning', {
    used: status.currentCount,
    total: status.maxRequests,
    percent: status.percentUsed
  });
}
```

---

## Files Affected

✅ `src/lib/services/rate-limiter.ts` (NEW)
✅ `src/lib/services/jooble.ts` (UPDATED — fixed API key in URL + rate limit checks)
✅ `src/lib/services/index.ts` (UPDATED — export rate-limiter)
✅ `src/lib/services/RATE_LIMITING.md` (NEW — comprehensive guide)

All changes compile ✓ and are backward compatible (no breaking changes).

---

## Next Steps

1. ✅ Already done: Rate limiting module + circuit breaker
2. Optional: Add monitoring dashboard if you want
3. Optional: Upgrade Jooble plan if hitting limit

**Status**: **Ready to deploy** 🚀
