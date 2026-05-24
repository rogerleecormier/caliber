import { ArrowUpDown, ChevronDown } from "lucide-react";

interface SortControlsProps {
  sortBy: "newest" | "oldest" | "title-asc" | "title-desc" | "recently-added";
  onSortChange: (
    sortBy: "newest" | "oldest" | "title-asc" | "title-desc" | "recently-added"
  ) => void;
}

const sortOptions = [
  { value: "newest" as const, label: "Newest First" },
  { value: "oldest" as const, label: "Oldest First" },
  { value: "recently-added" as const, label: "Recently Added" },
  { value: "title-asc" as const, label: "Title (A-Z)" },
  { value: "title-desc" as const, label: "Title (Z-A)" },
];

export default function SortControls({
  sortBy,
  onSortChange,
}: SortControlsProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <ArrowUpDown size={16} />
        <label htmlFor="sort-select" className="font-medium">
          Sort by:
        </label>
      </div>
      <div className="relative">
        <select
          id="sort-select"
          value={sortBy}
          onChange={(e) =>
            onSortChange(
              e.target.value as "newest" | "oldest" | "title-asc" | "title-desc" | "recently-added"
            )
          }
          className="appearance-none pl-3 pr-8 py-2 bg-white border border-slate-200 rounded-lg text-sm font-medium text-slate-700 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/10 outline-none cursor-pointer transition-all hover:border-slate-300"
        >
          {sortOptions.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          size={14}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none"
        />
      </div>
    </div>
  );
}
