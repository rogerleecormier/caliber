import { DurableObject } from 'cloudflare:workers';

interface TokenBucket {
  tokens: number;
  lastRefillAt: number;
}

export class RateLimiter extends DurableObject {
  private bucket: TokenBucket = { tokens: 50, lastRefillAt: Date.now() };
  private capacity = 50;
  private refillRatePerSecond = 5; // 5 tokens per second (50 per 10s)

  constructor(state: DurableObjectState, env: any) {
    super(state, env);
    // Initialize or load bucket state from storage if wanted,
    // but in-memory is usually sufficient for simple rate limits.
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/acquire') {
      const tokensRequested = parseInt(url.searchParams.get('tokens') ?? '1', 10);
      return this.handleAcquire(tokensRequested);
    }

    return new Response('Not found', { status: 404 });
  }

  private handleAcquire(tokensRequested: number): Response {
    this.refillBucket();

    if (this.bucket.tokens >= tokensRequested) {
      this.bucket.tokens -= tokensRequested;
      return new Response(
        JSON.stringify({ allowed: true, tokensRemaining: this.bucket.tokens }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const tokensNeeded = tokensRequested - this.bucket.tokens;
    const retryAfterMs = Math.ceil((tokensNeeded / this.refillRatePerSecond) * 1000);

    return new Response(
      JSON.stringify({ allowed: false, retryAfterMs, tokensRemaining: this.bucket.tokens }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Retry-After': Math.ceil(retryAfterMs / 1000).toString(),
        },
      }
    );
  }

  private refillBucket(): void {
    const now = Date.now();
    const secondsElapsed = (now - this.bucket.lastRefillAt) / 1000;
    const tokensToAdd = secondsElapsed * this.refillRatePerSecond;

    this.bucket.tokens = Math.min(this.capacity, this.bucket.tokens + tokensToAdd);
    this.bucket.lastRefillAt = now;
  }
}
