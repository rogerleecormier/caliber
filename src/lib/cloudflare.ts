import { env as cfEnv } from "cloudflare:workers";

export interface SessionUser {
  id: number;
  email: string;
  role: string;
}

export interface CloudflareEnv {
  DB: D1Database;
  R2: R2Bucket;
  KV: KVNamespace;
  AI: Ai;
  BROWSER: Fetcher;
}

export function getCloudflareEnv(): Partial<CloudflareEnv> {
  return cfEnv as unknown as Partial<CloudflareEnv>;
}
