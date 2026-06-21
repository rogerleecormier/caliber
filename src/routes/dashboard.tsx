import { createFileRoute, Link, defer } from "@tanstack/react-router";
import { getAnalytics, type AnalyticsSummaryData } from "@/server/functions/get-analytics";
import { useQuery } from "@tanstack/react-query";
import React, { useMemo, useState, Suspense } from "react";
import {
  BarChart3,
  Briefcase,
  FileText,
  Gauge,
  Sparkles,
  TrendingUp,
  ChevronRight,
  Award,
  Globe,
  ExternalLink,
  Calendar,
} from "lucide-react";
import { requireLoginRedirect } from "@/lib/auth-redirect";
import { PageHero } from "@caliber/ui-kit";
import { StatCardGrid, CompactStatTile } from "@/components/ui/compact-stat-card";
import { DrillDownDialog } from "@/components/ui/drill-down-dialog";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from "recharts";
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
} from "@tanstack/react-table";

export const Route = createFileRoute("/dashboard")({
  beforeLoad: ({ context }) => {
    const ctx = context as { user?: { id: string } | null };
    if (!ctx.user) requireLoginRedirect();
  },
  loader: async () =>
    defer<{ analyticsData: Promise<AnalyticsSummaryData> }>({
      analyticsData: getAnalytics({ data: { period: "all_time" } }),
    }),
  component: DashboardPage,
  pendingComponent: DashboardLoading,
});

