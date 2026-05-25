import { createFileRoute } from "@tanstack/react-router";
import { getAnalytics } from "@/server/functions/get-analytics";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  Briefcase,
  FileText,
  Gauge,
  Sparkles,
  Target,
  TrendingUp,
  ChevronRight,
  X,
} from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { requireLoginRedirect } from "@/lib/auth-redirect";
import { PageHero, PageSection } from "@caliber/ui-kit";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

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
  const initialData = Route.useLoaderData();
  const [selectedDrillDown, setSelectedDrillDown] = useState<{
    type: "keywords" | "titles" | "industries" | null;
    data?: any[];
    title?: string;
  }>({ type: null });

  // Real-time data fetching with auto-refresh every 30 seconds
  const { data } = useQuery({
    queryKey: ["analytics"],
    queryFn: async () => {
      const result = await getAnalytics({ data: { period: "all_time" } });
      return result;
    },
    initialData: initialData,
    refetchInterval: 30000, // Auto-refresh every 30 seconds
  });

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
    const analysisGap = Math.max(analyses - applied, 0);

    let matchLabel = "Needs attention";
    let matchColor = "#f59e0b";
    if (avgMatch >= 75) {
      matchLabel = "Strong alignment";
      matchColor = "#10b981";
    } else if (avgMatch >= 60) {
      matchLabel = "Solid base";
      matchColor = "#0ea5e9";
    }

    const funnelData = [
      { name: "Analyzed", value: analyses, fill: "#8b5cf6" },
      { name: "Pursuing", value: pursued, fill: "#06b6d4" },
      { name: "Applied", value: applied, fill: "#10b981" },
    ];

    const industryChartData = data.topIndustries.slice(0, 8).map((item) => ({
      name: item.industry,
      value: item.count,
      fill: generateColor(item.industry),
    }));

    const topRole = data.topJobTitles?.[0];
    const topIndustry = data.topIndustries?.[0];

    return {
      applicationRate,
      resumeCoverage,
      pursueRate,
      pursueToApplyRate,
      analysisGap,
      matchLabel,
      matchColor,
      topRole,
      topIndustry,
      funnelData,
      industryChartData,
    };
  }, [data]);

  if (!data || !derived) {
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
        title="Search Insights Dashboard"
        description="Real-time analytics on your job search performance, match quality, and positioning trends."
      />

      {/* Key Metrics Grid */}
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          icon={<Gauge className="h-5 w-5 text-violet-600" />}
          label="Average Match"
          value={`${data.averageMatchScore.toFixed(1)}%`}
          note={derived.matchLabel}
          accent="bg-violet-50 border-violet-100"
          color={derived.matchColor}
        />
        <MetricCard
          icon={<Sparkles className="h-5 w-5 text-sky-600" />}
          label="Pursue Rate"
          value={`${derived.pursueRate}%`}
          note={`${data.totalPursued ?? 0} of ${data.totalAnalyses} roles`}
          accent="bg-sky-50 border-sky-100"
          color="#06b6d4"
        />
        <MetricCard
          icon={<Target className="h-5 w-5 text-emerald-600" />}
          label="Application Rate"
          value={`${derived.applicationRate}%`}
          note={`${data.totalApplied} of ${data.totalAnalyses} analyzed`}
          accent="bg-emerald-50 border-emerald-100"
          color="#10b981"
        />
        <MetricCard
          icon={<FileText className="h-5 w-5 text-amber-600" />}
          label="Resume Coverage"
          value={`${derived.resumeCoverage}%`}
          note={`${data.totalResumesGenerated} tailored resumes`}
          accent="bg-amber-50 border-amber-100"
          color="#f59e0b"
        />
      </section>

      {/* Funnel & Industries */}
      <section className="grid gap-6 lg:grid-cols-2">
        <PageSection
          title="Application Funnel"
          description="Track your progression from discovery to application."
        >
          <div className="flex items-center justify-center h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={derived.funnelData}
                layout="vertical"
                margin={{ top: 5, right: 30, left: 120, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis type="number" stroke="#64748b" />
                <YAxis dataKey="name" type="category" stroke="#64748b" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1e293b",
                    border: "1px solid #475569",
                    borderRadius: "8px",
                    color: "#f1f5f9",
                  }}
                />
                <Bar dataKey="value" fill="#8b5cf6" radius={[0, 8, 8, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </PageSection>

        <PageSection
          title="Top Industries"
          description="Click an industry to see more details."
        >
          <div className="flex items-center justify-center h-80">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={derived.industryChartData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, value }) => `${name} (${value})`}
                  outerRadius={120}
                  fill="#8884d8"
                  dataKey="value"
                  onClick={(entry) =>
                    setSelectedDrillDown({
                      type: "industries",
                      data: data.topIndustries,
                      title: "Top Industries",
                    })
                  }
                >
                  {derived.industryChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.fill} />
                  ))}
                </Pie>
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1e293b",
                    border: "1px solid #475569",
                    borderRadius: "8px",
                    color: "#f1f5f9",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </PageSection>
      </section>

      {/* Top Job Titles & Breakdown */}
      <section className="grid gap-6 lg:grid-cols-2">
        <PageSection
          title="Top Job Titles"
          description="Click to explore detailed metrics for each role."
        >
          {data.topJobTitles.length === 0 ? (
            <p className="text-sm text-slate-500">No job titles analyzed yet.</p>
          ) : (
            <div className="space-y-3">
              {data.topJobTitles.slice(0, 8).map((item, index) => (
                <div
                  key={item.title}
                  onClick={() =>
                    setSelectedDrillDown({
                      type: "titles",
                      data: data.topJobTitles,
                      title: "Top Job Titles",
                    })
                  }
                  className="group cursor-pointer rounded-lg border border-slate-200 bg-white p-4 transition hover:bg-slate-50 hover:border-slate-300"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/20 text-sm font-semibold text-primary">
                        {index + 1}
                      </span>
                      <span className="font-medium text-slate-900">{item.title}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-700">×{item.count}</span>
                      <ChevronRight className="h-4 w-4 text-slate-400 transition group-hover:text-slate-600" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </PageSection>

        <PageSection
          title="Performance Metrics"
          description="Key rates and conversions across your search."
        >
          <div className="space-y-4">
            <RateBar
              label="Pursue Rate"
              value={derived.pursueRate}
              count={data.totalPursued ?? 0}
              color="bg-sky-500"
              total={data.totalAnalyses}
            />
            <RateBar
              label="Resume Coverage"
              value={derived.resumeCoverage}
              count={data.totalResumesGenerated}
              color="bg-violet-500"
              total={data.totalAnalyses}
            />
            <RateBar
              label="Application Rate"
              value={derived.applicationRate}
              count={data.totalApplied}
              color="bg-emerald-500"
              total={data.totalAnalyses}
            />
            <RateBar
              label="Pursue → Apply"
              value={derived.pursueToApplyRate}
              count={data.totalApplied}
              color="bg-orange-500"
              total={data.totalPursued ?? 1}
            />
            <RateBar
              label="Average Match"
              value={data.averageMatchScore}
              count={null}
              color={`${derived.matchColor}`}
              total={100}
            />
            {derived.analysisGap > 0 && (
              <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm font-medium text-amber-900">
                  ⚠️ {derived.analysisGap} role{derived.analysisGap === 1 ? "" : "s"} awaiting action
                </p>
                <p className="mt-1 text-xs text-amber-700">
                  Review these analyzed roles and mark them as applied or archived.
                </p>
              </div>
            )}
          </div>
        </PageSection>
      </section>

      {/* Keyword Insights */}
      <section className="grid gap-6 lg:grid-cols-2">
        <KeywordSection
          title="Top JD Keywords"
          subtitle="Terms most common in the roles you analyze."
          icon={<Briefcase className="h-4 w-4 text-primary" />}
          items={data.topJdKeywords}
          emptyLabel="Analyze a few more jobs to surface hiring language patterns."
          toneClass="bg-primary/10 text-primary"
          onExplore={() =>
            setSelectedDrillDown({
              type: "keywords",
              data: data.topJdKeywords,
              title: "Top JD Keywords",
            })
          }
        />

        <KeywordSection
          title="Top Resume Keywords"
          subtitle="Terms reinforced through your tailored resume output."
          icon={<TrendingUp className="h-4 w-4 text-sky-600" />}
          items={data.topResumeKeywords}
          emptyLabel="Generate tailored resumes to see which strengths are showing up most often."
          toneClass="bg-sky-100 text-sky-700"
          onExplore={() =>
            setSelectedDrillDown({
              type: "keywords",
              data: data.topResumeKeywords,
              title: "Top Resume Keywords",
            })
          }
        />
      </section>

      {/* Footer with timestamp */}
      <div className="rounded-lg border border-slate-200 bg-gradient-to-r from-slate-50 to-white p-4 flex items-center justify-between">
        <div className="text-sm text-slate-600">
          📊 Last updated: <span className="font-mono font-medium">{data.updatedAt?.slice(0, 16).replace("T", " ")} UTC</span>
        </div>
        <div className="text-xs text-slate-500">
          Auto-refresh every 30 seconds
        </div>
      </div>

      {/* Drill-down Modal */}
      {selectedDrillDown.type && (
        <DrillDownModal
          type={selectedDrillDown.type}
          data={selectedDrillDown.data}
          title={selectedDrillDown.title}
          onClose={() => setSelectedDrillDown({ type: null })}
        />
      )}
    </div>
  );
}

function generateColor(seed: string): string {
  const colors = [
    "#8b5cf6",
    "#ec4899",
    "#f59e0b",
    "#10b981",
    "#06b6d4",
    "#0ea5e9",
    "#6366f1",
    "#14b8a6",
  ];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  return colors[Math.abs(hash % colors.length)];
}

function MetricCard({
  icon,
  label,
  value,
  note,
  accent,
  color,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  note: string;
  accent: string;
  color?: string;
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

function RateBar({
  label,
  value,
  count,
  color,
  total,
}: {
  label: string;
  value: number;
  count: number | null;
  color: string;
  total?: number;
}) {
  const displayValue = total ? Math.round((value / total) * 100) : Math.round(value);
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between text-sm">
        <span className="text-slate-600">{label}</span>
        <span className="font-semibold text-slate-900">
          {displayValue}%{count !== null ? <span className="ml-1.5 font-normal text-slate-400">({count})</span> : null}
        </span>
      </div>
      <div className="h-2 rounded-full bg-slate-100">
        <div
          className="h-2 rounded-full transition-all"
          style={{
            width: `${Math.max(4, Math.min(displayValue, 100))}%`,
            backgroundColor: color,
          }}
        />
      </div>
    </div>
  );
}

function DrillDownModal({
  type,
  data,
  title,
  onClose,
}: {
  type: "keywords" | "titles" | "industries";
  data?: any[];
  title?: string;
  onClose: () => void;
}) {
  if (!data || data.length === 0) return null;

  const displayData = data.slice(0, 50);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl max-h-[80vh] rounded-2xl bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="sticky top-0 border-b border-slate-200 bg-white px-6 py-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-slate-100 rounded-lg transition"
          >
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        {/* Content */}
        <div className="overflow-y-auto">
          <div className="p-6 space-y-2">
            {displayData.map((item, index) => {
              const label =
                type === "keywords"
                  ? item.keyword
                  : type === "titles"
                    ? item.title
                    : item.industry;
              const count = item.count;

              return (
                <div
                  key={`${label}-${index}`}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 transition group"
                >
                  <div className="flex items-center gap-3 flex-1">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-slate-600 group-hover:bg-slate-200">
                      {index + 1}
                    </span>
                    <span className="text-sm font-medium text-slate-900 flex-1">{label}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="w-20 h-2 rounded-full bg-slate-100 overflow-hidden">
                      <div
                        className="h-full bg-primary"
                        style={{
                          width: `${Math.max(5, (count / displayData[0].count) * 100)}%`,
                        }}
                      />
                    </div>
                    <span className="text-sm font-semibold text-slate-600 w-10 text-right">
                      ×{count}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        {data.length > 50 && (
          <div className="border-t border-slate-200 bg-slate-50 px-6 py-3 text-xs text-slate-500 text-center">
            Showing {displayData.length} of {data.length} items
          </div>
        )}
      </div>
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
  onExplore,
}: {
  title: string;
  subtitle: string;
  icon: ReactNode;
  items: Array<{ keyword: string; count: number }>;
  emptyLabel: string;
  toneClass: string;
  onExplore?: () => void;
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
      <div className="flex items-center justify-between gap-2 text-slate-900">
        <div className="flex items-center gap-2">
          {icon}
          <h2 className="text-base font-semibold">{title}</h2>
        </div>
        {items.length > 0 && onExplore && (
          <button
            onClick={onExplore}
            className="text-xs font-medium text-slate-500 hover:text-slate-700 transition"
          >
            Explore →
          </button>
        )}
      </div>
      <p className="mt-0.5 text-sm text-slate-500">{subtitle}</p>

      {items.length === 0 ? (
        <p className="mt-5 text-sm leading-6 text-slate-500">{emptyLabel}</p>
      ) : (
        <div className="mt-5 flex flex-wrap gap-2">
          {items.slice(0, 16).map((item) => (
            <span
              key={`${title}-${item.keyword}`}
              className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-medium cursor-pointer transition hover:opacity-80 ${toneClass}`}
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
