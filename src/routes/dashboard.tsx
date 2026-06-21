import { createFileRoute, Link } from "@tanstack/react-router";
import { getAnalytics, type AnalyticsSummaryData } from "@/server/functions/get-analytics";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  Briefcase,
  FileText,
  Gauge,
  Sparkles,
  TrendingUp,
  ChevronRight,
  X,
  Award,
  Globe,
  MapPin,
  ExternalLink,
  Search,
  ArrowUpDown,
  ChevronLeft,
  ChevronRight as ChevronRightIcon,
  Building2,
  Calendar,
} from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { requireLoginRedirect } from "@/lib/auth-redirect";
import { PageHero } from "@caliber/ui-kit";
import { StatCardGrid, CompactStatTile } from "@/components/ui/compact-stat-card";
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
  getSortedRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  flexRender,
} from "@tanstack/react-table";

export const Route = createFileRoute("/dashboard")({
  beforeLoad: ({ context }) => {
    const ctx = context as { user?: { id: string } | null };
    if (!ctx.user) requireLoginRedirect();
  },
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
  const { data, isLoading } = useQuery({
    queryKey: ["analytics", "all_time"],
    queryFn: async () => getAnalytics({ data: { period: "all_time" } }),
  });

  if (isLoading || !data) {
    return <DashboardLoading />;
  }

  return (
    <div className="spx-page space-y-8 pb-16">
      <DashboardHeader />
      <DashboardContent initialData={data} />
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

// Dashboard content — synchronous component, initialData from loader
function DashboardContent({
  initialData,
}: {
  initialData: AnalyticsSummaryData;
}) {
  const [selectedPeriod, setSelectedPeriod] = useState<string>("all_time");

  // Selected drill-down state
  const [drillDown, setDrillDown] = useState<{
    title: string;
    jobs: any[];
  } | null>(null);

  // Real-time data fetching — uses loader result as initialData, polls every 15s
  const { data } = useQuery({
    queryKey: ["analytics", selectedPeriod],
    queryFn: async () => {
      const result = await getAnalytics({ data: { period: selectedPeriod } });
      return result;
    },
    initialData: initialData,
    refetchInterval: 15000,
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
                      "#ef4444", // Weak    → red (semantic)
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
            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded">
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

      {/* Drill-down Modal */}
      {drillDown && (
        <DrillDownModal
          title={drillDown.title}
          jobs={drillDown.jobs}
          onClose={() => setDrillDown(null)}
        />
      )}
    </div>
  );
}

// KPI Metric Card Component
function MetricCard({
  icon,
  label,
  value,
  note,
  accent,
  color,
  progress,
  isGlowing = false,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  note: string;
  accent: string;
  color?: string;
  progress?: number;
  isGlowing?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl p-5 border relative overflow-hidden transition hover:-translate-y-0.5 duration-300 ${
        isGlowing
          ? "border-amber-200/80 bg-gradient-to-br from-amber-50/40 via-white/80 to-amber-100/10 shadow-[0_4px_20px_rgba(245,158,11,0.08)] hover:shadow-[0_6px_24px_rgba(245,158,11,0.15)]"
          : "border-slate-200/70 bg-white/80 backdrop-blur-md shadow-sm hover:shadow-md"
      }`}
    >
      {isGlowing && (
        <div className="absolute right-0 top-0 h-24 w-24 -mr-5 -mt-5 bg-gradient-to-br from-amber-300/10 to-amber-500/10 rounded-full blur-xl pointer-events-none" />
      )}
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</p>
          <p className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 leading-none">{value}</p>
        </div>
        <div className={`flex h-9 w-9 items-center justify-center rounded-xl border ${accent} shrink-0`}>
          {icon}
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <p className="text-[11px] font-semibold text-slate-500 truncate leading-snug">{note}</p>
        {progress !== undefined && (
          <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-600">
            <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
            <span>Score</span>
          </div>
        )}
      </div>

      {progress !== undefined && (
        <div className="h-1.5 w-full bg-slate-100 rounded-full mt-3 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{ width: `${progress}%`, backgroundColor: color }}
          />
        </div>
      )}
    </div>
  );
}

// Keyword Bubble Card Component
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
  icon: ReactNode;
  items: Array<{ keyword: string; count: number }>;
  themeClass: string;
  onKeywordClick: (keyword: string) => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white/80 p-5 shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4 text-slate-800">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-lg bg-slate-50 border border-slate-150 shadow-sm">{icon}</div>
          <div>
            <h3 className="font-bold text-sm leading-none">{title}</h3>
            <p className="text-[11px] text-slate-500 mt-1">{subtitle}</p>
          </div>
        </div>
        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">
          Interactive
        </span>
      </div>

      {items.length === 0 ? (
        <p className="text-xs text-slate-400 py-6 text-center">Analyze jobs to aggregate keywords.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {items.slice(0, 20).map((item) => (
            <button
              key={item.keyword}
              onClick={() => onKeywordClick(item.keyword)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold cursor-pointer shadow-sm transition active:scale-95 duration-150 ${themeClass}`}
            >
              <span>{item.keyword}</span>
              <span className="opacity-60 text-[10px] font-bold">x{item.count}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// TanStack Table for Recent Analyses
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
              <div className="font-semibold text-slate-900 truncate leading-snug" title={row.title}>
                {row.title}
              </div>
              <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-1 font-medium">
                <Building2 className="h-3 w-3 shrink-0" />
                <span className="truncate">{row.company}</span>
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: "matchScore",
        header: "Match Score",
        cell: (info: any) => {
          const score = info.getValue();
          if (score === null || score === undefined) return <span className="text-slate-400 font-medium">—</span>;
          const color =
            score >= 80
              ? "text-emerald-700 bg-emerald-50 border-emerald-100"
              : score >= 60
                ? "text-amber-700 bg-amber-50 border-amber-100"
                : "text-red-700 bg-red-50 border-red-100";
          return (
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold border ${color}`}
            >
              {score}%
            </span>
          );
        },
      },
      {
        accessorKey: "location",
        header: "Location",
        cell: (info: any) => {
          const loc = info.getValue() || "Remote";
          return (
            <div className="flex items-center gap-1 text-slate-600 text-xs font-semibold">
              <MapPin className="h-3 w-3 text-slate-400 shrink-0" />
              <span className="truncate max-w-[120px]">{loc}</span>
            </div>
          );
        },
      },
      {
        accessorKey: "sourceName",
        header: "Channel",
        cell: (info: any) => {
          const val = info.getValue();
          return (
            <span className="text-xs font-semibold text-slate-500 bg-slate-50 border border-slate-100 px-2 py-0.5 rounded">
              {val}
            </span>
          );
        },
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: (info: any) => {
          const val = info.getValue();
          return (
            <span className="inline-flex items-center rounded-full bg-indigo-50 border border-indigo-100 px-2 py-0.5 text-xs font-bold text-indigo-700">
              {val}
            </span>
          );
        },
      },
      {
        id: "actions",
        header: "Action",
        cell: (info: any) => {
          const row = info.row.original;
          return (
            <div className="flex items-center gap-2 justify-end">
              <Link
                to="/jobs"
                search={(prev: any) => ({ ...prev, query: row.title, status: row.status })}
                className="inline-flex h-7 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-2 text-xs font-bold text-slate-700 transition"
              >
                Track
              </Link>
              <a
                href={row.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-orange-600 hover:bg-orange-700 text-white transition shadow-sm"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          );
        },
      },
    ],
    []
  );

  const table = useReactTable({
    data: jobs,
    columns,
    getCoreRowModel: getCoreRowModel(),
  });

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white/50 shadow-sm">
      <table className="w-full">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr key={headerGroup.id} className="border-b border-slate-200 bg-slate-50/90">
              {headerGroup.headers.map((header) => (
                <th
                  key={header.id}
                  className="px-4 py-3 text-left text-xs font-bold uppercase tracking-wider text-slate-600"
                >
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody className="divide-y divide-slate-100">
          {table.getRowModel().rows.map((row) => (
            <tr key={row.id} className="transition hover:bg-white/90">
              {row.getVisibleCells().map((cell) => (
                <th
                  key={cell.id}
                  className="px-4 py-3.5 text-left font-normal align-middle"
                >
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Drill Down Modal containing searchable/sortable TanStack Table
function DrillDownModal({
  title,
  jobs,
  onClose,
}: {
  title: string;
  jobs: any[];
  onClose: () => void;
}) {
  const [globalFilter, setGlobalFilter] = useState("");
  const [sorting, setSorting] = useState<any[]>([]);

  const columns = useMemo(
    () => [
      {
        accessorKey: "title",
        header: ({ column }: any) => (
          <button
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="flex items-center gap-1 hover:text-slate-800 transition font-bold"
          >
            Position
            <ArrowUpDown className="h-3.5 w-3.5" />
          </button>
        ),
        cell: (info: any) => {
          const row = info.row.original;
          return (
            <div>
              <div className="font-semibold text-slate-900 leading-snug">{row.title}</div>
              <div className="flex items-center gap-1 text-xs text-slate-500 mt-0.5">
                <Building2 className="h-3 w-3" />
                <span>{row.company}</span>
              </div>
            </div>
          );
        },
      },
      {
        accessorKey: "matchScore",
        header: ({ column }: any) => (
          <button
            onClick={() => column.toggleSorting(column.getIsSorted() === "asc")}
            className="flex items-center gap-1 hover:text-slate-800 transition font-bold"
          >
            Score
            <ArrowUpDown className="h-3.5 w-3.5" />
          </button>
        ),
        cell: (info: any) => {
          const score = info.getValue();
          if (score === null || score === undefined) return <span className="text-slate-400 font-medium">—</span>;
          const color =
            score >= 80
              ? "text-emerald-700 bg-emerald-50 border-emerald-100"
              : score >= 60
                ? "text-amber-700 bg-amber-50 border-amber-100"
                : "text-red-700 bg-red-50 border-red-100";
          return (
            <span
              className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold border ${color}`}
            >
              {score}%
            </span>
          );
        },
      },
      {
        accessorKey: "workplaceType",
        header: "Workplace",
        cell: (info: any) => {
          let type = info.getValue() || "Remote";
          if (type.toLowerCase() === "fully_remote") type = "Remote";
          if (type.toLowerCase() === "on_site") type = "On-site";
          const norm = type.charAt(0).toUpperCase() + type.slice(1).toLowerCase();
          return <span className="text-xs text-slate-600 font-semibold">{norm}</span>;
        },
      },
      {
        accessorKey: "sourceName",
        header: "Source",
        cell: (info: any) => (
          <span className="text-xs font-semibold text-slate-500 bg-slate-50 border border-slate-100 px-2 py-0.5 rounded">
            {info.getValue()}
          </span>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: (info: any) => {
          const val = info.getValue();
          return (
            <span className="inline-flex items-center rounded-full bg-indigo-50 border border-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-700">
              {val}
            </span>
          );
        },
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
                onClick={onClose}
                className="inline-flex h-7 items-center justify-center rounded-lg border border-slate-200 bg-white hover:bg-slate-50 px-2.5 text-xs font-bold text-slate-700 transition"
              >
                Track
              </Link>
              <a
                href={row.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-orange-600 hover:bg-orange-700 text-white transition shadow-sm"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
          );
        },
      },
    ],
    [onClose]
  );

  const table = useReactTable({
    data: jobs,
    columns,
    state: {
      globalFilter,
      sorting,
    },
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
      <div className="relative w-full max-w-4xl max-h-[85vh] rounded-2xl bg-white shadow-2xl overflow-hidden border border-slate-100 flex flex-col">
        {/* Header */}
        <div className="sticky top-0 border-b border-slate-200/80 bg-slate-50 px-6 py-4 flex items-center justify-between z-10">
          <div>
            <h2 className="text-base font-bold text-slate-900 leading-none">{title}</h2>
            <p className="text-xs text-slate-500 mt-1">Detailed list of jobs matching this category</p>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-200 rounded-lg text-slate-400 hover:text-slate-600 transition"
            aria-label="Close modal"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Search controls */}
        <div className="px-6 py-3 border-b border-slate-100 bg-white flex items-center gap-2">
          <Search className="h-4 w-4 text-slate-400 shrink-0" />
          <input
            type="text"
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            placeholder="Search matching positions or companies..."
            className="w-full border-0 p-0 text-sm focus:outline-none focus:ring-0 placeholder:text-slate-400 text-slate-800"
          />
        </div>

        {/* Content */}
        <div className="overflow-y-auto flex-1 min-h-0">
          <div className="p-6">
            <div className="overflow-x-auto rounded-xl border border-slate-200/80">
              <table className="w-full border-collapse">
                <thead>
                  {table.getHeaderGroups().map((headerGroup) => (
                    <tr key={headerGroup.id} className="border-b border-slate-250 bg-slate-50/80">
                      {headerGroup.headers.map((header) => (
                        <th
                          key={header.id}
                          className="px-4 py-2.5 text-left text-xs font-bold uppercase tracking-wider text-slate-500"
                        >
                          {header.isPlaceholder
                            ? null
                            : flexRender(header.column.columnDef.header, header.getContext())}
                        </th>
                      ))}
                    </tr>
                  ))}
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {table.getRowModel().rows.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50 transition">
                      {row.getVisibleCells().map((cell) => (
                        <td key={cell.id} className="px-4 py-3 text-sm text-slate-800 font-medium">
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {table.getRowModel().rows.length === 0 && (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-xs text-slate-400 font-semibold">
                        No matching jobs found.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {table.getPageCount() > 1 && (
              <div className="flex items-center justify-between gap-4 mt-4">
                <span className="text-xs text-slate-500 font-semibold">
                  Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => table.previousPage()}
                    disabled={!table.getCanPreviousPage()}
                    className="p-1.5 border border-slate-200 bg-white rounded-lg text-slate-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  <button
                    onClick={() => table.nextPage()}
                    disabled={!table.getCanNextPage()}
                    className="p-1.5 border border-slate-200 bg-white rounded-lg text-slate-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-50 transition"
                  >
                    <ChevronRightIcon className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-slate-200 bg-slate-50 px-6 py-3.5 text-xs text-slate-500 text-center font-semibold">
          Showing {table.getFilteredRowModel().rows.length} of {jobs.length} items
        </div>
      </div>
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
