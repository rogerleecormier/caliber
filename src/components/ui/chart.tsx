import * as React from "react"
// biome-ignore lint/correctness/noUnusedImports: TooltipProps used below
import { Tooltip } from "recharts"
import { cn } from "@caliber/ui-kit"

export type ChartConfig = {
  [key: string]: {
    label: string
    color?: string
  }
}

interface ChartContextValue {
  config: ChartConfig
}

const ChartContext = React.createContext<ChartContextValue | null>(null)

export function useChart() {
  const ctx = React.useContext(ChartContext)
  if (!ctx) throw new Error("useChart must be used inside ChartContainer")
  return ctx
}

interface ChartContainerProps extends React.HTMLAttributes<HTMLDivElement> {
  config: ChartConfig
}

export function ChartContainer({ config, className, children, ...props }: ChartContainerProps) {
  const cssVars = React.useMemo(() => {
    const defaults = [
      "#ea580c", // chart-1: burnt orange
      "#6366f1", // chart-2: indigo
      "#0d9488", // chart-3: teal
      "#f59e0b", // chart-4: amber
      "#64748b", // chart-5: slate
    ]
    const vars: Record<string, string> = {}
    Object.entries(config).forEach(([key, val], i) => {
      vars[`--chart-${i + 1}`] = val.color ?? defaults[i % defaults.length]
      vars[`--color-${key}`] = val.color ?? defaults[i % defaults.length]
    })
    return vars
  }, [config])

  return (
    <ChartContext.Provider value={{ config }}>
      <div
        className={cn("flex flex-col", className)}
        style={cssVars as React.CSSProperties}
        {...props}
      >
        {children}
      </div>
    </ChartContext.Provider>
  )
}

interface ChartTooltipContentProps {
  active?: boolean
  payload?: Array<{ name: string; value: number; color?: string }>
  label?: string
  formatter?: (value: number, name: string) => string
  labelFormatter?: (label: string) => string
}

export function ChartTooltipContent({
  active,
  payload,
  label,
  formatter,
  labelFormatter,
}: ChartTooltipContentProps) {
  const { config } = useChart()

  if (!active || !payload?.length) return null

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-md text-sm">
      {label && (
        <p className="mb-1.5 font-medium text-slate-700">
          {labelFormatter ? labelFormatter(label) : label}
        </p>
      )}
      <div className="space-y-1">
        {payload.map((item) => {
          const cfg = config[item.name]
          return (
            <div key={item.name} className="flex items-center gap-2">
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: item.color ?? cfg?.color ?? "#ea580c" }}
              />
              <span className="text-slate-500">{cfg?.label ?? item.name}:</span>
              <span className="font-semibold text-slate-900">
                {formatter ? formatter(item.value, item.name) : item.value}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export function ChartTooltip(props: Record<string, unknown>) {
  return (
    <Tooltip
      cursor={{ fill: "rgba(234,88,12,0.04)" }}
      content={<ChartTooltipContent />}
      {...(props as any)}
    />
  )
}
