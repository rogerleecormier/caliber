import type { ReactNode } from "react"
import { cn } from "@caliber/ui-kit"

interface CompactStatTileProps {
  icon: ReactNode
  label: string
  value: string | number
  note?: string
  onClick?: () => void
  accentClass?: string
}

export function CompactStatTile({ icon, label, value, note, onClick, accentClass }: CompactStatTileProps) {
  const isClickable = !!onClick
  return (
    <div
      role={isClickable ? "button" : undefined}
      tabIndex={isClickable ? 0 : undefined}
      onClick={onClick}
      onKeyDown={isClickable ? (e) => e.key === "Enter" && onClick?.() : undefined}
      className={cn(
        "flex items-center gap-3 p-4 min-w-0 transition-colors",
        isClickable && "cursor-pointer hover:bg-orange-50/50 focus:outline-none focus:bg-orange-50/50",
        accentClass,
      )}
    >
      <div className="shrink-0 text-slate-400">{icon}</div>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500 truncate">{label}</p>
        <p className="text-xl font-bold text-slate-900 leading-tight">{value}</p>
        {note && <p className="text-xs text-slate-400 truncate">{note}</p>}
      </div>
    </div>
  )
}

interface StatCardGridProps {
  children: ReactNode
  className?: string
  cols?: 2 | 3 | 4 | 5
}

export function StatCardGrid({ children, className, cols = 4 }: StatCardGridProps) {
  const colClass = {
    2: "grid-cols-2",
    3: "grid-cols-1 sm:grid-cols-3",
    4: "grid-cols-2 sm:grid-cols-4",
    5: "grid-cols-2 sm:grid-cols-5",
  }[cols]

  return (
    <div
      className={cn(
        "rounded-lg border border-slate-200 bg-white/80 shadow-sm overflow-hidden",
        `grid ${colClass} divide-x divide-slate-100`,
        className,
      )}
    >
      {children}
    </div>
  )
}
