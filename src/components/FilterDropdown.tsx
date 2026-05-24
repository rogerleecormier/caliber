import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@caliber/ui-kit";
import { ChevronDown, Check } from "lucide-react";

interface FilterOption {
  id: string | number | null;
  label: string;
  count?: number;
}

interface FilterDropdownProps {
  label: string;
  value: string | number | null;
  options: FilterOption[];
  onChange: (value: any) => void;
  align?: "start" | "end" | "center";
}

export default function FilterDropdown({
  label,
  value,
  options,
  onChange,
  align = "start",
}: FilterDropdownProps) {
  const selectedOption = options.find((opt) => opt.id === value);
  const isActive = value !== null;

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <button className={`spx-nav-trigger ${isActive ? "spx-nav-trigger-active" : "spx-nav-trigger-idle"}`}>
          <span className="truncate max-w-[150px]">
            {selectedOption ? selectedOption.label : `All ${label}`}
          </span>
          <ChevronDown size={12} className="flex-shrink-0 opacity-50" />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        className="spx-menu-panel min-w-[220px]"
        align={align}
        sideOffset={8}
      >
        <div className="max-h-[300px] overflow-y-auto">
          <DropdownMenuItem
            className={`spx-menu-item${value === null ? " spx-menu-item-active" : ""}`}
            onClick={() => onChange(null)}
          >
            <span className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 w-full">
              <span className="text-sm font-semibold text-slate-900">All {label}</span>
              {value === null && <Check size={14} className="text-primary-600 shrink-0" />}
            </span>
          </DropdownMenuItem>

          <DropdownMenuSeparator className="spx-menu-separator" />

          {options.map((option) => (
            <DropdownMenuItem
              key={String(option.id)}
              className={`spx-menu-item${value === option.id ? " spx-menu-item-active" : ""}`}
              onClick={() => onChange(option.id)}
            >
              <span className="flex items-center justify-between gap-3 rounded-xl px-3 py-2.5 w-full">
                <span className="truncate text-sm font-semibold text-slate-900">{option.label}</span>
                <span className="flex items-center gap-2 shrink-0">
                  {option.count !== undefined && (
                    <span className="text-xs text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded-md">
                      {option.count}
                    </span>
                  )}
                  {value === option.id && (
                    <Check size={14} className="text-primary-600" />
                  )}
                </span>
              </span>
            </DropdownMenuItem>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
