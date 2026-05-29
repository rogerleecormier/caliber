import { getCloudflareEnv } from "@/lib/cloudflare";
import type { SessionUser } from "@/lib/cloudflare";
import { getAuthInstance } from "@/server/auth";
import { getRequest } from "@tanstack/react-start/server";
import { getDb } from "@/db/db";
import { session as authSession, user } from "@/db/schema";
import { and, eq, gt } from "drizzle-orm";

export type { SessionUser };

const AUTH_COOKIE_CANDIDATES = [
  "better-auth.session_token",
  "__Secure-better-auth.session_token",
  "better-auth.session-token",
  "__Secure-better-auth.session-token",
] as const;

function readCookieValue(cookieHeader: string, names: readonly string[]) {
  const cookies = cookieHeader.split(";");
  for (const name of names) {
    const prefix = `${name}=`;
    const found = cookies.find((part) => part.trimStart().startsWith(prefix));
    if (!found) continue;
    const rawValue = found.trim().slice(prefix.length);
    if (!rawValue) continue;
    try {
      return decodeURIComponent(rawValue);
    } catch {
      return rawValue;
    }
  }
  return null;
}

/**
 * Verifies the HMAC-SHA-256 signature better-auth appends to signed cookies
 * (format: "<token>.<base64-signature>") and returns the raw token on success,
 * or null if the signature is missing, malformed, or invalid.
 *
 * Replicates the algorithm in better-call's signCookieValue / verifySignature.
 */
async function extractVerifiedToken(signedValue: string, secret: string): Promise<string | null> {
  const dotPos = signedValue.lastIndexOf(".");
  if (dotPos < 1) return null;

  const token = signedValue.slice(0, dotPos);
  const b64Sig = signedValue.slice(dotPos + 1);
  if (b64Sig.length !== 44 || !b64Sig.endsWith("=")) return null;

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const binStr = atob(b64Sig);
    const sigBytes = new Uint8Array(binStr.length);
    for (let i = 0; i < binStr.length; i++) sigBytes[i] = binStr.charCodeAt(i);
    const valid = await crypto.subtle.verify(
      { name: "HMAC", hash: "SHA-256" },
      key,
      sigBytes,
      new TextEncoder().encode(token),
    );
    return valid ? token : null;
  } catch {
    return null;
  }
}

async function resolveRole(
  userId: string,
  email: string,
  hintedRole?: string | null,
): Promise<"admin" | "user"> {
  const env = getCloudflareEnv();
  if (!env.DB) {
    return hintedRole === "admin" || hintedRole === "user" ? hintedRole : "user";
  }

  const db = getDb(env.DB);

  const [authUser] = await db
    .select({ role: user.role })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);

  if (authUser?.role === "admin" || authUser?.role === "user") {
    return authUser.role;
  }

  if (hintedRole === "admin" || hintedRole === "user") return hintedRole;
  return "user";
}

/**
 * Resolves the authenticated user from the better-auth session in the current request.
 * Call this from within a TanStack Start server function handler.
 * Returns null if not authenticated or if bindings are unavailable.
 */
export async function resolveSessionUser(): Promise<SessionUser | null> {
  let request: ReturnType<typeof getRequest> | null = null;

  try {
    const env = getCloudflareEnv();

    try {
      request = getRequest();
    } catch {
      // request context unavailable — skip to DB fallback
    }

    // Primary path: better-auth getSession.
    // Isolated in its own try-catch so a throw here still reaches the DB fallback below.
    if (request) {
      try {
        const auth = getAuthInstance(env);
        const session = await auth.api.getSession({
          headers: request.headers,
        });

        if (session?.user) {
          const { id, email, role } = session.user as { id: string; email: string; role?: string | null };
          const resolvedRole = await resolveRole(id, email, role);
          return { id, email, role: resolvedRole };
        }
      } catch (sessionError) {
        console.error("[resolveSessionUser] getSession error:", sessionError);
        // fall through to DB fallback
      }
    }

    // Fallback: verify the signed session cookie directly and look up the session table.
    // Handles both intermittent getSession null returns and getSession exceptions (e.g.
    // the AsyncLocalStorage race in better-auth on Cloudflare Workers).
    const secret = (env as Record<string, unknown>).BETTER_AUTH_SECRET as string | undefined;
    if (env.DB && request && secret) {
      const cookieHeader = request.headers.get("cookie") ?? "";
      const signedValue = readCookieValue(cookieHeader, AUTH_COOKIE_CANDIDATES);
      if (!signedValue) return null;

      const sessionToken = await extractVerifiedToken(signedValue, secret);
      if (!sessionToken) return null;

      const db = getDb(env.DB);
      const now = new Date();

      const [fallbackRow] = await db
        .select({
          id: user.id,
          email: user.email,
          role: user.role,
        })
        .from(authSession)
        .innerJoin(user, eq(authSession.userId, user.id))
        .where(and(eq(authSession.token, sessionToken), gt(authSession.expiresAt, now)))
        .limit(1);

      if (!fallbackRow) return null;

      const role =
        fallbackRow.role === "admin" || fallbackRow.role === "user"
          ? fallbackRow.role
          : await resolveRole(fallbackRow.id, fallbackRow.email, fallbackRow.role);

      return {
        id: fallbackRow.id,
        email: fallbackRow.email,
        role,
      };
    }

    return null;
  } catch (error) {
    console.error("[resolveSessionUser] error:", error);
    return null;
  }
}
