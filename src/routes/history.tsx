import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/history")({
  beforeLoad: () => {
    throw redirect({
      to: "/jobs",
      search: {
        analyzedOnly: true,
      },
    });
  },
  loader: () => {},
});