// Custom Tooltip component for Recharts
const ChartTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="rounded-xl border border-slate-200/60 bg-slate-900/95 p-3.5 shadow-xl backdrop-blur-md text-slate-100">
        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">{label}</p>
        {payload.map((item: any) => (
          <div key={item.name} className="flex items-center gap-2 text-xs font-semibold">
            <span
              className="h-2 w-2 rounded-full inline-block"
              style={{ backgroundColor: item.color || item.fill }}
            />
            <span className="text-slate-300 capitalize">{item.name}:</span>
            <span className="text-white font-mono font-bold">{item.value}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
};

// Main Dashboard Page
function DashboardPage() {
  const { analyticsData } = Route.useLoaderData() as any;

  return (
    <div className="spx-page space-y-8 pb-16">
      <DashboardHeader />
      <Suspense fallback={<DashboardContentSkeleton />}>
        <DashboardContent analyticsDataPromise={analyticsData} />
      </Suspense>
    </div>
  );
}

// Fast header section — renders immediately
function DashboardHeader() {
  return (
    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
      <PageHero
        eyebrow="Search Insights"
        icon={<BarChart3 className="h-3.5 w-3.5" />}
        title="Search Insights Dashboard"
        description="Real-time analytics on your job search performance, match quality, and positioning trends."
        className="flex-1"
      />

      <div className="flex items-center gap-3 shrink-0 self-start md:self-center">
        <div className="flex items-center gap-1.5 text-xs text-slate-500 bg-white/70 border border-slate-200/80 px-2.5 py-1.5 rounded-lg shadow-sm">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
          <span className="font-semibold text-slate-600">Dynamic Ingestion Live</span>
        </div>
      </div>
    </div>
  );
}

// Slow content section — streams in via Suspense
async function DashboardContent({
  analyticsDataPromise,
}: {
  analyticsDataPromise: Promise<AnalyticsSummaryData>;
}): Promise<React.ReactElement> {
  const initialData: AnalyticsSummaryData = await analyticsDataPromise;
  const [selectedPeriod, setSelectedPeriod] = useState<string>("all_time");

  // Selected drill-down state
  const [drillDown, setDrillDown] = useState<{
    title: string;
    jobs: any[];
  } | null>(null);

  // Real-time data fetching (Query is invalidated when actions occur elsewhere)
  const { data } = useQuery({
    queryKey: ["analytics", selectedPeriod],
    queryFn: async () => {
      const result = await getAnalytics({ data: { period: selectedPeriod } });
      return result;
    },
    initialData: initialData,
    refetchInterval: 15000, // Refresh every 15 seconds
  });

  // Dynamically compile lists of months from allJobs for period dropdown selection
  const availablePeriods = useMemo(() => {
    if (!data || !data.allJobs) return [{ value: "all_time", label: "All Time" }];
    const monthsSet = new Set<string>();
    for (const job of data.allJobs) {
      const date = job.analyzedAt || job.createdAt;
      if (date && date.length >= 7) {
        monthsSet.add(date.slice(0, 7)); // YYYY-MM
      }
    }
    const sortedMonths = Array.from(monthsSet).sort((a, b) => b.localeCompare(a));
    return [
      { value: "all_time", label: "All Time" },
      ...sortedMonths.map((m) => {
        const [year, month] = m.split("-");
        const date = new Date(Number(year), Number(month) - 1, 1);
        const name = date.toLocaleString("en-US", { month: "long", year: "numeric" });
        return { value: m, label: name };
      }),
    ];
  }, [data]);

  const derived = useMemo(() => {
    if (!data) return null;

    const analyses = data.totalAnalyses ?? 0;
    const resumes = data.totalResumesGenerated ?? 0;
    const applied = data.totalApplied ?? 0;
    const pursued = data.totalPursued ?? 0;
    const avgMatch = data.averageMatchScore ?? 0;

    const applicationRate = analyses > 0 ? Math.round((applied / analyses) * 100) : 0;
    const resumeCoverage = analyses > 0 ? Math.round((resumes / analyses) * 100) : 0;
    const pursueRate = analyses > 0 ? Math.round((pursued / analyses) * 100) : 0;
    const pursueToApplyRate = pursued > 0 ? Math.round((applied / pursued) * 100) : 0;

    let matchLabel = "Needs attention";
    let matchColor = "#f59e0b";
    if (avgMatch >= 75) {
      matchLabel = "Strong alignment";
      matchColor = "#10b981";
    } else if (avgMatch >= 60) {
      matchLabel = "Solid base";
      matchColor = "#0ea5e9";
    }

    // Pie chart colors
    const colors = [
      "var(--color-indigo-500)",
      "var(--color-primary-500)",
      "var(--color-warning-500)",
      "var(--color-success-500)",
      "var(--color-info-500)",
      "#a855f7",
      "#ec4899",
      "#f43f5e",
    ];

    const industryChartData = data.topIndustries.slice(0, 6).map((item, idx) => ({
      name: item.industry,
      value: item.count,
      fill: colors[idx % colors.length],
    }));

    return {
      applicationRate,
      resumeCoverage,
      pursueRate,
      pursueToApplyRate,
      matchLabel,
      matchColor,
      industryChartData,
    };
  }, [data]);

  if (!data || !derived) {
    return (
      <div className="text-center text-slate-500 py-12">
        No analytics data yet. Analyze some job postings to get started.
      </div>
    );
  }

  // --- Drill-down Handlers ---
  const handleFunnelClick = (entry: any) => {
    if (!entry || !entry.name) return;
    const statusName = entry.name;
    const matchingJobs = data.allJobs.filter((job) => job.status === statusName);
    setDrillDown({
      title: `Jobs in Status: ${statusName}`,
      jobs: matchingJobs,
    });
  };

  const handleScoreClick = (entry: any) => {
    if (!entry || !entry.range) return;
    const range = entry.range;
    let matchingJobs = [];
    if (range.startsWith("Strong")) {
      matchingJobs = data.allJobs.filter((job) => job.matchScore !== null && job.matchScore >= 80);
    } else if (range.startsWith("Moderate")) {
      matchingJobs = data.allJobs.filter(
        (job) => job.matchScore !== null && job.matchScore >= 60 && job.matchScore < 80
      );
    } else {
      matchingJobs = data.allJobs.filter((job) => job.matchScore !== null && job.matchScore < 60);
    }
    setDrillDown({
      title: `Jobs with ${range} Match`,
      jobs: matchingJobs,
    });
  };

  const handleWorkplaceClick = (entry: any) => {
    if (!entry || !entry.type) return;
    const type = entry.type;
    const matchingJobs = data.allJobs.filter((job) => {
      let jobType = job.workplaceType || "Remote";
      if (jobType.toLowerCase() === "fully_remote") jobType = "Remote";
      if (jobType.toLowerCase() === "on_site") jobType = "On-site";
      const norm = jobType.charAt(0).toUpperCase() + jobType.slice(1).toLowerCase();
      return norm === type;
    });
    setDrillDown({
      title: `Jobs with Workplace Type: ${type}`,
      jobs: matchingJobs,
    });
  };

  const handleSourceClick = (entry: any) => {
    if (!entry || !entry.source) return;
    const source = entry.source;
    const matchingJobs = data.allJobs.filter((job) => job.sourceName === source);
    setDrillDown({
      title: `Jobs from Source: ${source}`,
      jobs: matchingJobs,
    });
  };

  const handleKeywordDrillDown = (keyword: string) => {
    const matchingJobs = data.allJobs.filter(
      (job) => job.keywords && job.keywords.some((kw) => kw.toLowerCase() === keyword.toLowerCase())
    );
    setDrillDown({
      title: `Jobs Matching Keyword: "${keyword}"`,
      jobs: matchingJobs,
    });
  };

  const handleTitleDrillDown = (title: string) => {
    const matchingJobs = data.allJobs.filter((job) => {
      const jobTitle = job.title.toLowerCase();
      return jobTitle.includes(title.toLowerCase());
    });
    setDrillDown({
      title: `Jobs Matching Title: "${title}"`,
      jobs: matchingJobs,
    });
  };

  const handleIndustryDrillDown = (industry: string) => {
    const matchingJobs = data.allJobs.filter(
      (job) => job.industry && job.industry.toLowerCase() === industry.toLowerCase()
    );
    setDrillDown({
      title: `Jobs in Industry: "${industry}"`,
      jobs: matchingJobs,
    });
  };

  return (
    <div className="space-y-8 pb-16">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div></div>
        <div className="flex items-center gap-3 shrink-0 self-start md:self-center">
          <div className="relative">
            <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
            <select
              value={selectedPeriod}
              onChange={(e) => setSelectedPeriod(e.target.value)}
              className="h-10 rounded-xl border border-slate-200 bg-white pl-9 pr-4 text-sm font-semibold text-slate-700 shadow-sm cursor-pointer hover:bg-slate-50 transition"
              aria-label="Filter insights by period"
            >
              {availablePeriods.map((p) => (
                <option key={p.value} value={p.value}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* KPI Stats — single card, 4 clickable tiles */}
      <section>
        <StatCardGrid cols={4}>
          <CompactStatTile
            icon={<Gauge className="h-4 w-4" />}
            label="Average Match"
            value={`${data.averageMatchScore.toFixed(1)}%`}
            note={derived.matchLabel}
            onClick={() => setDrillDown({ title: "All Analyzed Jobs", jobs: data.allJobs.filter((j) => j.matchScore != null) })}
          />
          <CompactStatTile
            icon={<Sparkles className="h-4 w-4" />}
            label="Unicorn Matches"
            value={String(data.unicornCount)}
            note="High-fit transferable skills"
            onClick={() => setDrillDown({ title: "Unicorn Matches", jobs: data.allJobs.filter((j) => (j as any).isUnicorn) })}
            accentClass="text-amber-600"
          />
          <CompactStatTile
            icon={<FileText className="h-4 w-4" />}
            label="Tailored Resumes"
            value={String(data.totalResumesGenerated)}
            note={`${derived.resumeCoverage}% coverage`}
          />
          <CompactStatTile
            icon={<Award className="h-4 w-4" />}
            label="Active Pipeline"
            value={String(data.totalJobsDiscovered)}
            note={`${data.totalApplied} applied · ${data.totalPursued} pursued`}
            onClick={() => setDrillDown({ title: "Full Pipeline", jobs: data.allJobs })}
          />
        </StatCardGrid>
      </section>

      {/* Primary Insights Charts */}
      <section className="grid gap-6 md:grid-cols-2">
        {/* Pipeline Funnel */}
        <div className="rounded-lg border border-slate-200 bg-white/80 p-5 shadow-sm flex flex-col h-[360px]">
          <div>
            <h3 className="font-bold text-slate-800 text-base leading-none">Application Funnel</h3>
            <p className="text-xs text-slate-500 mt-1">
              Click any stage to filter and view matching jobs in that stage.
            </p>
          </div>
          <div className="w-full h-[270px] mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.pipelineConversions}
                layout="vertical"
                margin={{ top: 5, right: 20, left: 65, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" stroke="#94a3b8" fontSize={11} />
                <YAxis dataKey="status" type="category" stroke="#94a3b8" fontSize={11} tickLine={false} />
                <RechartsTooltip content={<ChartTooltip />} cursor={{ fill: "rgba(148, 163, 184, 0.06)" }} />
                <Bar
                  dataKey="count"
                  name="Jobs"
                  fill="var(--color-primary-600)"
                  radius={[0, 6, 6, 0]}
                  onClick={handleFunnelClick}
                  cursor="pointer"
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Match Score Distribution */}
        <div className="rounded-lg border border-slate-200 bg-white/80 p-5 shadow-sm flex flex-col h-[360px]">
          <div>
            <h3 className="font-bold text-slate-800 text-base leading-none">Match Score Distribution</h3>
            <p className="text-xs text-slate-500 mt-1">
              Distribution of AI scoring brackets. Click a bracket to view roles.
            </p>
          </div>
          <div className="w-full h-[270px] mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.matchScoreDistribution} margin={{ top: 20, right: 10, left: -20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                <XAxis dataKey="range" stroke="#94a3b8" fontSize={11} tickLine={false} />
                <YAxis stroke="#94a3b8" fontSize={11} />
                <RechartsTooltip content={<ChartTooltip />} cursor={{ fill: "rgba(148, 163, 184, 0.06)" }} />
                <Bar dataKey="count" name="Jobs" radius={[6, 6, 0, 0]} onClick={handleScoreClick} cursor="pointer">
                  {data.matchScoreDistribution.map((_entry, idx) => {
                    const fills = [
                      "#0d9488", // Strong  → teal
                      "#f59e0b", // Moderate → amber
                      "#ef4444", // Weak    → red (semantic: error/low)
                    ];
                    return <Cell key={`cell-${idx}`} fill={fills[idx % fills.length]} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Workplace Type Preference */}
        <div className="rounded-lg border border-slate-200 bg-white/80 p-5 shadow-sm flex flex-col h-[360px]">
          <div>
            <h3 className="font-bold text-slate-800 text-base leading-none">Workplace Arrangement</h3>
            <p className="text-xs text-slate-500 mt-1">
              Arrangement preference distribution. Click a slice to filter.
            </p>
          </div>
          <div className="w-full h-[270px] mt-2 relative flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={data.workplaceTypeDistribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={100}
                  paddingAngle={4}
                  dataKey="count"
                  nameKey="type"
                  onClick={handleWorkplaceClick}
                  cursor="pointer"
                  label={({ type, percent }: any) => `${type} (${Math.round((percent ?? 0) * 100)}%)`}
                >
                  {data.workplaceTypeDistribution.map((_entry, idx) => {
                    const colors = ["#6366f1", "#0d9488", "#ea580c", "#f59e0b"];
                    return <Cell key={`cell-${idx}`} fill={colors[idx % colors.length]} />;
                  })}
                </Pie>
                <RechartsTooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute flex flex-col items-center justify-center pointer-events-none">
              <Globe className="h-6 w-6 text-slate-400" />
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Arrangements</span>
            </div>
          </div>
        </div>

        {/* Ingestion Sources */}
        <div className="rounded-lg border border-slate-200 bg-white/80 p-5 shadow-sm flex flex-col h-[360px]">
          <div>
            <h3 className="font-bold text-slate-800 text-base leading-none">Ingestion Sources</h3>
            <p className="text-xs text-slate-500 mt-1">
              Breakdown of channels jobs were sourced from. Click a bar to filter.
            </p>
          </div>
          <div className="w-full h-[270px] mt-4">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={data.sourceDistribution}
                layout="vertical"
                margin={{ top: 5, right: 20, left: 60, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
                <XAxis type="number" stroke="#94a3b8" fontSize={11} />
                <YAxis dataKey="source" type="category" stroke="#94a3b8" fontSize={11} tickLine={false} />
                <RechartsTooltip content={<ChartTooltip />} cursor={{ fill: "rgba(148, 163, 184, 0.06)" }} />
                <Bar dataKey="count" name="Jobs" fill="#8b5cf6" radius={[0, 6, 6, 0]} onClick={handleSourceClick} cursor="pointer">
                  {data.sourceDistribution.map((_entry, idx) => {
                    const colors = ["#0284c7", "#0d9488", "#4f46e5", "#ea580c", "#8b5cf6"];
                    return <Cell key={`cell-${idx}`} fill={colors[idx % colors.length]} />;
                  })}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </section>

      {/* Target Sectors & Categories */}
      <section className="grid gap-6 md:grid-cols-2">
        {/* Top Titles */}
        <div className="rounded-lg border border-slate-200 bg-white/80 p-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
            <div>
              <h3 className="font-bold text-slate-800 text-base leading-none">Top Target Job Titles</h3>
              <p className="text-xs text-slate-500 mt-1">Applied roles aggregated by canonical prefix</p>
            </div>
            <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded">
              Active Focus
            </span>
          </div>

          {data.topJobTitles.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">No jobs analyzed/applied yet.</p>
          ) : (
            <div className="space-y-2.5">
              {data.topJobTitles.slice(0, 5).map((item, idx) => (
                <div
                  key={item.title}
                  onClick={() => handleTitleDrillDown(item.title)}
                  className="group flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-white/50 hover:bg-white hover:border-slate-300/80 cursor-pointer shadow-sm transition"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-indigo-50 font-bold text-xs text-indigo-600 group-hover:bg-indigo-100 transition">
                      {idx + 1}
                    </span>
                    <span className="text-sm font-semibold text-slate-800 group-hover:text-slate-900">
                      {item.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-500">
                    <span className="text-xs font-mono font-bold text-slate-600">×{item.count}</span>
                    <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-slate-600 transition" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Industries */}
        <div className="rounded-lg border border-slate-200 bg-white/80 p-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
            <div>
              <h3 className="font-bold text-slate-800 text-base leading-none">Top Target Industries</h3>
              <p className="text-xs text-slate-500 mt-1">Analyzed positions aggregated by sector</p>
            </div>
            <span className="text-[10px] font-bold text-teal-600 bg-teal-50 border border-teal-100 px-2 py-0.5 rounded">
              Hiring Density
            </span>
          </div>

          {data.topIndustries.length === 0 ? (
            <p className="text-xs text-slate-400 py-6 text-center">No industries analyzed yet.</p>
          ) : (
            <div className="space-y-2.5">
              {data.topIndustries.slice(0, 5).map((item, idx) => (
                <div
                  key={item.industry}
                  onClick={() => handleIndustryDrillDown(item.industry)}
                  className="group flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-white/50 hover:bg-white hover:border-slate-300/80 cursor-pointer shadow-sm transition"
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 font-bold text-xs text-emerald-600 group-hover:bg-emerald-100 transition">
                      {idx + 1}
                    </span>
                    <span className="text-sm font-semibold text-slate-800 group-hover:text-slate-900">
                      {item.industry}
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-slate-500">
                    <span className="text-xs font-mono font-bold text-slate-600">×{item.count}</span>
                    <ChevronRight className="h-4 w-4 text-slate-400 group-hover:text-slate-600 transition" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Keyword Insights */}
      <section className="grid gap-6 md:grid-cols-2">
        <KeywordBubbleCard
          title="Job Description Keywords"
          subtitle="Most common terms in analyzed job listings"
          icon={<Briefcase className="h-4 w-4 text-indigo-500" />}
          items={data.topJdKeywords}
          themeClass="bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-100/50"
          onKeywordClick={handleKeywordDrillDown}
        />
        <KeywordBubbleCard
          title="Resume Achievements Keywords"
          subtitle="Terms reinforced across tailored resumes"
          icon={<TrendingUp className="h-4 w-4 text-emerald-500" />}
          items={data.topResumeKeywords}
          themeClass="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-100/50"
          onKeywordClick={handleKeywordDrillDown}
        />
      </section>

      {/* Recent Analyses TanStack Table */}
      <section className="rounded-lg border border-slate-200 bg-white/80 p-5 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-slate-100 pb-4 mb-5 gap-3">
          <div>
            <h3 className="font-bold text-slate-800 text-base leading-none">Recent Job Analyses</h3>
            <p className="text-xs text-slate-500 mt-1">Detailed list of your 10 most recent job analyses</p>
          </div>
          <span className="text-[10px] font-bold text-purple-600 bg-purple-50 border border-purple-100 px-2 py-0.5 rounded self-start sm:self-center">
            Active Repository
          </span>
        </div>
        <RecentAnalysesTable jobs={data.recentAnalyses} />
      </section>

      {/* Drill-down Dialog */}
      <DrillDownDialog
        open={!!drillDown}
        onClose={() => setDrillDown(null)}
        title={drillDown?.title ?? ""}
        description={drillDown ? `${drillDown.jobs.length} job${drillDown.jobs.length === 1 ? "" : "s"}` : undefined}
      >
        {drillDown && (
          <div className="space-y-1">
            {drillDown.jobs.length === 0 ? (
              <p className="text-sm text-slate-400 py-6 text-center">No jobs match this filter.</p>
            ) : (
              <>
                {drillDown.jobs.slice(0, 50).map((job: any) => (
                  <div key={job.id ?? job.sourceUrl} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-slate-800 truncate">{job.title}</p>
                      <p className="text-xs text-slate-500 truncate">{job.company}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0 ml-3">
                      {job.matchScore != null && (
                        <span className="text-xs font-bold text-teal-700 bg-teal-50 border border-teal-200 rounded px-1.5 py-0.5">
                          {job.matchScore}%
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                {drillDown.jobs.length > 50 && (
                  <p className="text-xs text-slate-400 pt-2 text-center">Showing first 50 of {drillDown.jobs.length} jobs</p>
                )}
                <div className="pt-3 text-center">
                  <Link
                    to="/jobs"
                    search={{ view: "all-jobs", page: 1, query: "", remote: false, sortBy: "posted-date", status: "", analyzedOnly: false }}
                    onClick={() => setDrillDown(null)}
                    className="text-sm font-semibold text-orange-600 hover:text-orange-700"
                  >
                    View all jobs →
                  </Link>
                </div>
              </>
            )}
          </div>
        )}
      </DrillDownDialog>
    </div>
  );
}


// Keyword bubble tag cloud
function KeywordBubbleCard({
  title,
  subtitle,
  icon,
  items,
  themeClass,
  onKeywordClick,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  items: Array<{ keyword: string; count: number }>;
  themeClass: string;
  onKeywordClick: (keyword: string) => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white/80 p-5 shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4 text-slate-800">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-slate-50 border border-slate-100 shadow-sm">{icon}</div>
          <div>
            <h3 className="font-bold text-sm leading-none">{title}</h3>
            <p className="text-[11px] text-slate-500 mt-1">{subtitle}</p>
          </div>
        </div>
      </div>
      {items.length === 0 ? (
        <p className="text-xs text-slate-400 py-6 text-center">Analyze jobs to aggregate keywords.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {items.slice(0, 20).map((item) => (
            <button
              key={item.keyword}
              type="button"
              onClick={() => onKeywordClick(item.keyword)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold cursor-pointer shadow-sm transition active:scale-95 ${themeClass}`}
            >
              <span>{item.keyword}</span>
              <span className="opacity-60 text-[10px] font-bold">×{item.count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Recent analyses table using TanStack Table
function RecentAnalysesTable({ jobs }: { jobs: any[] }) {
  const columns = useMemo(
    () => [
      {
        accessorKey: "title",
        header: "Position / Company",
        cell: (info: any) => {
          const row = info.row.original;
          return (
            <div className="max-w-[220px]">
              <div className="font-semibold text-slate-900 truncate leading-snug" title={row.title}>{row.title}</div>
              <div className="text-xs text-slate-500 mt-0.5 truncate">{row.company}</div>
            </div>
          );
        },
      },
      {
        accessorKey: "matchScore",
        header: "Score",
        cell: (info: any) => {
          const score = info.getValue();
          if (score == null) return <span className="text-slate-400 font-medium">—</span>;
          const color = score >= 80 ? "text-teal-700 bg-teal-50 border-teal-100"
            : score >= 60 ? "text-amber-700 bg-amber-50 border-amber-100"
            : "text-red-700 bg-red-50 border-red-100";
          return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold border ${color}`}>{score}%</span>;
        },
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: (info: any) => (
          <span className="inline-flex items-center rounded-full bg-indigo-50 border border-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-700">
            {info.getValue()}
          </span>
        ),
      },
      {
        accessorKey: "sourceName",
        header: "Source",
        cell: (info: any) => (
          <span className="text-xs text-slate-500 bg-slate-50 border border-slate-100 px-2 py-0.5 rounded">
            {info.getValue()}
          </span>
        ),
      },
      {
        id: "actions",
        header: "",
        cell: (info: any) => {
          const row = info.row.original;
          return (
            <div className="flex items-center gap-1.5 justify-end">
              <Link
                to="/jobs"
                search={(prev: any) => ({ ...prev, query: row.title, status: row.status })}
                className="inline-flex h-7 items-center gap-1 rounded border border-slate-200 bg-white hover:bg-slate-50 px-2 text-xs font-semibold text-slate-700 transition"
              >
                Track
              </Link>
              {row.sourceUrl && (
                <a
                  href={row.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-7 w-7 items-center justify-center rounded bg-orange-600 hover:bg-orange-700 text-white transition"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          );
        },
      },
    ],
    [],
  );

  const table = useReactTable({
    data: jobs,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white/50 shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-slate-50">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} className="border-b border-slate-200">
              {hg.headers.map((h) => (
                <th key={h.id} className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {flexRender(h.column.columnDef.header, h.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody className="divide-y divide-slate-100">
          {table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => (
              <tr key={row.id} className="hover:bg-slate-50/60 transition h-10">
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id} className="px-3 py-2 text-sm">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={5} className="py-8 text-center text-xs text-slate-400">No recent analyses yet.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

// Loading Skeleton Screen
function DashboardLoading() {
  return (
    <div className="spx-page space-y-6 animate-pulse">
      <div className="h-44 rounded-2xl bg-slate-200/70" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 rounded-2xl bg-slate-200/70" />
        ))}
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <div className="h-80 rounded-2xl bg-slate-200/70" />
        <div className="h-80 rounded-2xl bg-slate-200/70" />
      </div>
    </div>
  );
}

// Content skeleton while analytics data streams in
function DashboardContentSkeleton() {
  return (
    <div className="space-y-8 pb-16 animate-pulse">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="h-28 rounded-2xl bg-slate-200/70" />
        ))}
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="h-80 rounded-2xl bg-slate-200/70" />
        <div className="h-80 rounded-2xl bg-slate-200/70" />
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <div className="h-80 rounded-2xl bg-slate-200/70" />
        <div className="h-80 rounded-2xl bg-slate-200/70" />
      </div>
    </div>
  );
}
