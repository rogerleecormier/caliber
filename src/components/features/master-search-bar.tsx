import { useRef, useState } from "react";
import {
  Building2,
  ChevronDown,
  Globe,
  MapPin,
  Search,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { POPULAR_CITIES } from "@/lib/linkedin-search";
import type { CatalogFilters } from "@/hooks/useCatalogQuery";

// ─── Location data ─────────────────────────────────────────────────────────────

const US_STATES = [
  "Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado",
  "Connecticut", "Delaware", "Florida", "Georgia", "Hawaii", "Idaho",
  "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana",
  "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota",
  "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada",
  "New Hampshire", "New Jersey", "New Mexico", "New York",
  "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon",
  "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota",
  "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington",
  "West Virginia", "Wisconsin", "Wyoming",
];

// ─── Constants ─────────────────────────────────────────────────────────────────

const ATS_OPTIONS = [
  { value: '', label: 'All Sources' },
  { value: 'greenhouse', label: 'Greenhouse' },
  { value: 'lever', label: 'Lever' },
  { value: 'workable', label: 'Workable' },
  { value: 'ashby', label: 'Ashby' },
  { value: 'adzuna', label: 'Adzuna' },
  { value: 'jooble', label: 'Jooble' },
  { value: 'remotive', label: 'Remotive' },
  { value: 'remoteok', label: 'RemoteOK' },
  { value: 'himalayas', label: 'Himalayas' },
  { value: 'jobicy', label: 'Jobicy' },
  { value: 'manual', label: 'Manual Entry' },
];

const SALARY_OPTIONS = [
  { value: 0, label: 'Any salary' },
  { value: 50000, label: '$50K+' },
  { value: 75000, label: '$75K+' },
  { value: 100000, label: '$100K+' },
  { value: 125000, label: '$125K+' },
  { value: 150000, label: '$150K+' },
  { value: 200000, label: '$200K+' },
];

// ─── Types ─────────────────────────────────────────────────────────────────────

interface MasterSearchBarProps {
  filters: CatalogFilters;
  onChange: <K extends keyof CatalogFilters>(key: K, value: CatalogFilters[K]) => void;
  onClearAll: () => void;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function buildLocationSuggestions(input: string): { label: string; value: string }[] {
  if (input.trim().length < 2) return [];
  const q = input.toLowerCase();
  const results: { label: string; value: string }[] = [];

  // Country-level
  if ("united states".includes(q) || "usa".includes(q) || "us".includes(q)) {
    results.push({ label: "United States", value: "United States" });
  }

  // State matches
  US_STATES.filter((s) => s.toLowerCase().includes(q)).forEach((s) => {
    results.push({ label: s, value: s });
  });

  // City matches
  POPULAR_CITIES.filter(
    (c) =>
      c.city.toLowerCase().includes(q) ||
      c.state.toLowerCase().includes(q)
  ).forEach((c) => {
    results.push({ label: `${c.city}, ${c.state}`, value: `${c.city}, ${c.state}` });
  });

  return results.slice(0, 8);
}

function activeFilterCount(filters: CatalogFilters): number {
  let n = 0;
  if (filters.remote !== undefined) n++;
  if (filters.company) n++;
  if (filters.ats) n++;
  if (filters.salaryMin > 0) n++;
  if (filters.location) n++;
  return n;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function MasterSearchBar({
  filters,
  onChange,
  onClearAll,
}: MasterSearchBarProps) {
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [locationInput, setLocationInput] = useState(filters.location ?? "");
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);
  const locationRef = useRef<HTMLInputElement>(null);

  const locationSuggestions = buildLocationSuggestions(locationInput);
  const activeCount = activeFilterCount(filters);
  const hasActiveFilters = activeCount > 0;

  function handleLocationSelect(value: string) {
    setLocationInput(value);
    onChange("location", value);
    setShowLocationSuggestions(false);
  }

  function handleLocationChange(val: string) {
    setLocationInput(val);
    onChange("location", val);
    setShowLocationSuggestions(true);
  }

  function clearLocation() {
    setLocationInput("");
    onChange("location", "");
  }

  return (
    <div className="space-y-3">
      {/* ── Master search input ────────────────────────────────────────────── */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none" />
          <input
            type="text"
            value={filters.query}
            onChange={(e) => onChange("query", e.target.value)}
            placeholder="Search jobs by title, skills, or keywords…"
            className="w-full pl-10 pr-10 py-3 border border-slate-200 rounded-xl bg-white text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent shadow-sm transition"
          />
          {filters.query ? (
            <button
              onClick={() => onChange("query", "")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          ) : (
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-semibold text-indigo-400 pointer-events-none select-none">
              ✦ AI
            </span>
          )}
        </div>

        {/* Filters toggle */}
        <button
          type="button"
          onClick={() => setFiltersOpen((o) => !o)}
          className={`flex items-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium transition whitespace-nowrap shadow-sm ${
            filtersOpen || hasActiveFilters
              ? "bg-slate-900 text-white border-slate-900"
              : "bg-white text-slate-700 border-slate-200 hover:border-slate-300"
          }`}
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filters
          {hasActiveFilters && (
            <span className="ml-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-amber-400 text-[11px] font-bold text-slate-900">
              {activeCount}
            </span>
          )}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${filtersOpen ? "rotate-180" : ""}`} />
        </button>
      </div>

      {/* ── Active filter chips ────────────────────────────────────────────── */}
      {hasActiveFilters && !filtersOpen && (
        <div className="flex flex-wrap items-center gap-2">
          {filters.remote !== undefined && (
            <FilterChip
              label={filters.remote ? "Remote" : "On-site"}
              onRemove={() => onChange("remote", undefined)}
            />
          )}
          {filters.location && (
            <FilterChip
              icon={<MapPin className="h-3 w-3" />}
              label={filters.location}
              onRemove={clearLocation}
            />
          )}
          {filters.company && (
            <FilterChip
              icon={<Building2 className="h-3 w-3" />}
              label={filters.company}
              onRemove={() => onChange("company", "")}
            />
          )}
          {filters.ats && (
            <FilterChip
              label={ATS_OPTIONS.find((o) => o.value === filters.ats)?.label ?? filters.ats}
              onRemove={() => onChange("ats", "")}
            />
          )}
          {filters.salaryMin > 0 && (
            <FilterChip
              label={SALARY_OPTIONS.find((o) => o.value === filters.salaryMin)?.label ?? `$${filters.salaryMin.toLocaleString()}+`}
              onRemove={() => onChange("salaryMin", 0)}
            />
          )}
          <button
            onClick={onClearAll}
            className="text-xs text-slate-400 hover:text-slate-700 transition px-1"
          >
            Clear all
          </button>
        </div>
      )}

      {/* ── Filter panel ──────────────────────────────────────────────────── */}
      {filtersOpen && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-4 shadow-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">

            {/* Work Type */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                Work Type
              </label>
              <div className="flex gap-1.5">
                {(
                  [
                    { label: "Any", val: undefined },
                    { label: "Remote", val: true },
                    { label: "On-site", val: false },
                  ] as const
                ).map(({ label, val }) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => onChange("remote", val as boolean | undefined)}
                    className={`flex-1 py-1.5 rounded-lg border text-xs font-medium transition ${
                      filters.remote === val
                        ? "bg-indigo-600 text-white border-indigo-600"
                        : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Location */}
            <div className="relative">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                Location
              </label>
              <div className="relative">
                <Globe className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                <input
                  ref={locationRef}
                  type="text"
                  value={locationInput}
                  onChange={(e) => handleLocationChange(e.target.value)}
                  onFocus={() => setShowLocationSuggestions(true)}
                  onBlur={() => setTimeout(() => setShowLocationSuggestions(false), 150)}
                  placeholder="Country, state, or city…"
                  className="w-full pl-8 pr-7 py-1.5 border border-slate-200 rounded-lg bg-white text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                {locationInput && (
                  <button
                    type="button"
                    onClick={clearLocation}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 transition"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {showLocationSuggestions && locationSuggestions.length > 0 && (
                <ul className="absolute z-30 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg overflow-hidden">
                  {locationSuggestions.map((s) => (
                    <li key={s.value}>
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-left text-xs text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 transition flex items-center gap-2"
                        onMouseDown={() => handleLocationSelect(s.value)}
                      >
                        <MapPin className="h-3 w-3 text-slate-400 shrink-0" />
                        {s.label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Company */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                Company
              </label>
              <div className="relative">
                <Building2 className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={filters.company}
                  onChange={(e) => onChange("company", e.target.value)}
                  placeholder="e.g. Stripe"
                  className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-lg bg-white text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>

            {/* ATS Source */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                ATS Source
              </label>
              <select
                value={filters.ats}
                onChange={(e) => onChange("ats", e.target.value)}
                className="w-full py-1.5 px-2 border border-slate-200 rounded-lg bg-white text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {ATS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Min Salary */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-2">
                Min Salary
              </label>
              <select
                value={filters.salaryMin}
                onChange={(e) => onChange("salaryMin", Number(e.target.value))}
                className="w-full py-1.5 px-2 border border-slate-200 rounded-lg bg-white text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {SALARY_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {hasActiveFilters && (
            <div className="flex justify-end border-t border-slate-200 pt-3">
              <button
                onClick={onClearAll}
                className="px-3 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 transition"
              >
                Clear all filters
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Filter chip ───────────────────────────────────────────────────────────────

function FilterChip({
  label,
  icon,
  onRemove,
}: {
  label: string;
  icon?: React.ReactNode;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-indigo-200 bg-indigo-50 pl-2 pr-1 py-0.5 text-xs font-medium text-indigo-700">
      {icon}
      {label}
      <button
        type="button"
        onClick={onRemove}
        className="ml-0.5 rounded-full p-0.5 hover:bg-indigo-100 transition"
        aria-label={`Remove ${label} filter`}
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}
