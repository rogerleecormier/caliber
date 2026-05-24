import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router";
import { TooltipProvider } from "@caliber/ui-kit";
import Header from "../components/Header";
import { getCurrentUser } from "@/server/functions/auth";
import type { SessionUser } from "@/lib/cloudflare";

import appCss from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Spearyx - AI-Powered Precision Project Management" },
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
        <TooltipProvider>
          <Header user={user} />
          <main className="spx-app-frame">{children}</main>
        </TooltipProvider>
        <Scripts />
      </body>
    </html>
  );
}
