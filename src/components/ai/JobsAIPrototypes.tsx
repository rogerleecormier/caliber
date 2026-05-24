/**
 * Spearyx Jobs — AI Feature Mock Prototype Graphics
 * Visual prototype components for AI-powered job features
 */

import { Sparkles, TrendingUp, FileText, BarChart3, CheckCircle2, XCircle, AlertCircle, Target } from "lucide-react";

/* ──────────────────────────��──────────────────────────────────────
   1. Match Score Ring — circular match % visualizer
───────────────────────────────────────────────────────────────── */
interface MatchScoreRingProps {
  score: number; // 0–100
  size?: number;
  label?: string;
}

export function MatchScoreRing({ score, size = 80, label }: MatchScoreRingProps) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const fill = (score / 100) * circ;
  const color = score >= 80 ? "#10b981" : score >= 60 ? "#f59e0b" : score >= 40 ? "#6366f1" : "#ef4444";

  return (
    <div className="flex flex-col items-center gap-1.5">
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="rgba(226,232,240,0.8)"
          strokeWidth={6}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={6}
          strokeDasharray={`${fill} ${circ - fill}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.8s ease" }}
        />
        <text
          x={size / 2}
          y={size / 2 + 1}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={size < 60 ? 12 : 16}
          fontWeight={700}
          fill={color}
          style={{ transform: `rotate(90deg)`, transformOrigin: `${size / 2}px ${size / 2}px` }}
        >
          {score}
        </text>
      </svg>
      {label && <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">{label}</span>}
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   2. JD-Resume Analysis Card Prototype
───────────────────────────────────────────────────────────────── */
interface AnalysisCardProps {
  overallScore: number;
  dimensions: { label: string; score: number }[];
}

export function JDAnalysisCard({ overallScore, dimensions }: AnalysisCardProps) {
  return (
    <div
      className="rounded-2xl p-5 w-full max-w-sm"
      style={{
        background: "rgba(255,255,255,0.85)",
        backdropFilter: "blur(16px)",
        border: "1px solid rgba(226,232,240,0.8)",
        boxShadow: "0 8px 32px rgba(15,23,42,0.08)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)" }}>
            <Sparkles size={14} className="text-white" />
          </div>
          <span className="text-sm font-bold text-slate-800">AI Analysis</span>
        </div>
        <MatchScoreRing score={overallScore} size={52} />
      </div>

      {/* Dimension bars */}
      <div className="space-y-2.5">
        {dimensions.map(({ label, score }) => {
          const color = score >= 75 ? "#10b981" : score >= 50 ? "#f59e0b" : "#ef4444";
          return (
            <div key={label}>
              <div className="flex justify-between items-center mb-1">
                <span className="text-xs font-medium text-slate-600">{label}</span>
                <span className="text-xs font-bold" style={{ color }}>{score}%</span>
              </div>
              <div className="h-1.5 rounded-full" style={{ background: "rgba(226,232,240,0.6)" }}>
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{ width: `${score}%`, background: `linear-gradient(90deg, ${color}88, ${color})` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   3. Application Tracker Pipeline
───────────────────────────────────────────────────────────────── */
const STAGES = ["Saved", "Applied", "Screening", "Interview", "Offer"] as const;
type Stage = typeof STAGES[number];

interface TrackerItem {
  company: string;
  role: string;
  stage: Stage;
  date: string;
}

interface AppTrackerProps {
  items: TrackerItem[];
}

const stageColors: Record<Stage, { bg: string; text: string; border: string }> = {
  Saved:     { bg: "rgba(245,158,11,0.1)",  text: "#d97706", border: "rgba(245,158,11,0.25)" },
  Applied:   { bg: "rgba(99,102,241,0.1)",  text: "#4f46e5", border: "rgba(99,102,241,0.25)" },
  Screening: { bg: "rgba(14,165,233,0.1)",  text: "#0284c7", border: "rgba(14,165,233,0.25)" },
  Interview: { bg: "rgba(139,92,246,0.1)",  text: "#7c3aed", border: "rgba(139,92,246,0.25)" },
  Offer:     { bg: "rgba(16,185,129,0.1)",  text: "#059669", border: "rgba(16,185,129,0.25)" },
};

export function AppTracker({ items }: AppTrackerProps) {
  return (
    <div
      className="rounded-2xl overflow-hidden w-full max-w-md"
      style={{
        background: "rgba(255,255,255,0.85)",
        backdropFilter: "blur(16px)",
        border: "1px solid rgba(226,232,240,0.8)",
        boxShadow: "0 8px 32px rgba(15,23,42,0.08)",
      }}
    >
      {/* Header */}
      <div className="px-5 py-3.5 flex items-center justify-between" style={{ borderBottom: "1px solid rgba(226,232,240,0.6)", background: "rgba(248,250,252,0.6)" }}>
        <div className="flex items-center gap-2">
          <Target size={14} className="text-primary-600" />
          <span className="text-sm font-bold text-slate-800">Application Tracker</span>
        </div>
        <span className="text-xs font-semibold text-slate-400">{items.length} tracked</span>
      </div>

      {/* Stage pipeline */}
      <div className="px-5 pt-3 pb-2 flex items-center gap-1 overflow-x-auto">
        {STAGES.map((stage) => {
          const count = items.filter((i) => i.stage === stage).length;
          const c = stageColors[stage];
          return (
            <div key={stage} className="flex-1 min-w-0 text-center">
              <div className="text-lg font-bold" style={{ color: c.text }}>{count}</div>
              <div className="text-[9px] font-bold uppercase tracking-wide text-slate-400 truncate">{stage}</div>
            </div>
          );
        })}
      </div>

      {/* Items */}
      <div className="px-4 pb-4 space-y-2">
        {items.map(({ company, role, stage, date }, i) => {
          const c = stageColors[stage];
          return (
            <div
              key={i}
              className="flex items-center justify-between rounded-xl px-3 py-2.5"
              style={{ background: "rgba(248,250,252,0.7)", border: "1px solid rgba(226,232,240,0.6)" }}
            >
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-800 truncate">{company}</div>
                <div className="text-[10px] text-slate-500 truncate">{role}</div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0 ml-2">
                <span className="text-[9px] text-slate-400">{date}</span>
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                  style={{ background: c.bg, color: c.text, border: `1px solid ${c.border}` }}
                >
                  {stage}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   4. Skills Gap Chart Prototype
───────────────────────────────────────────────────────────────── */
interface SkillGap {
  skill: string;
  have: boolean;
  required: boolean;
  level?: "required" | "preferred";
}

interface SkillsGapChartProps {
  skills: SkillGap[];
}

export function SkillsGapChart({ skills }: SkillsGapChartProps) {
  const matched = skills.filter((s) => s.have && s.required).length;
  const total = skills.filter((s) => s.required).length;

  return (
    <div
      className="rounded-2xl p-5 w-full max-w-xs"
      style={{
        background: "rgba(255,255,255,0.85)",
        backdropFilter: "blur(16px)",
        border: "1px solid rgba(226,232,240,0.8)",
        boxShadow: "0 8px 32px rgba(15,23,42,0.08)",
      }}
    >
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 size={14} className="text-violet-500" />
        <span className="text-sm font-bold text-slate-800">Skills Gap</span>
        <span className="ml-auto text-xs font-bold text-emerald-600">{matched}/{total} matched</span>
      </div>

      <div className="space-y-1.5">
        {skills.map(({ skill, have, level }) => (
          <div key={skill} className="flex items-center gap-2">
            {have ? (
              <CheckCircle2 size={13} className="text-emerald-500 flex-shrink-0" />
            ) : level === "preferred" ? (
              <AlertCircle size={13} className="text-amber-400 flex-shrink-0" />
            ) : (
              <XCircle size={13} className="text-slate-300 flex-shrink-0" />
            )}
            <span className={`text-xs ${have ? "text-slate-700 font-medium" : "text-slate-400"}`}>{skill}</span>
            {level === "preferred" && !have && (
              <span className="text-[9px] font-bold text-amber-500 uppercase tracking-wide ml-auto">Optional</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   5. AI Score Trend Sparkline
───────────────────────────────────────────────────────────────── */
interface ScoreTrendProps {
  scores: number[]; // Last N job scores
  width?: number;
  height?: number;
}

export function ScoreTrendSparkline({ scores, width = 120, height = 36 }: ScoreTrendProps) {
  if (scores.length < 2) return null;
  const max = Math.max(...scores);
  const min = Math.min(...scores);
  const range = max - min || 1;
  const padY = 4;

  const points = scores.map((s, i) => {
    const x = (i / (scores.length - 1)) * width;
    const y = padY + ((max - s) / range) * (height - padY * 2);
    return `${x},${y}`;
  }).join(" ");

  const lastScore = scores[scores.length - 1];
  const prevScore = scores[scores.length - 2];
  const up = lastScore >= prevScore;
  const color = up ? "#10b981" : "#ef4444";

  return (
    <div className="flex items-center gap-2">
      <svg width={width} height={height} style={{ overflow: "visible" }}>
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.8}
        />
        {/* Last point dot */}
        {scores.length > 0 && (() => {
          const x = width;
          const y = padY + ((max - lastScore) / range) * (height - padY * 2);
          return <circle cx={x} cy={y} r={3} fill={color} />;
        })()}
      </svg>
      <div className="flex items-center gap-0.5">
        <TrendingUp size={11} style={{ color, transform: up ? "none" : "scaleY(-1)" }} />
        <span className="text-[11px] font-bold" style={{ color }}>{lastScore}</span>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   6. AI Resume Diff Prototype
───────────────────────────────────────────────────────────────── */
interface ResumeDiffProps {
  sections: { name: string; enhanced: boolean; reason?: string }[];
}

export function ResumeDiffPreview({ sections }: ResumeDiffProps) {
  return (
    <div
      className="rounded-2xl overflow-hidden w-full max-w-xs"
      style={{
        background: "rgba(255,255,255,0.85)",
        backdropFilter: "blur(16px)",
        border: "1px solid rgba(226,232,240,0.8)",
        boxShadow: "0 8px 32px rgba(15,23,42,0.08)",
      }}
    >
      <div className="px-4 py-3 flex items-center gap-2" style={{ borderBottom: "1px solid rgba(226,232,240,0.6)", background: "rgba(248,250,252,0.6)" }}>
        <FileText size={13} className="text-emerald-500" />
        <span className="text-xs font-bold text-slate-800">Tailored Resume</span>
        <div className="ml-auto flex items-center gap-1">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[10px] font-semibold text-emerald-600">AI Optimized</span>
        </div>
      </div>
      <div className="p-4 space-y-2">
        {sections.map(({ name, enhanced, reason }) => (
          <div
            key={name}
            className="flex items-start gap-2 rounded-lg px-3 py-2"
            style={{
              background: enhanced ? "rgba(16,185,129,0.06)" : "rgba(248,250,252,0.6)",
              border: enhanced ? "1px solid rgba(16,185,129,0.2)" : "1px solid rgba(226,232,240,0.5)",
            }}
          >
            {enhanced ? (
              <CheckCircle2 size={12} className="text-emerald-500 flex-shrink-0 mt-0.5" />
            ) : (
              <div className="w-3 h-3 rounded-full border-2 border-slate-200 flex-shrink-0 mt-0.5" />
            )}
            <div className="min-w-0">
              <span className={`text-xs font-semibold ${enhanced ? "text-slate-800" : "text-slate-400"}`}>{name}</span>
              {reason && <div className="text-[10px] text-slate-400 mt-0.5 truncate">{reason}</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────
   Demo data exports (for use in feature showcases)
───────────────────────────────────────────────────────────────── */
export const demoAnalysisData = {
  overallScore: 78,
  dimensions: [
    { label: "Technical Skills", score: 85 },
    { label: "Experience Match", score: 72 },
    { label: "Keywords", score: 90 },
    { label: "Culture Fit", score: 65 },
  ],
};

export const demoTrackerItems: TrackerItem[] = [
  { company: "Stripe", role: "Sr. PM", stage: "Interview", date: "Apr 22" },
  { company: "Linear", role: "Product Lead", stage: "Applied", date: "Apr 20" },
  { company: "Vercel", role: "PM II", stage: "Screening", date: "Apr 18" },
  { company: "Figma", role: "Product Manager", stage: "Saved", date: "Apr 15" },
];

export const demoSkills: SkillGap[] = [
  { skill: "TypeScript", have: true, required: true },
  { skill: "React", have: true, required: true },
  { skill: "Product Strategy", have: true, required: true },
  { skill: "Go", have: false, required: true },
  { skill: "GraphQL", have: false, required: false, level: "preferred" },
  { skill: "Rust", have: false, required: false, level: "preferred" },
];

export const demoResumeSections = [
  { name: "Summary", enhanced: true, reason: "Keywords injected from JD" },
  { name: "Experience", enhanced: true, reason: "Impact metrics highlighted" },
  { name: "Skills", enhanced: true, reason: "Matched to required stack" },
  { name: "Education", enhanced: false },
  { name: "Projects", enhanced: false },
];
