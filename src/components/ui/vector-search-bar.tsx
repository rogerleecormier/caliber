import { Search, Loader2 } from "lucide-react"
import { useDebouncedValue } from "@tanstack/react-pacer"
import { cn } from "@caliber/ui-kit"

interface VectorSearchBarProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
  isLoading?: boolean
}

export function VectorSearchBar({
  value,
  onChange,
  placeholder = "Search jobs…",
  className,
  isLoading,
}: VectorSearchBarProps) {
  const [debouncedValue] = useDebouncedValue(value, { wait: 400 })
  const isPending = value !== debouncedValue

  return (
    <div className={cn("relative flex items-center", className)}>
      <Search className="absolute left-3 h-4 w-4 text-slate-400 pointer-events-none" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full h-9 pl-9 pr-9 rounded-lg border border-slate-200 bg-white text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-orange-500/30 focus:border-orange-400 transition-colors"
      />
      {(isPending || isLoading) && (
        <Loader2 className="absolute right-3 h-4 w-4 text-slate-400 animate-spin pointer-events-none" />
      )}
    </div>
  )
}
