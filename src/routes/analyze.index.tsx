import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Briefcase, Search, Zap } from "lucide-react";
import { AnalysisForm } from "@/components/features/analysis-form";
import { z } from "zod";
import { requireLoginRedirect } from "@/lib/auth-redirect";
import { PageHero, PageSection } from "@caliber/ui-kit";

const searchSchema = z.object({
  url: z.string().optional(),
  jd: z.string().optional(),
});

export const Route = createFileRoute("/analyze/")({
  beforeLoad: ({ context, location }) => {
    const ctx = context as { user?: { id: number } | null };
    if (!ctx.user) requireLoginRedirect(location, "job analysis");
  },
  validateSearch: searchSchema,
  component: AnalyzePage,
});

function AnalyzePage() {
  const { url, jd } = Route.useSearch();

  return (
    <div className="spx-page-narrow spx-stack">
      <PageHero
        eyebrow="Job Tools"
        icon={<Zap className="h-3.5 w-3.5" />}
        title="Analyze a Job"
        description="Paste a job URL or description to get AI-powered match scoring, gap analysis, and positioning guidance."
        actions={
          <Link
            to="/history"
            search={{ page: 1 }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white/70 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-white hover:text-slate-900"
          >
            View History
          </Link>
        }
      />

      <div
        className="spx-band spx-band-indigo flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex items-center gap-4">
          <div
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
            style={{ background: "rgba(99,102,241,0.1)", border: "1px solid rgba(99,102,241,0.2)" }}
          >
            <Briefcase className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">
              Looking for a job to analyze?
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              Browse our AI-curated job board and paste any listing directly into the analyzer.
            </p>
          </div>
        </div>
        <Link
          to="/"
          className="inline-flex flex-shrink-0 items-center gap-2 rounded-xl border border-indigo-200 bg-indigo-50 px-5 py-2.5 text-sm font-semibold text-indigo-700 transition-all hover:bg-indigo-100"
        >
          <Search className="h-4 w-4" />
          Browse Jobs
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <PageSection
        title="Job Analysis"
        description="Submit a live posting URL or paste the job description directly to generate a saved analysis."
      >
        <AnalysisForm initialUrl={url} initialJd={jd} />
      </PageSection>
    </div>
  );
}
