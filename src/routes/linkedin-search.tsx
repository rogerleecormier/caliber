import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/linkedin-search")({
  beforeLoad: () => {
    throw redirect({ to: "/linkedin-hub", search: {} as any });
  },
});
