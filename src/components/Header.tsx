import { Link, useLocation, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppHeader, type AppHeaderSearchResult } from "@caliber/ui-kit";
import type { SessionUser } from "@/lib/cloudflare";
import { authClient } from "@/auth/client";
import { getSessionUser } from "@/server/functions/auth";
import { getCatalogJobs } from "@/server/functions/jobs-pipeline";

interface HeaderProps {
  user?: SessionUser | null;
}

export default function Header({ user }: HeaderProps) {
  const isDev = import.meta.env.DEV;
  const location = useLocation();
  const router = useRouter();
  const [resolvedUser, setResolvedUser] = useState<SessionUser | null>(user ?? null);

  useEffect(() => {
    setResolvedUser(user ?? null);
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const fresh = await getSessionUser();
        if (!cancelled) setResolvedUser(fresh);
      } catch {
        // Keep server-provided route context if refresh fails.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function handleLogout() {
    await authClient.signOut();
    await router.invalidate();
    window.location.href = "/";
  }

  async function handleSearch(query: string): Promise<AppHeaderSearchResult[]> {
    console.log('[HeaderSearch] query:', query);
    const result = await getCatalogJobs({
      data: { query, useVectorSearch: true, page: 1, pageSize: 10 },
    });
    const jobs = (result as any)?.jobs ?? [];
    console.log('[HeaderSearch] results:', jobs);
    return jobs as AppHeaderSearchResult[];
  }

  return (
    <AppHeader
      app="jobs"
      isDev={isDev}
      currentPath={location.pathname}
      Link={Link}
      user={resolvedUser}
      onLogout={handleLogout}
      onSearch={handleSearch}
    />
  );
}
