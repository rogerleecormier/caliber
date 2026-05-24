import { cn } from "@caliber/ui-kit";

interface ScoreBadgeProps {
  score: number;
  label?: string;
  size?: "sm" | "md" | "lg";
}

function getScoreConfig(score: number) {
  if (score >= 80) return { border: "border-emerald-400", text: "text-emerald-700", bg: "bg-emerald-50", label: "Strong" };
  if (score >= 60) return { border: "border-amber-400",  text: "text-amber-700",  bg: "bg-amber-50",  label: "Moderate" };
  return              { border: "border-red-400",    text: "text-red-700",    bg: "bg-red-50",    label: "Weak" };
}

export function ScoreBadge({ score, label, size = "md" }: ScoreBadgeProps) {
  const cfg = getScoreConfig(score);
  const displayLabel = label ?? cfg.label;

  const circleSize = size === "sm" ? "h-10 w-10" : size === "lg" ? "h-16 w-16" : "h-12 w-12";
  const numSize    = size === "sm" ? "text-sm"   : size === "lg" ? "text-xl"   : "text-base";
  const subSize    = size === "sm" ? "text-[9px]" : size === "lg" ? "text-[11px]" : "text-[10px]";
  const borderW    = size === "lg" ? "border-4"  : "border-[3px]";

  return (
    <div className="flex flex-col items-center gap-1">
      <div className={cn(
        "relative flex flex-col items-center justify-center rounded-full bg-white shadow-sm",
        circleSize, borderW, cfg.border,
      )}>
        <span className={cn("font-bold leading-none tabular-nums", numSize, cfg.text)}>{score}</span>
      </div>
      <span className={cn("font-medium text-slate-500 leading-tight", subSize)}>{displayLabel}</span>
    </div>
  );
}

// Inline mini bar used on JobCard and listings
export function ScoreMiniRow({ label, score }: { label: string; score: number }) {
  const cfg = getScoreConfig(score);
  const barColor = score >= 80 ? "bg-emerald-400" : score >= 60 ? "bg-amber-400" : "bg-red-400";
  return (
    <div className="flex items-center gap-1.5">
      <div className="h-1.5 w-14 rounded-full bg-slate-100 overflow-hidden">
        <div className={cn("h-full rounded-full transition-all", barColor)} style={{ width: `${score}%` }} />
      </div>
      <span className={cn("text-[9px] font-semibold tabular-nums", cfg.text)}>{label} {score}</span>
    </div>
  );
}
