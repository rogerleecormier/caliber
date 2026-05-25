import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@caliber/ui-kit";
import Header from "../components/Header";
import { getSessionUser } from "@/server/functions/auth";
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
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32x32.png" },
      { rel: "icon", type: "image/png", sizes: "16x16", href: "/favicon-16x16.png" },
      { rel: "shortcut icon", href: "/favicon.ico" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/site.webmanifest" },
    ],
  }),

  beforeLoad: async () => {
    const user = await getSessionUser();
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
            <main className="spx-app-frame pb-28 md:pb-0">{children}</main>
          </TooltipProvider>
        </QueryClientProvider>
        <Scripts />
      </body>
    </html>
  );
}
