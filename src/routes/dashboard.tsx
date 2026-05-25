import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { getAnalytics } from "@/server/functions/get-analytics";
import { manuallyAggregateAnalytics } from "@/server/functions/manually-aggregate-analytics";
import {
  BarChart3,
  Briefcase,
  FileText,
  Gauge,
  RefreshCw,
  Sparkles,
  Target,
  TrendingUp,
} from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { requireLoginRedirect } from "@/lib/auth-redirect";
import { PageActionBar, PageHero, PageSection } from "@caliber/ui-kit";

export const Route = createFileRoute("/dashboard")({
  beforeLoad: ({ context }) => {
    const ctx = context as { user?: { id: string } | null };
    if (!ctx.user) requireLoginRedirect();
  },
  loader: async () => getAnalytics({ data: { period: "all_time" } }),
  component: DashboardPage,
  pendingComponent: DashboardLoading,
});

function DashboardPage() {
  const data = Route.useLoaderData();
  const router = useRouter();
  const [syncing, setSyncing] = useState(false);

  const derived = useMemo(() => {
    const analyses = data?.totalAnalyses ?? 0;
    const resumes = data?.totalResumesGenerated ?? 0;
    const applied = data?.totalApplied ?? 0;
    const pursued = data?.totalPursued ?? 0;
    const avgMatch = data?.averageMatchScore ?? 0;

    const applicationRate = analyses > 0 ? Math.round((applied / analyses) * 100) : 0;
    const resumeCoverage = analyses > 0 ? Math.round((resumes / analyses) * 100) : 0;
    const pursueRate = analyses > 0 ? Math.round((pursued / analyses) * 100) : 0;
    // of roles recommended to pursue, how many were actually applied to
    const pursueToApplyRate = pursued > 0 ? Math.round((applied / pursued) * 100) : 0;
    const analysisGap = Math.max(analyses - applied, 0);

    let matchLabel = "Needs attention";
    let matchTone = "text-amber-700 bg-amber-50 border-amber-100";
    if (avgMatch >= 75) {
      matchLabel = "Strong alignment";
      matchTone = "text-emerald-700 bg-emerald-50 border-emerald-100";
    } else if (avgMatch >= 60) {
      matchLabel = "Solid base";
      matchTone = "text-sky-700 bg-sky-50 border-sky-100";
    }

    const topRole = data?.topJobTitles?.[0];
    const topIndustry = data?.topIndustries?.[0];
    const topJdKeyword = data?.topJdKeywords?.[0];
    const topResumeKeyword = data?.topResumeKeywords?.[0];

    return {
      applicationRate,
      resumeCoverage,
      pursueRate,
      pursueToApplyRate,
      analysisGap,
      matchLabel,
      matchTone,
      topRole,
      topIndustry,
      topJdKeyword,
      topResumeKeyword,
    };
  }, [data]);

  async function handleResync() {
    setSyncing(true);
    try {
      await manuallyAggregateAnalytics();
      await router.invalidate();
    } finally {
      setSyncing(false);
    }
  }

  if (!data) {
    return (
      <div className="spx-page text-center text-muted-foreground">
        No analytics data yet. Analyze some job postings to get started.
      </div>
    );
  }

  return (
    <div className="spx-page space-y-8">
      <PageHero
        eyebrow="Search Insights"
        icon={<BarChart3 className="h-3.5 w-3.5" />}
        title="Search Insights"
        description="Monitor match quality, application momentum, and where your strongest positioning is emerging."
        actions={
          <>
            <button
              onClick={handleResync}
              disabled={syncing}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-white disabled:opacity-50"
            >
              <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Syncing..." : "Resync"}
            </button>
            <Link
              to="/jobs" search={{ analyzedOnly: true }}
              className="inline-flex items-center rounded-lg border border-slate-200 bg-white/80 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-white"
            >
              View History
            </Link>
            <Link
              to="/analyze"
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700"
            >
              Analyze a Job
            </Link>
          </>
        }
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={<Gauge className="h-5 w-5 text-violet-600" />}
          label="Average Match"
          value={`${data.averageMatchScore.toFixed(1)}%`}
          note={derived.matchLabel}
          accent="bg-violet-50 border-violet-100"
        />
        <MetricCard
          icon={<Sparkles className="h-5 w-5 text-sky-600" />}
          label="Pursue Rate"
          value={`${derived.pursueRate}%`}
          note={`${data.totalPursued ?? 0} of ${data.totalAnalyses} roles flagged to pursue`}
          accent="bg-sky-50 border-sky-100"
        />
        <MetricCard
          icon={<Target className="h-5 w-5 text-emerald-600" />}
          label="Apply Rate"
          value={`${derived.applicationRate}%`}
          note={`${data.totalApplied} of ${data.totalAnalyses} analyzed roles applied to`}
          accent="bg-emerald-50 border-emerald-100"
        />
        <MetricCard
          icon={<FileText className="h-5 w-5 text-amber-600" />}
          label="Resume Coverage"
          value={`${derived.resumeCoverage}%`}
          note={`${data.totalResumesGenerated} tailored resumes across ${data.totalAnalyses} analyses`}
          accent="bg-amber-50 border-amber-100"
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
        <PageSection
          title="Performance Snapshot"
          description="A quick read on momentum and alignment across your saved analyses."
        >
          <div className="grid gap-5 md:grid-cols-2">
            {/* Rate breakdown */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-5">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Rate breakdown</h3>
                <p className="mt-0.5 text-xs text-slate-500">Each rate is calculated out of total analyses ({data.totalAnalyses})</p>
              </div>
              <RateBar label="Pursue rate" value={derived.pursueRate} count={data.totalPursued ?? 0} color="bg-sky-500" />
              <RateBar label="Resume generated" value={derived.resumeCoverage} count={data.totalResumesGenerated} color="bg-violet-500" />
              <RateBar label="Applied" value={derived.applicationRate} count={data.totalApplied} color="bg-emerald-500" />
              <RateBar label="Avg match score" value={data.averageMatchScore} count={null} color="bg-primary" />
            </div>

            {/* Funnel comparison */}
            <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-5">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Pipeline funnel</h3>
                <p className="mt-0.5 text-xs text-slate-500">How analyses progress through your pipeline</p>
              </div>
              <FunnelStep label="Analyzed" count={data.totalAnalyses} total={data.totalAnalyses} color="bg-slate-400" />
              <FunnelStep label="Recommended to pursue" count={data.totalPursued ?? 0} total={data.totalAnalyses} color="bg-sky-500" />
              <FunnelStep label="Resumes generated" count={data.totalResumesGenerated} total={data.totalAnalyses} color="bg-violet-500" />
              <FunnelStep label="Applied" count={data.totalApplied} total={data.totalAnalyses} color="bg-emerald-500" />
              <div className="mt-2 border-t border-slate-100 pt-3">
                <div className="flex items-center justify-between text-xs text-slate-500">
                  <span>Pursue → Apply conversion</span>
                  <span className="font-semibold text-slate-700">{derived.pursueToApplyRate}%</span>
                </div>
              </div>
            </div>

            {/* What stands out — full width */}
            <div className="md:col-span-2 rounded-xl border border-slate-200 bg-slate-50 p-5">
              <div className="flex items-center gap-2 text-slate-900">
                <Sparkles className="h-4 w-4 text-primary" />
                <h3 className="text-sm font-semibold">What stands out</h3>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <HighlightRow
                  label="Primary role focus"
                  value={derived.topRole ? `${derived.topRole.title} (${derived.topRole.count})` : "No dominant title yet"}
                />
                <HighlightRow
                  label="Top industry"
                  value={derived.topIndustry ? `${derived.topIndustry.industry} (${derived.topIndustry.count})` : "Not enough data yet"}
                />
                <HighlightRow
                  label="Top JD keyword"
                  value={derived.topJdKeyword ? `${derived.topJdKeyword.keyword} (${derived.topJdKeyword.count})` : "Not enough data yet"}
                />
                <HighlightRow
                  label="Top resume keyword"
                  value={derived.topResumeKeyword ? `${derived.topResumeKeyword.keyword} (${derived.topResumeKeyword.count})` : "No resume keyword data yet"}
                />
              </div>
              <div className="mt-5 rounded-xl border border-dashed border-slate-200 bg-white p-4">
                <p className="text-sm font-medium text-slate-900">Recommended next move</p>
                <p className="mt-1 text-sm leading-6 text-slate-600">
                  {derived.analysisGap > 0
                    ? `Review ${derived.analysisGap} analyzed role${derived.analysisGap === 1 ? "" : "s"} that have not been marked applied yet and prioritize the strongest matches first.`
                    : "Your analyzed roles are well progressed. Keep feeding strong postings into analysis to sharpen trend quality."}
                </p>
              </div>
            </div>
          </div>
        </PageSection>

        <PageSection
          title="Focus Areas"
          description="The titles and industries appearing most often in your search activity."
        >
          <div className="space-y-6">
            <RankedList
              title="Top Applied Job Titles"
              emptyLabel="Applied titles will appear here after you start marking roles as applied."
              items={data.topJobTitles.map((item) => ({
                label: item.title,
                count: item.count,
                total: Math.max(data.totalApplied, 1),
              }))}
            />

            <RankedList
              title="Top Industries"
              emptyLabel="Industries will appear here once your analysis history grows."
              items={data.topIndustries.map((item) => ({
                label: item.industry,
                count: item.count,
                total: Math.max(data.totalAnalyses, 1),
              }))}
            />
          </div>
        </PageSection>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <KeywordSection
          title="Top JD Keywords"
          subtitle="Terms most common in the roles you analyze."
          icon={<Briefcase className="h-4 w-4 text-primary" />}
          items={data.topJdKeywords}
          emptyLabel="Analyze a few more jobs to surface hiring language patterns."
          toneClass="bg-primary/10 text-primary"
        />

        <KeywordSection
          title="Top Resume Keywords"
          subtitle="Terms reinforced through your tailored resume output."
          icon={<TrendingUp className="h-4 w-4 text-sky-600" />}
          items={data.topResumeKeywords}
          emptyLabel="Generate tailored resumes to see which strengths are showing up most often."
          toneClass="bg-sky-100 text-sky-700"
        />
      </section>

      <PageActionBar>
        <div>
          Last updated: {data.updatedAt?.slice(0, 16).replace("T", " ")} UTC
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/jobs" search={{ analyzedOnly: true }}
            className="inline-flex items-center rounded-lg border border-slate-200 bg-white px-3 py-2 font-medium text-slate-700 transition hover:bg-slate-100"
          >
            View History
          </Link>
          <Link
            to="/analyze"
            className="inline-flex items-center rounded-lg bg-primary px-3 py-2 font-medium text-primary-foreground transition hover:bg-primary/90"
          >
            Analyze a Job
          </Link>
        </div>
      </PageActionBar>
    </div>
  );
}

function MetricCard({
  icon,
  label,
  value,
  note,
  accent,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  note: string;
  accent: string;
}) {
  return (
    <div
      className="rounded-2xl p-5"
      style={{
        background: "rgba(255,255,255,0.84)",
        backdropFilter: "blur(16px)",
        border: "1px solid rgba(226,232,240,0.7)",
        boxShadow: "0 2px 8px rgba(15,23,42,0.05)",
      }}
    >
      <div className={`inline-flex h-10 w-10 items-center justify-center rounded-xl border ${accent}`}>
        {icon}
      </div>
      <p className="mt-4 text-sm font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-bold tracking-tight text-slate-900">{value}</p>
      <p className="mt-1.5 text-xs leading-5 text-slate-500">{note}</p>
    </div>
  );
}

function RateBar({ label, value, count, color }: { label: string; value: number; count: number | null; color: string }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span className="text-slate-600">{label}</span>
        <span className="font-semibold text-slate-900">
          {Math.round(value)}%{count !== null ? <span className="ml-1.5 font-normal text-slate-400">({count})</span> : null}
        </span>
      </div>
      <div className="h-2 rounded-full bg-slate-100">
        <div
          className={`h-2 rounded-full ${color} transition-all`}
          style={{ width: `${Math.max(4, Math.min(value, 100))}%` }}
        />
      </div>
    </div>
  );
}

