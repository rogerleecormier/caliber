interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

// Hash search query to create stable cache key using SubtleCrypto (browser/worker compatible)
export async function hashQuery(query: Record<string, unknown>): Promise<string> {
  const sorted = JSON.stringify(query, Object.keys(query).sort());
  const encoder = new TextEncoder();
  const data = encoder.encode(sorted);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  return hashHex.slice(0, 16);
}

export async function getCached<T>(
  kv: any, // KVNamespace from Cloudflare Workers
  key: string
): Promise<T | null> {
  const cached = await kv.get(key, 'json') as CacheEntry<T> | null;
  if (!cached) return null;

  if (cached.expiresAt < Date.now()) {
    await kv.delete(key);
    return null;
  }

  return cached.data;
}

export async function setCached<T>(
  kv: any, // KVNamespace from Cloudflare Workers
  key: string,
  data: T,
  ttlSeconds: number
): Promise<void> {
  const entry: CacheEntry<T> = {
    data,
    expiresAt: Date.now() + ttlSeconds * 1000,
  };
  await kv.put(key, JSON.stringify(entry), {
    expirationTtl: ttlSeconds,
  });
}
