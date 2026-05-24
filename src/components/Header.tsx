import { Link, useLocation, useRouter } from "@tanstack/react-router";
import { AppHeader } from "@caliber/ui-kit";
import type { SessionUser } from "@/lib/cloudflare";
import { logoutUser } from "@/server/functions/auth";

interface HeaderProps {
  user?: SessionUser | null;
}

export default function Header({ user }: HeaderProps) {
  const isDev = import.meta.env.DEV;
  const location = useLocation();
  const router = useRouter();

  async function handleLogout() {
    await logoutUser();
    await router.invalidate();
    window.location.href = "/";
  }

  return (
    <AppHeader
      app="jobs"
      isDev={isDev}
      currentPath={location.pathname}
      Link={Link}
      user={user}
      onLogout={handleLogout}
    />
  );
}
