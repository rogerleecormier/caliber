import { cn } from "@caliber/ui-kit";
import { CheckCircle2, AlertTriangle, XCircle } from "lucide-react";

interface PursueVerdictProps {
  pursue: boolean;
  justification: string;
  recommendation?: "pursue" | "consider" | "pass";
}

export function PursueVerdict({ pursue, justification, recommendation }: PursueVerdictProps) {
  let recRaw = recommendation;
  if (typeof recRaw === "string") {
    recRaw = recRaw.toLowerCase().trim() as any;
  }
  const rec = (recRaw === "pursue" || recRaw === "consider" || recRaw === "pass")
    ? recRaw
    : (pursue ? "pursue" : "pass");

  const config = {
    pursue: {
      icon: CheckCircle2,
      label: "Pursue",
      ring: "ring-emerald-500/20",
      bg: "bg-emerald-500/10",
      text: "text-emerald-700 dark:text-emerald-400",
    },
    consider: {
      icon: AlertTriangle,
      label: "Consider",
      ring: "ring-amber-500/20",
      bg: "bg-amber-500/10",
      text: "text-amber-700 dark:text-amber-400",
    },
    pass: {
      icon: XCircle,
      label: "Pass",
      ring: "ring-red-500/20",
      bg: "bg-red-500/10",
      text: "text-red-700 dark:text-red-400",
    },
  }[rec];

  const Icon = config.icon;

  return (
    <div className={cn("rounded-xl ring-1 p-4", config.bg, config.ring)}>
      <div className="flex items-center gap-2 mb-1.5">
        <Icon className={cn("h-4 w-4", config.text)} />
        <span className={cn("text-sm font-semibold uppercase tracking-wide", config.text)}>
          {config.label}
        </span>
      </div>
      <p className="text-sm text-muted-foreground">{justification}</p>
    </div>
  );
}
