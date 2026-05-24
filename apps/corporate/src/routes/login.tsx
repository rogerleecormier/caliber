import { createFileRoute, redirect, useNavigate, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { loginUser } from "@/server/functions/auth";
import { z } from "zod";

const loginSearchSchema = z.object({
  redirect: z.string().optional(),
  reason: z.string().optional(),
});

function isSafeRedirect(url: string | undefined): url is string {
  if (!url) return false;
  if (url.startsWith("/") && !url.startsWith("//")) return true;
  try {
    const { hostname, protocol } = new URL(url);
    return (
      protocol === "https:" &&
      (hostname === "caliber.rcormier.dev" || hostname.endsWith(".rcormier.dev"))
    );
  } catch {
    return false;
  }
}

export const Route = createFileRoute("/login")({
  validateSearch: loginSearchSchema,
  beforeLoad: ({ context, search }) => {
    const ctx = context as { user?: { id: number } | null };
    if (ctx.user) {
      const dest = isSafeRedirect(search.redirect) ? search.redirect : "/";
      // For external spearyx subdomain redirects, use window.location since
      // the router can't navigate cross-domain.
      if (dest.startsWith("http")) {
        if (typeof window !== "undefined") window.location.replace(dest);
        return;
      }
      throw redirect({ to: dest });
    }
  },
  component: LoginPage,
});

function LoginPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const redirectTo = isSafeRedirect(search.redirect) ? search.redirect : "/";

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await loginUser({ data: { email, password } });
      if (redirectTo.startsWith("http")) {
        // Cross-domain: skip router.invalidate() so we don't re-run beforeLoad
        // before the browser commits the new Set-Cookie header.
        window.location.replace(redirectTo);
      } else {
        await router.invalidate();
        await navigate({ to: redirectTo });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || "Invalid email or password");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="spx-auth-shell">
      <div className="spx-auth-card max-w-sm">
        <div className="mb-8 text-center">
          <div className="spx-kicker mb-4">Caliber Access</div>
          <h1 className="text-2xl font-bold tracking-tight">Sign in to Caliber</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {search.reason || "Enter your credentials to access your account"}
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-1">
              Email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="you@example.com"
            />
          </div>
          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-1">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white/80 px-3 py-2.5 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              placeholder="••••••••"
            />
          </div>
          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Signing in…" : "Sign In"}
          </button>
        </form>
      </div>
    </div>
  );
}
