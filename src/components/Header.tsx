import { Link, useLocation, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppHeader } from "@caliber/ui-kit";
import type { SessionUser } from "@/lib/cloudflare";
import { authClient } from "@/auth/client";
import { getSessionUser } from "@/server/functions/auth";

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
        const fresh = await getSessionUser({});
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

  return (
    <AppHeader
      app="jobs"
      isDev={isDev}
      currentPath={location.pathname}
      Link={Link}
      user={resolvedUser}
      onLogout={handleLogout}
    />
  );
}
