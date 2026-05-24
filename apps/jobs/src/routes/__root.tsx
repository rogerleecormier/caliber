import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@spearyx/ui-kit";
import Header from "../components/Header";
import { getCurrentUser } from "@/server/functions/auth";
import type { SessionUser } from "@/lib/cloudflare";

import appCss from "../styles.css?url";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { staleTime: 5_000, gcTime: 60_000, retry: 2, refetchOnWindowFocus: true },
    mutations: { retry: 0 },
  },
});

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Caliber - Precision High-Curation Job Agents" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
    ],
  }),

  beforeLoad: async () => {
    const user = await getCurrentUser();
    return { user };
  },

  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  const { user } = Route.useRouteContext() as { user: SessionUser | null };

  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <QueryClientProvider client={queryClient}>
          <TooltipProvider>
            <Header user={user} />
            <main className="spx-app-frame">{children}</main>
          </TooltipProvider>
        </QueryClientProvider>
        <Scripts />
      </body>
    </html>
  );
}
