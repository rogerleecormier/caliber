import { createRouter } from "@tanstack/react-router";
import type { AppLoadContext } from "../app/ssr";

// Import the generated route tree
import { routeTree } from "./routeTree.gen";

// Create a new router instance
export const getRouter = () => {
  const router = createRouter({
    routeTree,
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
    context: {
      cloudflare: undefined!,
    } as AppLoadContext,
  });

  return router;
};

// Re-export the type for use in routes
declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
