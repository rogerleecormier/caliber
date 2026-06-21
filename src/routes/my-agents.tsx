import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Bot, Briefcase, Clock, Plus } from "lucide-react";
import { Button, PageHero, PageSection } from "@caliber/ui-kit";
import { requireLoginRedirect } from "@/lib/auth-redirect";
import { getSavedPipelineSearches } from "@/server/functions/jobs-pipeline";

export const Route = createFileRoute("/my-agents")({
  beforeLoad: ({ context }) => {
    const ctx = context as { user?: { id: string } | null };
    if (!ctx.user) requireLoginRedirect();
  },
  component: MyAgentsPage,
});

function MyAgentsPage() {
  const { data: savedSearches, isLoading } = useQuery({
    queryKey: ["savedSearches"],
    queryFn: async () => getSavedPipelineSearches(),
  });

  return (
    <div className="spx-page spx-stack">
      <PageHero
        eyebrow="Automation"
        icon={<Bot className="h-3.5 w-3.5" />}
        title="My Agents"
        description="Manage your search agents and automation workflows."
      />

      <PageSection>
        {isLoading ? (
          <div className="flex justify-center items-center py-12">
            <div className="h-8 w-8 animate-spin border-2 border-slate-300 border-t-slate-600 rounded-full" />
          </div>
        ) : !savedSearches || savedSearches.length === 0 ? (
          <div className="text-center py-12">
            <Bot className="h-12 w-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-lg font-semibold text-slate-900 mb-1">No agents yet</h3>
            <p className="text-slate-600 mb-6">Create your first search agent to automate job discovery.</p>
            <Button className="inline-flex items-center gap-2">
              <Plus className="h-4 w-4" />
              Create Agent
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {savedSearches.map((search: any) => (
              <div
                key={search.id}
                className="rounded-lg border border-slate-200 bg-white p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-3">
                  <h3 className="font-semibold text-slate-900">{search.name}</h3>
                  <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2.5 py-1 rounded-full">
                    {search.status || "active"}
                  </span>
                </div>
                <p className="text-sm text-slate-600 mb-4">{search.query}</p>
                <div className="flex items-center text-xs text-slate-500 gap-4">
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3.5 w-3.5" />
                    <span>Updated {new Date(search.lastRun || search.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </PageSection>
    </div>
  );
}
