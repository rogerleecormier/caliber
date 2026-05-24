import { createFileRoute } from "@tanstack/react-router";
import { json } from "@tanstack/react-start";

export const Route = createFileRoute("/api/test")({
  server: {
    handlers: {
      GET: async () => {
        return json({ message: "Test endpoint works!" });
      },
    },
  },
});
