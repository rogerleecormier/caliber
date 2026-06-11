import { env as cfEnv } from "cloudflare:workers";
import type { JobIngestionMessage } from "@/lib/job-ingestion-queue";

export interface SessionUser {
  id: string;
  email: string;
  role: string;
}

export interface CloudflareEnv {
  DB: D1Database;
  R2: R2Bucket;
  KV: KVNamespace;
  AI: Ai;
  BROWSER: Fetcher;
  JOB_INGESTION_QUEUE?: Queue<JobIngestionMessage>;
  ADMIN_PROMOTION_TOKEN?: string;
  BETTER_AUTH_SECRET?: string;
  BETTER_AUTH_URL?: string;
  ADZUNA_API_KEY?: string;
  JOOBLE_API_KEY?: string;
}

let cachedEnv: Partial<CloudflareEnv> | null = null;
let proxyPromise: Promise<Partial<CloudflareEnv>> | null = null;

export async function getCloudflareEnvAsync(): Promise<Partial<CloudflareEnv>> {
  if (cachedEnv) return cachedEnv;

  const env = cfEnv as unknown as Partial<CloudflareEnv>;

  // In development, use platform proxy to get bindings
  if (!env.DB && typeof globalThis !== "undefined" && (import.meta.env?.DEV || process.env.NODE_ENV === "development")) {
    try {
      const { getPlatformProxy } = await import(/* @vite-ignore */ "wrangler");
      const proxy = await getPlatformProxy({
        configPath: "./wrangler.toml",
      });
      cachedEnv = {
        ...env,
        DB: proxy.env.DB,
        R2: proxy.env.R2,
        KV: proxy.env.KV,
        AI: proxy.env.AI,
        ADZUNA_API_KEY: proxy.env.ADZUNA_API_KEY,
        JOOBLE_API_KEY: proxy.env.JOOBLE_API_KEY,
        ...proxy.env,
      };
      return cachedEnv;
    } catch {
      // Fall back to cfEnv if proxy fails
    }
  }

  cachedEnv = env;
  return env;
}

export function getCloudflareEnv(): Partial<CloudflareEnv> {
  // For synchronous access in production/remote, return cfEnv directly
  const env = cfEnv as unknown as Partial<CloudflareEnv>;

  // In production, cfEnv should have the bindings
  if (env.DB) return env;

  // In development without bindings, we have a problem - development should use async version
  // But return what we have to avoid breaking - server functions should use getCloudflareEnvAsync()
  return env;
}
