import { createFileRoute, Outlet } from "@tanstack/react-router";
import { requireLoginRedirect } from "@/lib/auth-redirect";

export const Route = createFileRoute("/analyze")({
  beforeLoad: ({ context }) => {
    const ctx = context as { user?: { id: number } | null };
    if (!ctx.user) requireLoginRedirect();
  },
  component: () => <Outlet />,
});
