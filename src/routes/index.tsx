import { Link, createFileRoute } from "@tanstack/react-router";
import {
  Briefcase,
  Search,
  BarChart3,
  FileUser,
  ArrowRight,
  Sparkles,
  Zap,
  Target,
  FileText,
  ShieldCheck,
  TrendingUp,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  Building2,
  DollarSign,
  Globe,
  Download,
  Mail,
  Wand2,
} from "lucide-react";

export const Route = createFileRoute("/")({
  component: JobsHome,
});

// ── Inline UI mockups — match actual component designs ────────────────────────

// Mirrors ScoreBadge from score-badge.tsx
function MockScoreBadge({ score, label, size = "md" }: { score: number; label?: string; size?: "sm" | "md" | "lg" }) {
  const border = score >= 80 ? "border-emerald-400" : score >= 60 ? "border-amber-400" : "border-red-400";
  const text   = score >= 80 ? "text-emerald-700"  : score >= 60 ? "text-amber-700"  : "text-red-700";
  const def    = score >= 80 ? "Strong" : score >= 60 ? "Moderate" : "Weak";
  const circleSize = size === "sm" ? "h-10 w-10" : size === "lg" ? "h-16 w-16" : "h-12 w-12";
  const numSize    = size === "sm" ? "text-sm"   : size === "lg" ? "text-xl"   : "text-base";
  const subSize    = size === "sm" ? "text-[9px]" : size === "lg" ? "text-[11px]" : "text-[10px]";
  const borderW    = size === "lg" ? "border-4"  : "border-[3px]";
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`flex items-center justify-center rounded-full bg-white shadow-sm ${circleSize} ${borderW} ${border}`}>
        <span className={`font-bold leading-none tabular-nums ${numSize} ${text}`}>{score}</span>
      </div>
      <span className={`font-medium text-slate-500 leading-tight ${subSize}`}>{label ?? def}</span>
    </div>
  );
}

