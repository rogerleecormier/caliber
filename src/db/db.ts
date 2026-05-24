import {
  drizzle,
  DrizzleD1Database as DrizzleD1DatabaseType,
} from "drizzle-orm/d1";
import * as schema from "./schema";
import type { AppLoadContext } from "../../app/ssr";

export { schema };

export type DrizzleD1Database = DrizzleD1DatabaseType<typeof schema>;

export function getDb(d1: D1Database) {
  return drizzle(d1, { schema });
}

export async function getD1FromContext(context: any): Promise<D1Database | null> {
  // Try different context structures
  // 1. Standard Cloudflare Pages/Workers context (production)
  let d1Binding = context?.cloudflare?.env?.DB;

  // 2. Direct env access (some configurations)
  if (!d1Binding) {
    d1Binding = context?.env?.DB;
  }

  // 3. Direct DB binding (development)
  if (!d1Binding) {
    d1Binding = context?.DB;
  }

  // 4. Check global __CF_ENV__ (set by our custom worker entry)
  if (!d1Binding && typeof globalThis !== 'undefined') {
    const cfEnv = (globalThis as any).__CF_ENV__;
    if (cfEnv) {
      d1Binding = cfEnv.DB;
    }
  }

  // 5. Check globalThis for Cloudflare Worker bindings (production fallback)
  if (!d1Binding && typeof globalThis !== 'undefined') {
    // In Cloudflare Workers, bindings are available on the global scope
    d1Binding = (globalThis as any).DB;
  }

  // 6. Development mode - use getPlatformProxy
  if (!d1Binding && (import.meta.env?.DEV || process.env.NODE_ENV === 'development')) {
    try {
      const { getPlatformProxy } = await import(/* @vite-ignore */ 'wrangler');
      const proxy = await getPlatformProxy({
        configPath: './wrangler.toml',
      });
      d1Binding = proxy.env.DB;
    } catch (error) {
      console.error('Failed to get platform proxy:', error);
    }
  }

  return d1Binding || null;
}

// Helper to get DB from context (for use in API routes)
export async function getDbFromContext(context: any) {
  const d1Binding = await getD1FromContext(context);

  if (!d1Binding) {
    throw new Error(
      `DB binding not found. Make sure wrangler.toml has [[d1_databases]] with binding = "DB". Context: ${JSON.stringify(
        {
          hasContext: !!context,
          hasCloudflare: !!context?.cloudflare,
          hasCloudflareEnv: !!context?.cloudflare?.env,
          hasCloudflareDB: !!context?.cloudflare?.env?.DB,
          hasEnv: !!context?.env,
          hasEnvDB: !!context?.env?.DB,
          hasDB: !!context?.DB,
          hasCfEnv: !!(globalThis as any).__CF_ENV__,
          hasCfEnvDB: !!(globalThis as any).__CF_ENV__?.DB,
          hasGlobalDB: !!(globalThis as any)?.DB,
          contextKeys: context ? Object.keys(context) : [],
          globalThisKeys: typeof globalThis !== 'undefined' ? Object.keys(globalThis).filter(k => k.includes('D') || k === 'DB' || k.includes('CF')) : [],
        }
      )}`
    );
  }

  return getDb(d1Binding);
}