function FunnelStep({ label, count, total, color }: { label: string; count: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center gap-3">
      <div className="w-36 shrink-0 text-xs text-slate-600 truncate">{label}</div>
      <div className="flex-1 h-5 rounded-md bg-slate-100 relative overflow-hidden">
        <div
          className={`absolute inset-y-0 left-0 rounded-md ${color} opacity-80`}
          style={{ width: `${Math.max(4, pct)}%` }}
        />
      </div>
      <div className="w-16 shrink-0 text-right text-xs font-semibold text-slate-700">
        {count} <span className="font-normal text-slate-400">({pct}%)</span>
      </div>
    </div>
  );
}

function HighlightRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-3 last:border-b-0 last:pb-0">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="max-w-[60%] text-right text-sm font-medium text-slate-900">{value}</span>
    </div>
  );
}

function RankedList({
  title,
  items,
  emptyLabel,
}: {
  title: string;
  items: Array<{ label: string; count: number; total: number }>;
  emptyLabel: string;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      {items.length === 0 ? (
        <p className="mt-3 text-sm leading-6 text-slate-500">{emptyLabel}</p>
      ) : (
        <div className="mt-4 space-y-4">
          {items.map((item, index) => {
            const width = Math.max(10, Math.round((item.count / item.total) * 100));
            return (
              <div key={`${title}-${item.label}`} className="space-y-1.5">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600">
                      {index + 1}
                    </span>
                    <span className="truncate font-medium text-slate-900">{item.label}</span>
                  </div>
                  <span className="shrink-0 text-slate-500">x{item.count}</span>
                </div>
                <div className="h-2 rounded-full bg-slate-100">
                  <div
                    className="h-2 rounded-full bg-slate-900"
                    style={{ width: `${Math.min(width, 100)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function KeywordSection({
  title,
  subtitle,
  icon,
  items,
  emptyLabel,
  toneClass,
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
  items: Array<{ keyword: string; count: number }>;
  emptyLabel: string;
  toneClass: string;
}) {
  return (
    <div
      className="rounded-2xl p-6"
      style={{
        background: "rgba(255,255,255,0.84)",
        backdropFilter: "blur(16px)",
        border: "1px solid rgba(226,232,240,0.7)",
        boxShadow: "0 2px 8px rgba(15,23,42,0.05)",
      }}
    >
      <div className="flex items-center gap-2 text-slate-900">
        {icon}
        <h2 className="text-base font-semibold">{title}</h2>
      </div>
      <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>

      {items.length === 0 ? (
        <p className="mt-5 text-sm leading-6 text-slate-500">{emptyLabel}</p>
      ) : (
        <div className="mt-5 flex flex-wrap gap-2">
          {items.slice(0, 16).map((item) => (
            <span
              key={`${title}-${item.keyword}`}
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium ${toneClass}`}
            >
              {item.keyword}
              <span className="opacity-70">x{item.count}</span>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function DashboardLoading() {
  return (
    <div className="spx-page space-y-6 animate-pulse">
      <div className="h-44 rounded-2xl bg-muted" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-40 rounded-2xl bg-muted" />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="h-96 rounded-2xl bg-muted" />
        <div className="h-96 rounded-2xl bg-muted" />
      </div>
    </div>
  );
}
