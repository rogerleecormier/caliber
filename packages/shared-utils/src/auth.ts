export const SESSION_COOKIE = "spearyx-session";
export const SESSION_TTL = 60 * 60 * 24 * 7; // 7 days in seconds
export const ROOT_DOMAIN = "rcormier.dev";
export const SPEARYX_JOBS_ORIGIN = "https://caliber.rcormier.dev";

interface SessionKvStore {
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  get(key: string): Promise<string | null>;
  delete(key: string): Promise<void>;
}

function createSessionToken(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID().replace(/-/g, "");
  }

  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 18)}`;
}

function isCaliberHostname(hostname: string): boolean {
  return hostname === ROOT_DOMAIN || hostname.endsWith(`.${ROOT_DOMAIN}`);
}

export function getRequestHostname(request: Request): string {
  try {
    return new URL(request.url).hostname.toLowerCase();
  } catch {
    const host = request.headers.get("host") ?? "";
    return host.split(":")[0].trim().toLowerCase();
  }
}

export function isProductionSessionRequest(request: Request): boolean {
  return isCaliberHostname(getRequestHostname(request));
}

export function getSessionCookieDomain(request: Request): string | undefined {
  return isProductionSessionRequest(request) ? `.${ROOT_DOMAIN}` : undefined;
}

export function shouldUseSecureSessionCookie(request: Request): boolean {
  try {
    return new URL(request.url).protocol === "https:";
  } catch {
    return isProductionSessionRequest(request);
  }
}

export function extractSessionToken(request: Request): string | null {
  const cookie = request.headers.get("cookie") ?? "";
  const match = cookie.match(/spearyx-session=([^;]+)/);
  return match ? match[1] : null;
}

export async function createSession(
  userId: number,
  kv: SessionKvStore | null | undefined,
): Promise<string> {
  if (!kv) throw new Error("KV binding unavailable");
  const token = createSessionToken();
  const session = { userId, createdAt: new Date().toISOString() };
  await kv.put(`session:${token}`, JSON.stringify(session), {
    expirationTtl: SESSION_TTL,
  });
  return token;
}

export async function getSession(
  token: string,
  kv: SessionKvStore | null | undefined,
): Promise<{ userId: number; createdAt: string } | null> {
  if (!kv || !token) return null;
  const raw = await kv.get(`session:${token}`);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as { userId: number; createdAt: string };
  } catch {
    return null;
  }
}

export async function deleteSession(
  token: string,
  kv: SessionKvStore | null | undefined,
): Promise<void> {
  if (!kv || !token) return;
  await kv.delete(`session:${token}`);
}

export function getAuthCorsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin");
  if (!origin) return {};

  try {
    const { hostname } = new URL(origin);
    if (isCaliberHostname(hostname) || hostname === "localhost") {
      return {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Credentials": "true",
        Vary: "Origin",
      };
    }
  } catch {
    return {};
  }

  return {};
}

export function getSharedAuthOrigin(currentUrl?: string): string {
  if (currentUrl) {
    try {
      const url = new URL(currentUrl);
      if (url.hostname === "localhost") return url.origin;
    } catch {
      // Ignore malformed input and fall back to the shared production origin.
    }
  }

  return SPEARYX_JOBS_ORIGIN;
}
