import { cn } from "@caliber/ui-kit"

interface WorkTypeBadgeProps {
  workType?: string | null
  className?: string
}

export function WorkTypeBadge({ workType, className }: WorkTypeBadgeProps) {
  if (!workType) return null

  const normalized = workType.toLowerCase()

  if (normalized.includes("remote")) {
    return (
      <span className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        "bg-teal-50 text-teal-700 border border-teal-200",
        className
      )}>
        Remote
      </span>
    )
  }

  if (normalized.includes("hybrid")) {
    return (
      <span className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        "bg-amber-50 text-amber-700 border border-amber-200",
        className
      )}>
        Hybrid
      </span>
    )
  }

  if (normalized.includes("on") || normalized.includes("office") || normalized.includes("onsite") || normalized.includes("in-person")) {
    return (
      <span className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        "bg-slate-100 text-slate-600 border border-slate-200",
        className
      )}>
        On-site
      </span>
    )
  }

  return null
}
