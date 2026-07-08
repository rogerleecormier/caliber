import { useState } from "react";
import { ScoreBadge } from "./score-badge";
import { DocumentActions } from "./document-actions";
import {
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Lightbulb,
  Tag,
  TrendingUp,
  Shield,
  Target,
  DollarSign,
  Sparkles,
  MapPin,
  BarChart3,
  ChevronDown,
  ChevronUp,
} from "lucide-react";


interface GapItem {
  requirement?: string;
  area?: string;
  status?: "covered" | "partial" | "missing";
  requirementType?: "required" | "preferred";
  suggestion?: string;
  detail?: string;
}

interface CultureSignal {
  signal: string;
  interpretation: string;
  sentiment: "positive" | "neutral" | "warning";
}

interface RedFlag {
  flag: string;
  reason: string;
}

interface JobInsightsSection {
  workLifeBalance?: "excellent" | "good" | "moderate" | "demanding" | "unknown";
  remoteFlexibility?: "fully_remote" | "hybrid" | "office" | "unknown";
  seniorityLevel?: "entry" | "mid" | "senior" | "lead" | "executive" | "unknown";
  cultureSignals?: CultureSignal[];
  redFlags?: RedFlag[];
}

interface SalaryAssessment {
  listed: string | null;
  projectedRange: string;
  assessment: string;
}

interface CareerAnalysis {
  trajectory: string;
  recommendation: "pursue" | "consider" | "pass";
  reasoning: string;
  salaryAssessment?: SalaryAssessment;
}

interface AnalysisResultProps {
  analysis: {
    id?: number;
    jobTitle: string;
    company: string;
    industry?: string;
    location?: string;
    matchScore: number;
    pursue: boolean;
    pursueJustification: string;
    gapAnalysis: any;
    recommendations: string[];
    keywords: string[];
    strategyNote?: string;
    personalInterest?: string;
    careerAnalysis?: CareerAnalysis | null;
    insights?: JobInsightsSection | null;
    applied?: boolean;
  };
  showDocumentActions?: boolean;
  onDocumentGenerated?: () => void;
}

const verdictMap = {
  pursue:  { Icon: CheckCircle2, label: "Pursue",  bg: "bg-emerald-50 border-emerald-200", accent: "text-emerald-700", bar: "bg-emerald-500" },
  consider:{ Icon: AlertTriangle,label: "Consider", bg: "bg-amber-50 border-amber-200",   accent: "text-amber-700",   bar: "bg-amber-400"  },
  pass:    { Icon: XCircle,       label: "Pass",    bg: "bg-red-50 border-red-200",        accent: "text-red-700",     bar: "bg-red-400"    },
};

const statusMap = {
  covered: { Icon: CheckCircle2, className: "text-emerald-500" },
  partial: { Icon: AlertTriangle, className: "text-amber-500" },
  missing: { Icon: XCircle, className: "text-red-500" },
};