// Mirrors ScoreMiniRow from score-badge.tsx
function MockScoreMiniRow({ label, score }: { label: string; score: number }) {
  const barColor = score >= 80 ? "bg-emerald-400" : score >= 60 ? "bg-amber-400" : "bg-red-400";
  const text     = score >= 80 ? "text-emerald-700" : score >= 60 ? "text-amber-700" : "text-red-700";
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1.5 w-14 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${score}%` }} />
      </div>
      <span className={`text-[9px] font-semibold tabular-nums ${text}`}>{label} {score}</span>
    </div>
  );
}

// Mirrors actual JobCard layout
function MockJobCard() {
  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{
        background: "rgba(255,255,255,0.9)",
        border: "1px solid rgba(226,232,240,0.8)",
        boxShadow: "0 4px 16px rgba(15,23,42,0.06)",
      }}
    >
      <div className="p-5 space-y-3">
        {/* Top row */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wide"
              style={{ background: "rgba(220,38,38,0.08)", color: "#b91c1c", border: "1px solid rgba(220,38,38,0.15)" }}>
              Engineering
            </span>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium"
              style={{ background: "rgba(248,250,252,0.9)", color: "#94a3b8", border: "1px solid rgba(226,232,240,0.6)" }}>
              <Globe size={9} /> Greenhouse
            </span>
          </div>
          {/* Circular score badge top-right */}
          <div className="flex items-center gap-1.5">
            <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-emerald-400 to-emerald-600 text-white text-xs font-bold shadow-sm">
              87
            </div>
          </div>
        </div>
        {/* Title + company */}
        <div>
          <h3 className="text-base font-bold text-slate-900 leading-snug">Senior Product Manager</h3>
          <div className="flex items-center gap-1.5 text-slate-500 mt-1 text-sm font-medium">
            <Building2 size={13} className="text-slate-400" />
            Acme Technologies
          </div>
        </div>
        {/* Description */}
        <p className="text-slate-400 text-xs leading-relaxed line-clamp-2">
          Drive product strategy and roadmap for our core B2B SaaS platform. Work cross-functionally with engineering, design, and GTM…
        </p>
        {/* Meta */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400">
          <div className="flex items-center gap-1">
            <DollarSign size={12} className="text-emerald-400" />
            <span className="font-medium text-slate-500">$140k – $180k</span>
          </div>
          <div className="flex items-center gap-1">
            <Clock size={12} className="text-slate-300" />
            <span>2 days ago</span>
          </div>
        </div>
      </div>
      {/* AI strip */}
      <div className="px-5 py-2 flex items-center gap-2 border-t"
        style={{ background: "rgba(217,119,6,0.04)", borderColor: "rgba(217,119,6,0.1)" }}>
        <Sparkles size={10} className="text-amber-500" />
        <span className="text-[10px] text-amber-700 font-semibold flex-1">AI Score: 87 · Resume match analysis available</span>
        <TrendingUp size={10} className="text-amber-500" />
      </div>
      {/* Footer buttons */}
      <div className="px-4 py-2.5 flex items-center justify-end gap-1.5 border-t"
        style={{ background: "rgba(248,250,252,0.7)", borderColor: "rgba(226,232,240,0.7)" }}>
        <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-lg"
          style={{ background: "rgba(16,185,129,0.08)", color: "#059669", border: "1px solid rgba(16,185,129,0.2)" }}>
          <FileText size={11} /> Tailor
        </span>
        <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-semibold rounded-lg"
          style={{ background: "rgba(217,119,6,0.08)", color: "#d97706", border: "1px solid rgba(217,119,6,0.2)" }}>
          <Sparkles size={11} className="text-amber-500" /> AI Analysis
        </span>
        <span className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold rounded-lg text-white"
          style={{ background: "linear-gradient(135deg,#334155 0%,#1e293b 100%)" }}>
          Apply
        </span>
      </div>
    </div>
  );
}

// Mirrors AnalysisResult — hero card + gap rows + score badges
function MockScoreCard() {
  return (
    <div className="space-y-3">
      {/* Hero card — emerald/pursue */}
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">AI Analysis</p>
            <h2 className="text-base font-bold text-slate-900">Senior Product Manager</h2>
            <p className="text-sm text-slate-500 mt-0.5">Acme Technologies · SaaS · Remote</p>
          </div>
          <MockScoreBadge score={82} label="Match" size="lg" />
        </div>
        <div className="flex items-center gap-2 mt-4 pt-3 border-t border-emerald-200">
          <div className="flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 bg-opacity-20">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" />
          </div>
          <span className="text-sm font-bold uppercase tracking-wide text-emerald-700">Pursue</span>
          <span className="text-sm text-slate-500 ml-1">· Strong ATS alignment with transferable PM skills</span>
        </div>
      </div>
      {/* Gap analysis section */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-slate-100 bg-slate-50/60">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-white border border-slate-200 shadow-sm">
            <Target className="h-3.5 w-3.5 text-violet-600" />
          </div>
          <div>
            <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400 leading-none mb-0.5">Gap Analysis</p>
            <p className="text-sm font-semibold text-slate-900 leading-tight">Requirements Analysis</p>
          </div>
        </div>
        <div className="px-5 py-4 space-y-3">
          {/* Progress bar */}
          <div className="space-y-1.5">
            <div className="flex h-2 w-full rounded-full overflow-hidden bg-slate-100 gap-px">
              <div className="bg-emerald-400" style={{ width: "50%" }} />
              <div className="bg-amber-400" style={{ width: "25%" }} />
              <div className="bg-red-400" style={{ width: "25%" }} />
            </div>
            <div className="flex items-center gap-3 text-[10px] font-medium">
              <span className="flex items-center gap-1 text-emerald-600"><span className="h-1.5 w-1.5 rounded-full bg-emerald-400 inline-block" />2 matched</span>
              <span className="flex items-center gap-1 text-amber-600"><span className="h-1.5 w-1.5 rounded-full bg-amber-400 inline-block" />1 partial</span>
              <span className="flex items-center gap-1 text-red-500"><span className="h-1.5 w-1.5 rounded-full bg-red-400 inline-block" />1 gap</span>
            </div>
          </div>
          {/* Gap rows */}
          <div className="space-y-2">
            <div className="flex items-start gap-2.5 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-emerald-500" />
              <span className="text-sm font-medium text-slate-900">Product roadmapping &amp; strategy</span>
            </div>
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-100 bg-amber-50/60 p-3">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-500" />
              <div>
                <span className="text-sm font-medium text-slate-900">SQL / data analysis</span>
                <p className="text-xs text-slate-500 mt-0.5">Basic SQL present; analytical depth could be stronger</p>
              </div>
            </div>
            <div className="flex items-start gap-2.5 rounded-xl border border-red-100 bg-red-50/60 p-3">
              <XCircle className="h-4 w-4 shrink-0 mt-0.5 text-red-500" />
              <div className="flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-medium text-slate-900">Enterprise B2B sales cycle</span>
                  <span className="rounded-md bg-red-100 border border-red-200 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-red-700">Required</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// Mirrors DocumentActions — tailoring card + doc panels
function MockResumeCard() {
  return (
    <div className="space-y-3">
      {/* Section header */}
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-50 border border-amber-100">
          <Wand2 className="h-3.5 w-3.5 text-amber-600" />
        </div>
        <span className="text-sm font-semibold text-slate-800">Generate Documents</span>
      </div>
      {/* Tailoring guidance card */}
      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-100 bg-slate-50/60">
          <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">Extra Tailoring Guidance</span>
          <span className="text-[10px] text-slate-400 font-medium">(optional)</span>
        </div>
        <div className="px-4 py-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-400 italic">
            e.g. emphasize healthcare domain experience and vendor management…
          </div>
          <p className="text-xs text-slate-400 mt-2">Applied to both resume and cover letter generation.</p>
        </div>
      </div>
      {/* Doc panels */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-100 bg-slate-50/60">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg border bg-emerald-50 border-emerald-100">
              <FileText className="h-4 w-4 text-emerald-600" />
            </div>
            <span className="text-sm font-semibold text-emerald-700">ATS Resume</span>
            <span className="ml-auto text-[10px] font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">Ready</span>
          </div>
          <div className="px-4 py-3 flex gap-2">
            <span className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md bg-primary-600 px-3 py-1.5 text-xs font-semibold text-white">
              <Download className="h-3 w-3" /> Download
            </span>
            <span className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 text-slate-400 text-xs">↺</span>
          </div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
          <div className="flex items-center gap-2.5 px-4 py-3 border-b border-slate-100 bg-slate-50/60">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg border bg-sky-50 border-sky-100">
              <Mail className="h-4 w-4 text-sky-600" />
            </div>
            <span className="text-sm font-semibold text-sky-700">Cover Letter</span>
          </div>
          <div className="px-4 py-3">
            <span className="w-full inline-flex items-center justify-center gap-1.5 rounded-md bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">
              <Mail className="h-3 w-3" /> Create Cover Letter
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// Mirrors the Unicorn alert styling in AnalysisResult (amber panels)
function MockUnicornCard() {
  return (
    <div className="space-y-3">
      {/* Hero card in amber/consider verdict style */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">AI Analysis</p>
            <h2 className="text-base font-bold text-slate-900">Chief of Staff</h2>
            <p className="text-sm text-slate-500 mt-0.5">Horizon Ventures · Venture Capital</p>
          </div>
          <MockScoreBadge score={94} label="Match" size="lg" />
        </div>
        <div className="flex items-center gap-2 mt-4 pt-3 border-t border-amber-200">
          <Sparkles className="h-4 w-4 text-amber-500" />
          <span className="text-sm font-bold uppercase tracking-wide text-amber-700">Unicorn Match</span>
          <span className="text-sm text-slate-500 ml-1">· Non-obvious transferable fit detected</span>
        </div>
      </div>
      {/* Why this role panel */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 space-y-1.5">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 border border-amber-200">
            <Sparkles className="h-3.5 w-3.5 text-amber-600" />
          </div>
          <p className="text-sm font-semibold text-amber-900">Why This Role</p>
        </div>
        <p className="text-sm text-amber-800 leading-relaxed">
          Your PM background and cross-functional leadership make you a non-obvious but strong fit. 87% of applicants won't see this connection.
        </p>
      </div>
      {/* Career impact panel */}
      <div className="rounded-2xl border border-violet-200 bg-violet-50 p-5 space-y-2">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100 border border-violet-200">
            <TrendingUp className="h-3.5 w-3.5 text-violet-600" />
          </div>
          <p className="text-sm font-semibold text-violet-900">Career Impact</p>
        </div>
        <p className="text-sm text-violet-800">Accelerates path to executive leadership; leverages existing stakeholder management and strategy skills.</p>
        <div className="mt-2 pt-2 border-t border-violet-200 flex items-center gap-3">
          <DollarSign className="h-4 w-4 text-violet-500 shrink-0" />
          <div>
            <span className="text-sm font-bold text-violet-900">$180k – $240k</span>
            <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-violet-500">Projected</span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Feature section ───────────────────────────────────────────────────────────

interface FeatureProps {
  eyebrow: string;
  title: string;
  description: string;
  bullets: string[];
  mockup: React.ReactNode;
  reverse?: boolean;
  accent: string;
}

function FeatureSection({ eyebrow, title, description, bullets, mockup, reverse, accent }: FeatureProps) {
  return (
    <div className={`flex flex-col gap-8 lg:flex-row lg:items-center ${reverse ? "lg:flex-row-reverse" : ""}`}>
      <div className="flex-1 space-y-4">
        <span className={`inline-block rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-widest ${accent}`}>
          {eyebrow}
        </span>
        <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">{title}</h2>
        <p className="text-slate-500 leading-relaxed">{description}</p>
        <ul className="space-y-2">
          {bullets.map((b) => (
            <li key={b} className="flex items-start gap-2.5 text-sm text-slate-700">
              <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-emerald-500" />
              {b}
            </li>
          ))}
        </ul>
      </div>
      <div className="flex-1 min-w-0">
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-inner">
          {mockup}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

function JobsHome() {
  return (
    <div className="overflow-x-hidden">

      {/* ── Hero ── */}
      <section className="relative mx-auto max-w-5xl px-4 pt-16 pb-12 text-center">
        <div className="absolute inset-0 -z-10 pointer-events-none"
          style={{
            background: "radial-gradient(ellipse 70% 50% at 50% 0%, rgba(99,102,241,0.08) 0%, transparent 70%)",
          }}
        />
        <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-amber-700 mb-6">
          <Sparkles className="h-3 w-3 text-amber-500" />
          High-Caliber Job Search Curation
        </div>
        <h1 className="text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl mb-5">
          Stop searching.<br />
          <span className="text-amber-600">Surface only high-caliber roles.</span>
        </h1>
        <p className="mx-auto max-w-2xl text-lg text-slate-500 mb-8">
          Caliber deploys high-precision search agents that filter out generic listings, matching only top-tier remote roles against your experience and standards.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/linkedin-hub"
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-6 py-3 text-sm font-semibold text-white hover:text-amber-400 border border-slate-700 shadow-sm transition hover:bg-slate-800"
          >
            <Zap className="h-4 w-4 text-amber-400" />
            Launch Search Agents
          </Link>
          <Link
            to="/analyze"
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 hover:border-slate-300"
          >
            <Briefcase className="h-4 w-4" />
            Analyze a Job Listing
          </Link>
        </div>

        {/* Social proof strip */}
        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-2 text-xs text-slate-400">
          {[
            "Automated multi-source search agents",
            "Custom run frequencies (up to hourly)",
            "AI resume match scoring & gap analysis",
            "Unicorn transferable skill detection",
            "Powered by advanced AI models",
          ].map((s) => (
            <span key={s} className="flex items-center gap-1.5">
              <CheckCircle2 size={11} className="text-emerald-400" />
              {s}
            </span>
          ))}
        </div>
      </section>

      {/* ── Feature 1: AI Analysis Report ── */}
      <section className="mx-auto max-w-5xl px-4 py-14">
        <FeatureSection
          eyebrow="AI Analysis Report"
          accent="border-amber-100 bg-amber-50 text-amber-700"
          title="Know exactly where you stand before you apply."
          description="Every matched job gets a comprehensive AI analysis report — including match score, pursue/consider/pass verdict, key requirement gaps, and strategic application notes."
          bullets={[
            "Overall match score with clear pursue/consider/pass verdicts",
            "Requirement-by-requirement gaps mapped directly to your history",
            "Career trajectory and salary impact assessments",
            "Culture indicators, red flags, and remote flexibility analysis",
          ]}
          mockup={<MockScoreCard />}
        />
      </section>

      {/* ── Feature 2: Unified Search Agents ── */}
      <section className="mx-auto max-w-5xl px-4 py-14 border-t border-slate-100">
        <FeatureSection
          reverse
          eyebrow="Automated Agents"
          accent="border-slate-200 bg-slate-50 text-slate-700"
          title="Find remote jobs from multiple sources on auto-pilot."
          description="Create custom search agents targeting LinkedIn along with public ATS job boards like Greenhouse, Lever, and Workable. Your agents sync matches and alert you on the intervals you configure."
          bullets={[
            "Consolidated results from LinkedIn and major public ATS sources",
            "Customizable search agent run intervals (hourly, daily, etc.)",
            "Unified status tracking pipeline (Analyzed, Prepped, Applied, Interviewed)",
            "Automatic 30-day database pruning of expired listings",
          ]}
          mockup={<MockJobCard />}
        />
      </section>

      {/* ── Feature 3: Document Generation ── */}
      <section className="mx-auto max-w-5xl px-4 py-14 border-t border-slate-100">
        <FeatureSection
          eyebrow="Document Generation"
          accent="border-emerald-100 bg-emerald-50 text-emerald-700"
          title="ATS resume and cover letter. One click each."
          description="After your analysis, generate a fully tailored ATS resume and a personalized cover letter from the same screen. Add optional guidance to steer the output, then download as PDF — ready to submit."
          bullets={[
            "ATS resume selects and reframes your real achievements in the JD's exact language",
            "Cover letter maps three of your strongest achievements to the role's pain points",
            "Optional tailoring guidance field shapes both documents before generation",
            "Zero-hallucination guarantee — every word sourced from your uploaded resume",
            "Regenerate as many versions as you need, each one a different angle on the same role",
          ]}
          mockup={<MockResumeCard />}
        />
      </section>

      {/* ── Feature 4: Unicorn Detection ── */}
      <section className="mx-auto max-w-5xl px-4 py-14 border-t border-slate-100">
        <FeatureSection
          reverse
          eyebrow="Unicorn Detection"
          accent="border-amber-100 bg-amber-50 text-amber-700"
          title="Find the jobs you'd never think to apply for."
          description="When the AI detects that your transferable skills make you an unusually strong fit for a role — even one that looks like a title mismatch — it flags it as a Unicorn and explains the connection in plain language."
          bullets={[
            "Surfaces non-obvious fit based on skills, not just title and keywords",
            "\"Why This Role\" panel explains the transferable skill connection clearly",
            "Career Impact panel shows trajectory acceleration and projected salary uplift",
            "Example: a Technical PM flagged as a Unicorn for Chief of Staff or Implementation Lead",
          ]}
          mockup={<MockUnicornCard />}
        />
      </section>

      {/* ── AI Features Grid ── */}
      <section className="mx-auto max-w-5xl px-4 py-14 border-t border-slate-100">
        <div className="text-center mb-10">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Everything included</p>
          <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">The full toolkit</h2>
          <p className="mt-3 text-slate-500 max-w-xl mx-auto">
            Every feature runs on advanced AI models — strictly grounded in your actual resume data, never hallucinated.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[
            {
              icon: <Target className="h-5 w-5 text-violet-600" />,
              bg: "bg-violet-50 border-violet-100",
              title: "Job Analysis",
              body: "Match score, pursue/consider/pass verdict, gap analysis, culture signals, red flags, salary estimate, seniority level — one complete report per job.",
            },
            {
              icon: <FileText className="h-5 w-5 text-emerald-600" />,
              bg: "bg-emerald-50 border-emerald-100",
              title: "ATS Resume",
              body: "Tailored resume that selects the right achievements from your history and rewrites them in the job description's exact language. Exports as PDF.",
            },
            {
              icon: <FileUser className="h-5 w-5 text-sky-600" />,
              bg: "bg-sky-50 border-sky-100",
              title: "Cover Letter",
              body: "Personalized letter that maps three of your real achievements to the role's pain points. Grounded in your resume — never generic filler.",
            },
            {
              icon: <Sparkles className="h-5 w-5 text-amber-600" />,
              bg: "bg-amber-50 border-amber-100",
              title: "Unicorn Detection",
              body: "Flags roles where your transferable skills create non-obvious fit. Explains the connection and projects the career impact of making the leap.",
            },
            {
              icon: <TrendingUp className="h-5 w-5 text-violet-600" />,
              bg: "bg-violet-50 border-violet-100",
              title: "Career Impact",
              body: "Every analysis includes a trajectory assessment — does this role advance your career, hold it steady, or pull it sideways? Salary projection included.",
            },
            {
              icon: <Search className="h-5 w-5 text-slate-600" />,
              bg: "bg-slate-50 border-slate-100",
              title: "Gap Analysis",
              body: "Every requirement in the job description is checked against your resume — covered, partial, or missing — so you know exactly what to address in your application.",
            },
            {
              icon: <BarChart3 className="h-5 w-5 text-slate-600" />,
              bg: "bg-slate-50 border-slate-100",
              title: "Analysis History",
              body: "Every job you analyze is saved with its full report, documents, and applied status. Review, regenerate, or download at any time.",
            },
            {
              icon: <ShieldCheck className="h-5 w-5 text-teal-600" />,
              bg: "bg-teal-50 border-teal-100",
              title: "Zero Hallucination",
              body: "Document generation is strictly grounded in your uploaded resume. The AI selects and reframes your real experience — it never invents anything.",
            },
            {
              icon: <Zap className="h-5 w-5 text-orange-600" />,
              bg: "bg-orange-50 border-orange-100",
              title: "Tailoring Guidance",
              body: "Before generating documents, add optional instructions — emphasize a domain, adjust tone, or highlight a specific skill set — applied to both resume and cover letter.",
            },
          ].map((f) => (
            <div key={f.title} className="rounded-2xl border p-5 space-y-2.5 bg-white">
              <div className={`inline-flex h-9 w-9 items-center justify-center rounded-xl border ${f.bg}`}>
                {f.icon}
              </div>
              <p className="text-sm font-semibold text-slate-900">{f.title}</p>
              <p className="text-xs text-slate-500 leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── How it works ── */}
      <section className="mx-auto max-w-5xl px-4 py-14 border-t border-slate-100">
        <div className="text-center mb-10">
          <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Workflow</p>
          <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl">From search agent to application in minutes</h2>
        </div>
        <div className="relative">
          {/* connector line */}
          <div className="absolute left-5 top-8 bottom-8 w-px bg-slate-200 hidden sm:block" />
          <div className="space-y-6">
            {[
              {
                step: "01",
                icon: <FileUser size={16} className="text-indigo-600" />,
                title: "Upload your master resume",
                body: "Add your resume once on your profile page — paste the text or upload a PDF. Caliber extracts every role, skill, achievement, and certification as your AI source of truth.",
                to: "/profile",
                cta: "Set up profile",
              },
              {
                step: "02",
                icon: <Search size={16} className="text-violet-600" />,
                title: "Configure your Search Agents",
                body: "Set up automated agents with keywords, target locations, specific sources (LinkedIn, Greenhouse, Lever), and custom check intervals (e.g. hourly, daily).",
                to: "/linkedin-hub",
                cta: "Configure Agents",
              },
              {
                step: "03",
                icon: <Target size={16} className="text-emerald-600" />,
                title: "Review matching jobs",
                body: "Watch matches flow into your dashboard. See AI scores, requirement gaps, verdicts, and transferable skill highlights computed automatically.",
                to: "/linkedin-hub",
                cta: "View Dashboard",
              },
              {
                step: "04",
                icon: <Zap size={16} className="text-amber-600" />,
                title: "Generate documents & apply",
                body: "Generate a custom tailored ATS resume and cover letter with one click from any job card, then download the PDFs and submit your application.",
                to: "/history",
                cta: "View History",
              },
            ].map((s) => (
              <div key={s.step} className="relative flex gap-5 sm:pl-14">
                <div className="relative z-10 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm sm:absolute sm:left-0">
                  {s.icon}
                </div>
                <div className="flex-1 rounded-2xl border border-slate-200 bg-white p-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Step {s.step}</p>
                      <p className="text-sm font-semibold text-slate-900">{s.title}</p>
                      <p className="text-sm text-slate-500 leading-relaxed">{s.body}</p>
                    </div>
                    <Link
                      to={s.to}
                      className="shrink-0 inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-100 whitespace-nowrap"
                    >
                      {s.cta} <ArrowRight size={11} />
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── CTA ── */}
      <section className="mx-auto max-w-5xl px-4 py-14">
        <div
          className="relative overflow-hidden rounded-3xl p-10 text-center"
          style={{
            background: "linear-gradient(135deg, rgba(217,119,6,0.06) 0%, rgba(30,41,59,0.04) 40%, rgba(217,119,6,0.02) 100%)",
            border: "1px solid rgba(217,119,6,0.15)",
          }}
        >
          <div className="absolute inset-0 -z-10 pointer-events-none"
            style={{
              background: "radial-gradient(ellipse 60% 80% at 50% 120%, rgba(217,119,6,0.04) 0%, transparent 60%)",
            }}
          />
          <Sparkles className="mx-auto mb-4 h-8 w-8 text-amber-500" />
          <h2 className="text-2xl font-bold text-slate-900 sm:text-3xl mb-3">
            Deploy your job search agents
          </h2>
          <p className="text-slate-500 mb-6 max-w-md mx-auto">
            Set up your custom search agents, let them scan the web, and get notified about matching remote tech roles matched directly to your achievements.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/linkedin-hub"
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 border border-slate-700 text-white hover:text-amber-400 px-6 py-3 text-sm font-semibold shadow-sm transition hover:bg-slate-800"
            >
              <Zap className="h-4 w-4 text-amber-400" />
              Configure your agents
            </Link>
            <Link
              to="/profile"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
            >
              <FileUser className="h-4 w-4" />
              Set up my profile
            </Link>
          </div>
        </div>
      </section>

    </div>
  );
}
