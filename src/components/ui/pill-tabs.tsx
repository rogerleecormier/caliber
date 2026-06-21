import { cn } from "@caliber/ui-kit"
import type { ReactNode } from "react"

export interface PillTab {
  key: string
  label: string
  badge?: number | string
}

interface PillTabsProps {
  tabs: PillTab[]
  activeTab: string
  onTabChange: (key: string) => void
  className?: string
}

export function PillTabs({ tabs, activeTab, onTabChange, className }: PillTabsProps) {
  return (
    <div className={cn("inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1", className)}>
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onTabChange(tab.key)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition-all",
            activeTab === tab.key
              ? "bg-orange-600 text-white shadow-sm"
              : "text-slate-600 hover:text-slate-900 hover:bg-white/60",
          )}
        >
          {tab.label}
          {tab.badge !== undefined && (
            <span className={cn(
              "rounded-full px-1.5 py-0.5 text-[10px] font-bold leading-none",
              activeTab === tab.key
                ? "bg-white/20 text-white"
                : "bg-slate-200 text-slate-600",
            )}>
              {tab.badge}
            </span>
          )}
        </button>
      ))}
    </div>
  )
}

interface PillTabContentProps {
  activeTab: string
  tabKey: string
  children: ReactNode
}

export function PillTabContent({ activeTab, tabKey, children }: PillTabContentProps) {
  if (activeTab !== tabKey) return null
  return <>{children}</>
}