function SectionCard({ icon, title, eyebrow, children }: {
  icon: React.ReactNode;
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
      <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-slate-100 bg-slate-50/60">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white border border-slate-200 shadow-sm">
          {icon}
        </div>
        <div>
          {eyebrow && <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 leading-none mb-0.5">{eyebrow}</p>}
          <p className="text-sm font-semibold text-slate-900 leading-tight">{title}</p>
        </div>
      </div>
      <div className="px-4 py-3">{children}</div>
    </div>
  );
}

function AccordionSectionCard({
  icon,
  title,
  eyebrow,
  children,
  isOpen,
  onToggle,
}: {
  icon: React.ReactNode;
  title: string;
  eyebrow?: string;
  children: React.ReactNode;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={`rounded-2xl border border-slate-200 bg-white overflow-hidden transition-all duration-200 ${isOpen ? "lg:flex-1 lg:min-h-0 lg:flex lg:flex-col" : "shrink-0"}`}>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-slate-50/60 hover:bg-slate-50 transition-colors text-left focus:outline-none shrink-0"
      >
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white border border-slate-200 shadow-sm">
            {icon}
          </div>
          <div>
            {eyebrow && <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 leading-none mb-0.5">{eyebrow}</p>}
            <p className="text-sm font-semibold text-slate-900 leading-tight">{title}</p>
          </div>
        </div>
        <div className="text-slate-400 shrink-0">
          {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>
      {isOpen && (
        <div className="px-5 py-4 bg-white lg:flex-1 lg:min-h-0 lg:overflow-y-auto scroll-smooth jobs-modal-scroll">
          {children}
        </div>
      )}
    </div>
  );
}

export function AnalysisResult({ analysis, showDocumentActions = true, onDocumentGenerated }: AnalysisResultProps) {
  let recRaw = analysis.careerAnalysis?.recommendation;
  if (typeof recRaw === "string") {
    recRaw = recRaw.toLowerCase().trim() as any;
  }
  const rec = (recRaw === "pursue" || recRaw === "consider" || recRaw === "pass")
    ? recRaw
    : (analysis.pursue ? "pursue" : "pass");
  const verdict = verdictMap[rec];
  const VerdictIcon = verdict.Icon;

  let gapArray: GapItem[] = [];
  if (Array.isArray(analysis.gapAnalysis)) {
    gapArray = analysis.gapAnalysis;
  } else if (analysis.gapAnalysis && typeof analysis.gapAnalysis === "object") {
    const matched = (analysis.gapAnalysis.matched || []).map((item: any) => ({ ...item, status: "covered" }));
    const partial = (analysis.gapAnalysis.partial || []).map((item: any) => ({ ...item, status: "partial" }));
    const gap = (analysis.gapAnalysis.gap || []).map((item: any) => ({ ...item, status: "missing" }));
    gapArray = [...matched, ...partial, ...gap];
  }
  const covered = gapArray.filter((g) => g.status === "covered").length;
  const partial  = gapArray.filter((g) => g.status === "partial").length;
  const missing  = gapArray.filter((g) => g.status === "missing").length;
  const total    = gapArray.length;
  const [openSection, setOpenSection] = useState<string | null>("requirements");

  return (
    <div className="flex flex-col gap-6 h-full overflow-y-auto lg:overflow-hidden text-slate-900 scroll-smooth jobs-modal-scroll">
      {/* 2-Column Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 flex-1 min-h-0 lg:overflow-hidden">
        {/* Column 1: Fit & Insights */}
        <div className="flex flex-col gap-4 lg:h-full lg:overflow-y-auto lg:pr-2 lg:pb-6 scroll-smooth jobs-modal-scroll">
          {/* ── Hero card ── */}
          <div className={`rounded-2xl border p-4 ${verdict.bg} shrink-0`}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">AI Analysis</p>
                <h2 className="text-lg font-bold tracking-tight text-slate-900 truncate">{analysis.jobTitle}</h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  {analysis.company}
                  {analysis.industry ? ` · ${analysis.industry}` : ""}
                  {analysis.location ? ` · ${analysis.location}` : ""}
                </p>
              </div>
              <ScoreBadge score={analysis.matchScore} size="lg" label="Match" />
            </div>

            <div className={`flex items-center gap-2 mt-3 pt-2.5 border-t ${verdict.accent === "text-emerald-700" ? "border-emerald-200" : verdict.accent === "text-amber-700" ? "border-amber-200" : "border-red-200"}`}>
              <div className={`flex h-6 w-6 items-center justify-center rounded-full ${verdict.bar} bg-opacity-20`}>
                <VerdictIcon className={`h-3.5 w-3.5 ${verdict.accent}`} />
              </div>
              <span className="text-sm font-bold uppercase tracking-wide text-slate-800">{verdict.label}</span>
              <span className="text-sm text-slate-500 ml-1">· {analysis.pursueJustification}</span>
            </div>
          </div>

          {/* ── Career impact ── */}
          {analysis.careerAnalysis && (
            <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4 space-y-2 shrink-0">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100 border border-violet-200">
                  <TrendingUp className="h-3.5 w-3.5 text-violet-600" />
                </div>
                <p className="text-sm font-semibold text-violet-900">Career Impact</p>
              </div>
              <p className="text-sm text-violet-800">{analysis.careerAnalysis.trajectory}</p>
              {analysis.careerAnalysis.reasoning && (
                <p className="text-xs text-violet-600">{analysis.careerAnalysis.reasoning}</p>
              )}
              {analysis.careerAnalysis.salaryAssessment && (
                <div className="mt-1.5 pt-1.5 border-t border-violet-200 flex items-center gap-3">
                  <DollarSign className="h-4 w-4 text-violet-500 shrink-0" />
                  <div>
                    <span className="text-sm font-bold text-violet-900">
                      {analysis.careerAnalysis.salaryAssessment.listed ?? analysis.careerAnalysis.salaryAssessment.projectedRange}
                    </span>
                    {!analysis.careerAnalysis.salaryAssessment.listed && (
                      <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-violet-500">Projected</span>
                    )}
                    <p className="text-xs text-violet-600 mt-0.5">{analysis.careerAnalysis.salaryAssessment.assessment}</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Why this role ── */}
          {analysis.personalInterest && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 space-y-1.5 shrink-0">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 border border-amber-200">
                  <Sparkles className="h-3.5 w-3.5 text-amber-600" />
                </div>
                <p className="text-sm font-semibold text-amber-900">Why This Role</p>
              </div>
              <p className="text-sm text-amber-800">{analysis.personalInterest}</p>
            </div>
          )}

          {/* ── Role Insights ── */}
          {analysis.insights && (
            <SectionCard icon={<BarChart3 className="h-3.5 w-3.5 text-indigo-600" />} title="Role Insights" eyebrow="Culture & environment">
              <div className="space-y-4">
                {/* Quick facts - detailed layout */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {analysis.insights.workLifeBalance && analysis.insights.workLifeBalance !== "unknown" && (
                    <div className={`rounded-xl border p-3 ${
                      analysis.insights.workLifeBalance === "excellent" || analysis.insights.workLifeBalance === "good"
                        ? "bg-emerald-50 border-emerald-100" : analysis.insights.workLifeBalance === "demanding"
                        ? "bg-red-50 border-red-100" : "bg-amber-50 border-amber-100"
                    }`}>
                      <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">Work-Life Balance</p>
                      <p className={`text-base font-bold capitalize ${
                        analysis.insights.workLifeBalance === "excellent" || analysis.insights.workLifeBalance === "good"
                          ? "text-emerald-800" : analysis.insights.workLifeBalance === "demanding" ? "text-red-800" : "text-amber-800"
                      }`}>{analysis.insights.workLifeBalance.replace(/_/g, " ")}</p>
                    </div>
                  )}
                  {analysis.insights.remoteFlexibility && analysis.insights.remoteFlexibility !== "unknown" && (
                    <div className="rounded-xl border bg-sky-50 border-sky-100 p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <MapPin className="h-4 w-4 text-sky-600" />
                        <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Location / Remote</p>
                      </div>
                      <p className="text-base font-bold text-sky-800">
                        {analysis.insights.remoteFlexibility === "fully_remote" ? "Fully Remote"
                          : analysis.insights.remoteFlexibility === "hybrid" ? "Hybrid" : "On-site"}
                      </p>
                    </div>
                  )}
                  {analysis.insights.seniorityLevel && analysis.insights.seniorityLevel !== "unknown" && (
                    <div className="rounded-xl border bg-violet-50 border-violet-100 p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <TrendingUp className="h-4 w-4 text-violet-600" />
                        <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">Seniority Level</p>
                      </div>
                      <p className="text-base font-bold text-violet-800 capitalize">{analysis.insights.seniorityLevel.replace(/_/g, " ")}</p>
                    </div>
                  )}
                </div>

                {/* Culture signals */}
                {analysis.insights.cultureSignals && analysis.insights.cultureSignals.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Culture Signals</p>
                    {analysis.insights.cultureSignals.map((s, i) => (
                      <div key={i} className={`flex items-start gap-2 rounded-xl border p-2.5 text-xs ${
                        s.sentiment === "positive" ? "bg-emerald-50 border-emerald-100"
                          : s.sentiment === "warning" ? "bg-amber-50 border-amber-100"
                          : "bg-slate-50 border-slate-100"
                      }`}>
                        <span className="shrink-0 mt-px text-sm">
                          {s.sentiment === "positive" ? "✅" : s.sentiment === "warning" ? "⚠️" : "ℹ️"}
                        </span>
                        <div>
                          <p className={`font-semibold ${s.sentiment === "positive" ? "text-emerald-800" : s.sentiment === "warning" ? "text-amber-800" : "text-slate-700"}`}>{s.signal}</p>
                          <p className={`mt-0.5 ${s.sentiment === "positive" ? "text-emerald-600" : s.sentiment === "warning" ? "text-amber-600" : "text-slate-500"}`}>{s.interpretation}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Red flags */}
                {analysis.insights.redFlags && analysis.insights.redFlags.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-red-600 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" /> Red Flags
                    </p>
                    {analysis.insights.redFlags.map((f, i) => (
                      <div key={i} className="flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 p-2.5 text-xs">
                        <span className="shrink-0 mt-px text-sm">🚩</span>
                        <div>
                          <p className="font-semibold text-red-800">{f.flag}</p>
                          <p className="text-red-600 mt-0.5">{f.reason}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </SectionCard>
          )}
        </div>

        {/* Column 2: Requirements & Strategy */}
        <div className="flex flex-col gap-4 lg:h-full lg:pr-2 lg:pb-6 scroll-smooth jobs-modal-scroll overflow-y-auto lg:overflow-y-hidden">
          {/* Requirements Analysis */}
          {gapArray.length > 0 ? (
            <AccordionSectionCard
              icon={<Target className="h-3.5 w-3.5 text-violet-600" />}
              title="Requirements Analysis"
              eyebrow="Gap Analysis"
              isOpen={openSection === "requirements"}
              onToggle={() => setOpenSection(openSection === "requirements" ? null : "requirements")}
            >
              <div>
                {/* progress bar */}
                {total > 0 && (
                  <div className="mb-4 space-y-1.5">
                    <div className="flex h-2 w-full rounded-full overflow-hidden bg-slate-100 gap-px">
                      {covered > 0 && <div className="bg-emerald-400 transition-all" style={{ width: `${(covered/total)*100}%` }} />}
                      {partial  > 0 && <div className="bg-amber-400 transition-all"  style={{ width: `${(partial/total)*100}%`  }} />}
                      {missing  > 0 && <div className="bg-red-400 transition-all"    style={{ width: `${(missing/total)*100}%`  }} />}
                    </div>
                    <div className="flex items-center gap-3 text-[10px] font-medium">
                      <span className="flex items-center gap-1 text-emerald-600"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 inline-block" />{covered} matched</span>
                      <span className="flex items-center gap-1 text-amber-600"><span className="h-1.5 w-1.5 rounded-full bg-amber-400 inline-block" />{partial} partial</span>
                      <span className="flex items-center gap-1 text-red-500"><span className="h-1.5 w-1.5 rounded-full bg-red-400 inline-block" />{missing} gaps</span>
                    </div>
                  </div>
                )}
                {/* Scroll container for gap items */}
                <div className="max-h-[300px] lg:max-h-none overflow-y-auto lg:overflow-visible pr-2 space-y-2.5 scroll-smooth jobs-modal-scroll">
                  {gapArray.map((gap, i) => {
                    const s = statusMap[gap.status as keyof typeof statusMap] ?? statusMap.partial;
                    const StatusIcon = s.Icon;
                    const rowBg = gap.status === "covered" ? "bg-emerald-50/60 border-emerald-100"
                      : gap.status === "missing" ? "bg-red-50/60 border-red-100"
                      : "bg-amber-50/60 border-amber-100";
                    return (
                      <div key={i} className={`flex items-start gap-2.5 rounded-xl border p-3 ${rowBg}`}>
                        <StatusIcon className={`h-4 w-4 shrink-0 mt-0.5 ${s.className}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-sm font-medium text-slate-900">{gap.requirement ?? gap.area}</span>
                            {gap.requirementType === "required" && (
                              <span className="rounded-md bg-red-100 border border-red-200 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-red-700">Required</span>
                            )}
                            {gap.requirementType === "preferred" && (
                              <span className="rounded-md bg-slate-100 border border-slate-200 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-500">Preferred</span>
                            )}
                          </div>
                          {(gap.suggestion ?? gap.detail) && (
                            <p className="text-xs text-slate-500 mt-0.5">{gap.suggestion ?? gap.detail}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </AccordionSectionCard>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-slate-400 text-sm">
              No requirements analysis available.
            </div>
          )}

          {/* ── Strategic positioning ── */}
          {analysis.strategyNote && (
            <AccordionSectionCard
              icon={<Shield className="h-3.5 w-3.5 text-sky-600" />}
              title="Strategic Positioning"
              eyebrow="How to position yourself"
              isOpen={openSection === "strategy"}
              onToggle={() => setOpenSection(openSection === "strategy" ? null : "strategy")}
            >
              <p className="text-sm text-slate-700 leading-relaxed">{analysis.strategyNote}</p>
            </AccordionSectionCard>
          )}

          {/* ── Recommendations ── */}
          {analysis.recommendations && analysis.recommendations.length > 0 && (
            <AccordionSectionCard
              icon={<Lightbulb className="h-3.5 w-3.5 text-amber-500" />}
              title="Recommendations"
              eyebrow="Action items"
              isOpen={openSection === "recommendations"}
              onToggle={() => setOpenSection(openSection === "recommendations" ? null : "recommendations")}
            >
              <ul className="space-y-2">
                {analysis.recommendations.map((rec, i) => (
                  <li key={i} className="flex gap-2.5 text-sm text-slate-700">
                    <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-500" />
                    {rec}
                  </li>
                ))}
              </ul>
            </AccordionSectionCard>
          )}

          {/* ── ATS Keywords ── */}
          {analysis.keywords && analysis.keywords.length > 0 && (
            <AccordionSectionCard
              icon={<Tag className="h-3.5 w-3.5 text-primary-600" />}
              title="ATS Keywords"
              eyebrow="Integrate these in your resume"
              isOpen={openSection === "keywords"}
              onToggle={() => setOpenSection(openSection === "keywords" ? null : "keywords")}
            >
              <div className="flex flex-wrap gap-1.5">
                {analysis.keywords.map((kw, i) => (
                  <span key={i} className="rounded-lg bg-primary-50 border border-primary-100 px-2.5 py-1 text-xs font-mono font-medium text-primary-700">{kw}</span>
                ))}
              </div>
            </AccordionSectionCard>
          )}
        </div>
      </div>

      {/* ── Highlighted Generate Documents at the Bottom ── */}
      {showDocumentActions && analysis.id && (
        <div className="shrink-0 rounded-2xl border border-violet-200 bg-violet-50/50 p-5 shadow-sm">
          <DocumentActions
            analysisId={analysis.id}
            applied={analysis.applied ?? false}
            onDocumentGenerated={onDocumentGenerated}
          />
        </div>
      )}
    </div>
  );
}
