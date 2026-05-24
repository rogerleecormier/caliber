import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { getAnalysis } from "@/server/functions/get-analysis";
import { AnalysisResult } from "@/components/features/analysis-result";
import { DocumentActions } from "@/components/features/document-actions";
import { requireLoginRedirect } from "@/lib/auth-redirect";

export const Route = createFileRoute("/analyze/$id")({
  beforeLoad: ({ context, location }) => {
    const ctx = context as { user?: { id: number } | null };
    if (!ctx.user) requireLoginRedirect(location, "saved analysis");
  },
  loader: async ({ params }) => getAnalysis({ data: { id: Number(params.id) } }),
  component: AnalysisDetailPage,
  pendingComponent: AnalysisDetailLoading,
});

function AnalysisDetailPage() {
  const analysis = Route.useLoaderData();

  return (
    <div className="spx-page spx-stack">
      <Link
        to="/history"
        search={{ page: 1 }}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to History
      </Link>
      <AnalysisResult analysis={analysis} />
      <DocumentActions analysisId={analysis.id} applied={analysis.applied} />
    </div>
  );
}

function AnalysisDetailLoading() {
  return (
    <div className="spx-page space-y-4 animate-pulse">
      <div className="h-5 w-32 rounded bg-muted" />
      <div className="h-40 w-full rounded-xl bg-muted" />
      <div className="h-64 w-full rounded-xl bg-muted" />
    </div>
  );
}
