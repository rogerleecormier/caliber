import { type ChangeEvent, type FormEvent, useEffect, useState } from "react";
import {
  Button,
  Input,
  Sheet,
  SheetContent,
  SheetTitle,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@caliber/ui-kit";
import { ChevronDown, CircleHelp, Loader2, Search } from "lucide-react";
import type { SavedLinkedinSearchRow } from "@/lib/linkedin-persistence";
import {
  getSavedLinkedinSearches,
  removeLinkedinSearch,
  saveLinkedinSearch,
  setSearchAgentRunning,
  toggleLinkedinSearchCron,
} from "@/server/functions/linkedin-searches";
import {
  type LinkedInScrapedJob,
  type LinkedInSearchParams,
  POPULAR_CITIES,
  SALARY_BANDS,
} from "@/lib/linkedin-search";
import {
  type SearchPreset,
  defaultSearchPresets,
  runLinkedinSearch,
} from "@/lib/run-linkedin-search";
import { useSearchStatusContext } from "@/hooks/useSearchStatus";

// ─── Types ────────────────────────────────────────────────────────────────────

type FormState = {
  keywords: string;
  location: string;
  company: string;
  workplaceTypes: string[];
  experienceLevels: string[];
  jobTypes: string[];
  postedWithin: LinkedInSearchParams["postedWithin"];
  salaryMin: string;
  easyApply: boolean;
  sortBy: LinkedInSearchParams["sortBy"];
  page: number;
  pagesToScan: number;
  limit: number;
  sources: string[];
  geoId: string;
  distance: string;
  f_SAL: string;
  useSemanticFormat: boolean;
};

export type DrawerPreload = {
  id: number;
  name: string;
  criteria: LinkedInSearchParams;
  sources?: string[];
} | null;

export interface AgentsSearchDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hasResume: boolean;
  fullName: string | null;
  initialSavedSearches: SavedLinkedinSearchRow[];
  preload?: DrawerPreload;
  cronStartHour?: number | null;
  cronFrequency?: string | null;
  onSearchComplete: (
    jobs: LinkedInScrapedJob[],
    meta: { warnings: string[]; searchUrl: string },
  ) => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const defaultForm: FormState = {
  keywords: "",
  location: "United States",
  company: "",
  workplaceTypes: ["remote"],
  experienceLevels: [],
  jobTypes: ["full-time"],
  postedWithin: "7d",
  salaryMin: "",
  easyApply: false,
  sortBy: "recent",
  page: 1,
  pagesToScan: 1,
  limit: 10,
  sources: ["linkedin", "greenhouse", "lever", "workable"],
  geoId: "",
  distance: "",
  f_SAL: "",
  useSemanticFormat: true,
};

const workplaceOptions = [
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "on-site", label: "On-site" },
];

const experienceOptions = [
  { value: "internship", label: "Internship" },
  { value: "entry", label: "Entry" },
  { value: "associate", label: "Associate" },
  { value: "mid-senior", label: "Mid-Senior" },
  { value: "director", label: "Director" },
  { value: "executive", label: "Executive" },
];

const jobTypeOptions = [
  { value: "full-time", label: "Full-time" },
  { value: "part-time", label: "Part-time" },
  { value: "contract", label: "Contract" },
  { value: "temporary", label: "Temporary" },
  { value: "internship", label: "Internship" },
  { value: "volunteer", label: "Volunteer" },
  { value: "other", label: "Other" },
];

const discoveryPresetOptions: Array<{ value: SearchPreset; label: string; description: string }> = [
  {
    value: "title-variants",
    label: "Similar job titles",
    description: "Searches for closely related title wording like project manager versus program manager so relevant jobs are less likely to be missed.",
  },
  {
    value: "location-spread",
    label: "Wider location search",
    description: "Broadens a narrow city search into wider location variants so LinkedIn can surface more jobs from nearby or national result pools.",
  },
  {
    value: "remote-expansion",
    label: "Nationwide remote search",
    description: "Adds a broader United States remote search when you want remote work, which can uncover jobs hidden by a tight local query.",
  },
  {
    value: "workplace-split",
    label: "Search each work style separately",
    description: "Runs separate searches for remote, hybrid, and on-site instead of combining them, which can surface more results when LinkedIn compresses mixed filters.",
  },
  {
    value: "ai-semantic-expansion",
    label: "AI Semantic Expansion",
    description: "Uses Llama 3.3 and your saved master resume to suggest three adjacent pivot titles, then searches those titles as additional variants.",
  },
];

// ─── Utilities ────────────────────────────────────────────────────────────────

function toggleValue(values: string[], value: string) {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function formatWorkplaceSummary(values: string[]) {
  if (values.length === 0) return "Any workplace";
  return values.map((v) => workplaceOptions.find((o) => o.value === v)?.label || v).join(" + ");
}

function formatPostedSummary(value: FormState["postedWithin"]) {
  if (value === "any") return "Any time";
  if (value === "24h") return "Posted in 24h";
  if (value === "7d") return "Posted in 7d";
  return "Posted in 30d";
}

function formatSortSummary(value: FormState["sortBy"]) {
  return value === "recent" ? "Most recent" : "Most relevant";
}

function criteriaToForm(criteria: LinkedInSearchParams): Omit<FormState, "sources"> {
  return {
    keywords: criteria.keywords || "",
    location: criteria.location || "",
    company: criteria.company || "",
    workplaceTypes: (criteria.workplaceTypes as string[]) || [],
    experienceLevels: (criteria.experienceLevels as string[]) || [],
    jobTypes: (criteria.jobTypes as string[]) || [],
    postedWithin: criteria.postedWithin || "7d",
    salaryMin: criteria.salaryMin ? String(criteria.salaryMin) : "",
    easyApply: !!criteria.easyApply,
    sortBy: criteria.sortBy || "recent",
    page: criteria.page || 1,
    pagesToScan: criteria.pagesToScan || 1,
    limit: criteria.limit || 10,
    geoId: criteria.geoId || "",
    distance: criteria.distance != null ? String(criteria.distance) : "",
    f_SAL: criteria.f_SAL || "",
    useSemanticFormat: criteria.useSemanticFormat ?? true,
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FieldLabelWithInfo({ htmlFor, label, tooltip }: { htmlFor?: string; label: string; tooltip: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <label className="text-sm font-medium text-slate-700" htmlFor={htmlFor}>{label}</label>
      <Tooltip>
        <TooltipTrigger asChild>
          <button type="button" className="inline-flex h-4 w-4 items-center justify-center rounded-full text-slate-400 transition hover:text-slate-600" aria-label={`${label} info`}>
            <CircleHelp className="h-4 w-4" />
          </button>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs leading-relaxed">{tooltip}</TooltipContent>
      </Tooltip>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

function formatCronLocalTime(utcHour: number): string {
  const d = new Date();
  d.setUTCHours(utcHour, 0, 0, 0);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function AgentsSearchDrawer({
  open,
  onOpenChange,
  hasResume,
  fullName: _fullName,
  initialSavedSearches,
  preload,
  cronStartHour,
  cronFrequency,
  onSearchComplete,
}: AgentsSearchDrawerProps) {
  const searchStatusContext = useSearchStatusContext();
  const [form, setForm] = useState<FormState>(defaultForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);
  const [runningSearchId, setRunningSearchId] = useState<number | null>(null);
  const [savedSearches, setSavedSearches] = useState(initialSavedSearches);
  const [activeSavedSearchId, setActiveSavedSearchId] = useState<number | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [broadenDiscovery, setBroadenDiscovery] = useState(false);
  const [selectedPresets, setSelectedPresets] = useState<SearchPreset[]>(defaultSearchPresets);
  const [mounted, setMounted] = useState(false);
  const [showCitySuggestions, setShowCitySuggestions] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const citySuggestions = form.location.trim().length >= 2
    ? POPULAR_CITIES.filter((c) =>
        c.city.toLowerCase().includes(form.location.toLowerCase()) ||
        c.state.toLowerCase().includes(form.location.toLowerCase())
      ).slice(0, 5)
    : [];

  const handleSelectCitySuggestion = (suggestion: typeof POPULAR_CITIES[number]) => {
    update("location", `${suggestion.city}, ${suggestion.state}`);
    update("geoId", suggestion.geoId);
    setShowCitySuggestions(false);
  };

  function formatLastRunLocalTime(lastRunAt: string | null): string {
    if (!lastRunAt) return "never";
    const date = new Date(lastRunAt);
    if (isNaN(date.getTime())) return "never";
    if (!mounted) {
      return lastRunAt;
    }
    return date.toLocaleString();
  }

  useEffect(() => {
    if (!preload) {
      setActiveSavedSearchId(null);
      return;
    }
    setActiveSavedSearchId(preload.id);
    setForm({
      ...criteriaToForm(preload.criteria),
      sources: preload.sources ?? ["linkedin", "greenhouse", "lever", "workable"],
    });
    setSaveName(preload.name);
  }, [preload]);

  // Reset active search tracking when drawer closes so the next open is fresh.
  useEffect(() => {
    if (!open) setActiveSavedSearchId(null);
  }, [open]);

  // Poll saved searches state every 10 seconds if drawer is open to sync running status across devices.
  // Also fetch immediately on open.
  useEffect(() => {
    if (!open) return;
    
    const fetchLatest = async () => {
      try {
        const next = await getSavedLinkedinSearches();
        setSavedSearches(next);
      } catch (err) {
        console.error("Failed to fetch saved searches:", err);
      }
    };
    
    fetchLatest();
    
    const interval = setInterval(fetchLatest, 10000);
    return () => clearInterval(interval);
  }, [open]);

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function togglePreset(preset: SearchPreset) {
    setSelectedPresets((prev) =>
      prev.includes(preset) ? prev.filter((p) => p !== preset) : [...prev, preset],
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    const searchId = `search-${Date.now()}`;
    searchStatusContext.startSearch(searchId, `Searching for "${form.keywords}"...`);

    try {
      const params: LinkedInSearchParams = {
        keywords: form.keywords,
        location: form.location,
        company: form.company || undefined,
        workplaceTypes: form.workplaceTypes as LinkedInSearchParams["workplaceTypes"],
        experienceLevels: form.experienceLevels as LinkedInSearchParams["experienceLevels"],
        jobTypes: form.jobTypes as LinkedInSearchParams["jobTypes"],
        postedWithin: form.postedWithin,
        salaryMin: form.salaryMin ? Number(form.salaryMin) : null,
        easyApply: form.easyApply,
        sortBy: form.sortBy,
        page: form.page,
        pagesToScan: form.pagesToScan,
        limit: form.limit,
        geoId: form.geoId || undefined,
        distance: form.distance ? Number(form.distance) : null,
        f_SAL: form.f_SAL || undefined,
        useSemanticFormat: form.useSemanticFormat,
      };
      const result = await runLinkedinSearch(params, {
        broadenDiscovery,
        presets: selectedPresets,
        activeSavedSearchId,
      });
      searchStatusContext.setJobsFound(searchId, result.jobs.length);
      searchStatusContext.updateSearch(searchId, "completed", `Found ${result.jobs.length} job${result.jobs.length !== 1 ? "s" : ""}`);
      onSearchComplete(result.jobs, { warnings: result.warnings, searchUrl: result.searchUrl });
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : "LinkedIn search failed.";
      setError(message);
      searchStatusContext.addError(searchId, message);
      searchStatusContext.updateSearch(searchId, "error", "Search failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveSearch() {
    const name = saveName.trim() || form.keywords.trim();
    if (!name) {
      setError("Enter a search name or fill in keywords before saving.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const criteria: LinkedInSearchParams = {
        keywords: form.keywords,
        location: form.location,
        company: form.company || undefined,
        workplaceTypes: form.workplaceTypes as LinkedInSearchParams["workplaceTypes"],
        experienceLevels: form.experienceLevels as LinkedInSearchParams["experienceLevels"],
        jobTypes: form.jobTypes as LinkedInSearchParams["jobTypes"],
        postedWithin: form.postedWithin,
        salaryMin: form.salaryMin ? Number(form.salaryMin) : null,
        easyApply: form.easyApply,
        sortBy: form.sortBy,
        page: form.page,
        pagesToScan: form.pagesToScan,
        limit: form.limit,
        geoId: form.geoId || undefined,
        distance: form.distance ? Number(form.distance) : null,
        f_SAL: form.f_SAL || undefined,
        useSemanticFormat: form.useSemanticFormat,
      };
      const existing = savedSearches.find(s => s.id === activeSavedSearchId);
      await saveLinkedinSearch({
        data: {
          id: activeSavedSearchId ?? undefined,
          name,
          criteria,
          isActive: existing ? existing.isActive : false,
          sources: form.sources,
        }
      });
      const next = await getSavedLinkedinSearches();
      setSavedSearches(next);
      setSaveName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save search.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRunSavedSearch(saved: SavedLinkedinSearchRow) {
    setRunningSearchId(saved.id);
    setError(null);
    const searchId = `search-${Date.now()}`;
    searchStatusContext.startSearch(searchId, `Running agent: "${saved.name}"...`);

    try {
      await setSearchAgentRunning({ data: { id: saved.id, isRunning: true } });
    } catch (e) {
      console.error("Failed to acquire running lock:", e);
    }

    try {
      const result = await runLinkedinSearch(saved.criteria, { activeSavedSearchId: saved.id });
      try {
        await setSearchAgentRunning({ data: { id: saved.id, isRunning: false } });
      } catch (e) {
        console.error("Failed to release running lock:", e);
      }
      searchStatusContext.setJobsFound(searchId, result.jobs.length);
      searchStatusContext.updateSearch(searchId, "completed", `Found ${result.jobs.length} job${result.jobs.length !== 1 ? "s" : ""}`);
      const next = await getSavedLinkedinSearches();
      setSavedSearches(next);
      onSearchComplete(result.jobs, { warnings: result.warnings, searchUrl: result.searchUrl });
      onOpenChange(false);
    } catch (err) {
      try {
        await setSearchAgentRunning({ data: { id: saved.id, isRunning: false } });
      } catch (e) {
        console.error("Failed to release running lock on error:", e);
      }
      const message = err instanceof Error ? err.message : "Search failed.";
      setError(message);
      searchStatusContext.addError(searchId, message);
      searchStatusContext.updateSearch(searchId, "error", "Search failed");
    } finally {
      setRunningSearchId(null);
    }
  }

  async function handleDeleteSavedSearch(id: number) {
    await removeLinkedinSearch({ data: { id } });
    const next = await getSavedLinkedinSearches();
    setSavedSearches(next);
    if (activeSavedSearchId === id) setActiveSavedSearchId(null);
  }

  async function handleToggleSavedSearchCron(id: number, isActive: boolean) {
    await toggleLinkedinSearchCron({ data: { id, isActive } });
    const next = await getSavedLinkedinSearches();
    setSavedSearches(next);
  }

  function loadSavedSearch(id: number) {
    const saved = savedSearches.find((s) => s.id === id);
    if (!saved) return;
    setActiveSavedSearchId(saved.id);
    setForm({
      ...criteriaToForm(saved.criteria),
      sources: saved.sources,
    });
    setSaveName(saved.name);
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex flex-col p-0 sm:max-w-[560px]">
        {/* sticky header */}
        <div className="shrink-0 border-b border-slate-200 bg-gradient-to-r from-slate-50 to-white px-6 py-5 pr-14">
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
            <SheetTitle className="text-lg font-bold tracking-tight text-slate-900">
              Search Agents
            </SheetTitle>
          </div>
          <p className="mt-1 text-xs text-slate-500 leading-relaxed">
            Configure target sources and filters. Active agents run automatically on the Caliber cron schedule.
          </p>
        </div>

        {/* scrollable body */}
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          {!hasResume && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Upload a master resume on your profile first. Results are scored against that saved resume.
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Quick Search */}
            <div>
              <p className="mb-3 text-sm font-semibold text-slate-700">Quick Search</p>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-800" htmlFor="drawer-keywords">Keywords</label>
                  <Input
                    id="drawer-keywords"
                    value={form.keywords}
                    onChange={(e: ChangeEvent<HTMLInputElement>) => update("keywords", e.target.value)}
                    placeholder="Senior project manager, PMO, operations, Agile"
                    required
                  />
                </div>
              </div>
            </div>

            {/* Agent Settings */}
            <div className="rounded-xl border border-amber-200 bg-amber-500/5 p-4 space-y-4">
              <p className="text-sm font-semibold text-amber-900 flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                Search Sources
              </p>
              
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">Target Sources</label>
                <div className="flex flex-col gap-2 pt-1">
                    {[
                      { id: "linkedin", label: "LinkedIn" },
                      { id: "greenhouse", label: "Greenhouse" },
                      { id: "lever", label: "Lever" },
                      { id: "workable", label: "Workable" }
                    ].map((src) => (
                      <label key={src.id} className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-600 hover:text-slate-900">
                        <input
                          type="checkbox"
                          checked={form.sources.includes(src.id)}
                          onChange={() => {
                            const nextSources = form.sources.includes(src.id)
                              ? form.sources.filter(s => s !== src.id)
                              : [...form.sources, src.id];
                            update("sources", nextSources);
                          }}
                          className="h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                        />
                        {src.label}
                      </label>
                    ))}
                </div>
              </div>
            </div>

            {/* LinkedIn-specific Settings */}
            {form.sources.includes("linkedin") && (
              <div className="rounded-2xl border border-blue-200 bg-blue-50/5 p-4 space-y-4 shadow-sm">
                <div className="flex items-center justify-between border-b border-blue-100 pb-2">
                  <p className="text-xs font-bold text-blue-600 flex items-center gap-1.5 uppercase tracking-wide">
                    <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-pulse" />
                    LinkedIn Specific Filters
                  </p>
                  <span className="rounded bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700 uppercase">
                    Platform Specific
                  </span>
                </div>

                <div className="space-y-3">
                  <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
                    <div className="relative space-y-1.5">
                      <label className="text-sm font-medium text-slate-700" htmlFor="drawer-location">Location</label>
                      <Input
                        id="drawer-location"
                        value={form.location}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => {
                          update("location", e.target.value);
                          setShowCitySuggestions(true);
                        }}
                        onFocus={() => setShowCitySuggestions(true)}
                        onBlur={() => setShowCitySuggestions(false)}
                        placeholder="United States, Boston, Remote"
                      />
                      {showCitySuggestions && citySuggestions.length > 0 && (
                        <div className="absolute left-0 right-0 top-full z-50 mt-1 max-h-60 overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                          {citySuggestions.map((suggestion) => (
                            <button
                              key={suggestion.geoId}
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                handleSelectCitySuggestion(suggestion);
                              }}
                              className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 transition"
                            >
                              <span className="font-medium">
                                {suggestion.city}, {suggestion.state}
                              </span>
                              <span className="text-[10px] rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">
                                GeoID: {suggestion.geoId}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="space-y-1.5">
                      <FieldLabelWithInfo
                        htmlFor="drawer-geoId"
                        label="Location Geo ID"
                        tooltip="LinkedIn's location identifier code. Updated automatically when selecting a city from autocomplete."
                      />
                      <Input
                        id="drawer-geoId"
                        value={form.geoId}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => update("geoId", e.target.value)}
                        placeholder="e.g. 105142029"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <FieldLabelWithInfo
                      htmlFor="drawer-limit"
                      label="Max cards"
                      tooltip="Maximum LinkedIn cards to extract per scanned results page. Already-saved jobs reuse historical scores, and only brand-new jobs consume AI scoring."
                    />
                    <Input
                      id="drawer-limit"
                      type="number"
                      min="1"
                      max="25"
                      value={String(form.limit)}
                      onChange={(e: ChangeEvent<HTMLInputElement>) => update("limit", Math.max(1, Math.min(25, Number(e.target.value || 10))))}
                    />
                  </div>
                </div>

                {/* Filter summary + Advanced toggle */}
                <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                        {formatWorkplaceSummary(form.workplaceTypes)}
                      </span>
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                        {formatPostedSummary(form.postedWithin)}
                      </span>
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                        {formatSortSummary(form.sortBy)}
                      </span>
                      <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-600">
                        {`Scan ${form.pagesToScan} page${form.pagesToScan === 1 ? "" : "s"} from page ${form.page}`}
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowAdvanced((prev) => !prev)}
                      className="inline-flex shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
                    >
                      Advanced
                      <ChevronDown className={`h-4 w-4 transition ${showAdvanced ? "rotate-180" : ""}`} />
                    </button>
                  </div>
                </div>

                {/* Advanced panel */}
                {showAdvanced ? (
                  <div className="space-y-px overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">

                    <div className="border-b border-slate-100 p-4">
                      <p className="mb-0.5 text-xs font-semibold uppercase tracking-wider text-slate-400">Targeting</p>
                      <p className="mb-3 text-sm text-slate-500">Filter to a specific company before scraping begins.</p>
                      <Input
                        value={form.company}
                        onChange={(e: ChangeEvent<HTMLInputElement>) => update("company", e.target.value)}
                        placeholder="Company name (optional)"
                      />
                    </div>

                    <div className="border-b border-slate-100 p-4">
                      <p className="mb-0.5 text-xs font-semibold uppercase tracking-wider text-slate-400">Freshness & Ranking</p>
                      <p className="mb-3 text-sm text-slate-500">Control how recent results must be and how LinkedIn orders them.</p>
                      <div className="space-y-3">
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium text-slate-700" htmlFor="drawer-postedWithin">Posted Within</label>
                          <select
                            id="drawer-postedWithin"
                            value={form.postedWithin}
                            onChange={(e) => update("postedWithin", e.target.value as FormState["postedWithin"])}
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                          >
                            <option value="any">Any time</option>
                            <option value="24h">Last 24 hours</option>
                            <option value="7d">Last 7 days</option>
                            <option value="30d">Last 30 days</option>
                          </select>
                        </div>
                        <div className="space-y-1.5">
                          <label className="text-sm font-medium text-slate-700" htmlFor="drawer-sortBy">Sort Order</label>
                          <select
                            id="drawer-sortBy"
                            value={form.sortBy}
                            onChange={(e) => update("sortBy", e.target.value as FormState["sortBy"])}
                            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                          >
                            <option value="recent">Most recent</option>
                            <option value="relevant">Most relevant</option>
                          </select>
                        </div>
                      </div>
                    </div>

                    <div className="border-b border-slate-100 p-4">
                      <p className="mb-0.5 text-xs font-semibold uppercase tracking-wider text-slate-400">Salary & Application</p>
                      <p className="mb-3 text-sm text-slate-500">Set a salary floor and narrow to quick-apply listings.</p>
                      <div className="space-y-3">
                        <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
                          <div className="space-y-1.5">
                            <label className="text-sm font-medium text-slate-700" htmlFor="drawer-salaryMin">Minimum Salary</label>
                            <select
                              id="drawer-salaryMin"
                              value={form.salaryMin}
                              onChange={(e) => {
                                const val = e.target.value;
                                update("salaryMin", val);
                                if (val) {
                                  const numVal = Number(val);
                                  if (SALARY_BANDS[numVal]) {
                                    update("f_SAL", SALARY_BANDS[numVal]);
                                  }
                                } else {
                                  update("f_SAL", "");
                                }
                              }}
                              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                            >
                              <option value="">Any Salary</option>
                              <option value="40000">$40,000+</option>
                              <option value="60000">$60,000+</option>
                              <option value="80000">$80,000+</option>
                              <option value="100000">$100,000+</option>
                              <option value="120000">$120,000+</option>
                              <option value="140000">$140,000+</option>
                              <option value="160000">$160,000+</option>
                              <option value="180000">$180,000+</option>
                              <option value="200000">$200,000+</option>
                            </select>
                          </div>

                          <div className="space-y-1.5">
                            <FieldLabelWithInfo
                              htmlFor="drawer-f_SAL"
                              label="Salary Filter ID (f_SAL)"
                              tooltip="LinkedIn's salary filter query ID. Updated automatically when selecting a Minimum Salary."
                            />
                            <Input
                              id="drawer-f_SAL"
                              value={form.f_SAL}
                              onChange={(e: ChangeEvent<HTMLInputElement>) => update("f_SAL", e.target.value)}
                              placeholder="e.g. f_SA_id_226001:272015"
                            />
                          </div>
                        </div>

                        <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100">
                          <input
                            type="checkbox"
                            checked={form.easyApply}
                            onChange={(e) => update("easyApply", e.target.checked)}
                            className="h-4 w-4 rounded"
                          />
                          Easy Apply only
                        </label>
                      </div>
                    </div>

                    <div className="border-b border-slate-100 p-4">
                      <p className="mb-0.5 text-xs font-semibold uppercase tracking-wider text-slate-400">Page Coverage</p>
                      <p className="mb-3 text-sm text-slate-500">Choose which result pages to harvest.</p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <FieldLabelWithInfo
                            htmlFor="drawer-page"
                            label="Start Page"
                            tooltip="The first LinkedIn results page to scan. If you set Start Page to 5 and Pages To Scan to 3, the search will scan pages 5, 6, and 7."
                          />
                          <Input
                            id="drawer-page"
                            type="number"
                            min="1"
                            max="100"
                            value={String(form.page)}
                            onChange={(e: ChangeEvent<HTMLInputElement>) => update("page", Math.max(1, Number(e.target.value || 1)))}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <FieldLabelWithInfo
                            htmlFor="drawer-pagesToScan"
                            label="Pages to Scan"
                            tooltip="How many consecutive LinkedIn result pages to harvest starting from the Start Page."
                          />
                          <Input
                            id="drawer-pagesToScan"
                            type="number"
                            min="1"
                            max="10"
                            value={String(form.pagesToScan)}
                            onChange={(e: ChangeEvent<HTMLInputElement>) => update("pagesToScan", Math.max(1, Math.min(10, Number(e.target.value || 1))))}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="border-b border-slate-100 p-4">
                      <p className="mb-0.5 text-xs font-semibold uppercase tracking-wider text-slate-400">Role Preferences</p>
                      <p className="mb-3 text-sm text-slate-500">Narrow by work arrangement, seniority, and employment type.</p>
                      <div className="space-y-4">
                        <div>
                          <p className="mb-2 text-sm font-medium text-slate-700">Workplace Type</p>
                          <div className="space-y-2">
                            {workplaceOptions.map((option) => (
                              <label key={option.value} className="flex cursor-pointer items-center gap-3 text-sm text-slate-600">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 rounded"
                                  checked={form.workplaceTypes.includes(option.value)}
                                  onChange={() => update("workplaceTypes", toggleValue(form.workplaceTypes, option.value))}
                                />
                                {option.label}
                              </label>
                            ))}
                          </div>
                        </div>
                        <div className="border-t border-slate-100 pt-4">
                          <p className="mb-2 text-sm font-medium text-slate-700">Experience Level</p>
                          <div className="space-y-2">
                            {experienceOptions.map((option) => (
                              <label key={option.value} className="flex cursor-pointer items-center gap-3 text-sm text-slate-600">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 rounded"
                                  checked={form.experienceLevels.includes(option.value)}
                                  onChange={() => update("experienceLevels", toggleValue(form.experienceLevels, option.value))}
                                />
                                {option.label}
                              </label>
                            ))}
                          </div>
                        </div>
                        <div className="border-t border-slate-100 pt-4">
                          <p className="mb-2 text-sm font-medium text-slate-700">Job Type</p>
                          <div className="space-y-2">
                            {jobTypeOptions.map((option) => (
                              <label key={option.value} className="flex cursor-pointer items-center gap-3 text-sm text-slate-600">
                                <input
                                  type="checkbox"
                                  className="h-4 w-4 rounded"
                                  checked={form.jobTypes.includes(option.value)}
                                  onChange={() => update("jobTypes", toggleValue(form.jobTypes, option.value))}
                                />
                                {option.label}
                              </label>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="border-b border-slate-100 p-4">
                      <p className="mb-0.5 text-xs font-semibold uppercase tracking-wider text-slate-400">AI / Semantic Search Options</p>
                      <p className="mb-3 text-sm text-slate-500">Configure parameters for the new LinkedIn job search format.</p>
                      <div className="space-y-3">
                        <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100">
                          <input
                            type="checkbox"
                            checked={form.useSemanticFormat}
                            onChange={(e) => update("useSemanticFormat", e.target.checked)}
                            className="h-4 w-4 rounded"
                          />
                          Use AI Semantic URL format
                        </label>

                        <div className="space-y-1.5">
                          <FieldLabelWithInfo
                            htmlFor="drawer-distance"
                            label="Distance Radius (miles)"
                            tooltip="Distance/radius in miles around your chosen location for job suggestions."
                          />
                          <Input
                            id="drawer-distance"
                            type="number"
                            min="0"
                            value={form.distance}
                            onChange={(e: ChangeEvent<HTMLInputElement>) => update("distance", e.target.value)}
                            placeholder="e.g. 50"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="p-4">
                      <div className="mb-0.5 flex items-center gap-2">
                        <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">Discovery Strategy</p>
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-amber-700">
                          Advanced
                        </span>
                      </div>
                      <p className="mb-1 text-sm text-slate-500">Run several broader LinkedIn searches, then merge and narrow the pool locally.</p>
                      <p className="mb-3 text-xs font-medium text-amber-600">Takes longer — runs multiple LinkedIn searches before combining results.</p>
                      <div className="space-y-3">
                        <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded"
                            checked={broadenDiscovery}
                            onChange={(e) => setBroadenDiscovery(e.target.checked)}
                          />
                          Broaden search before local filtering
                        </label>
                        <div className="space-y-2">
                          {discoveryPresetOptions.map((preset) => {
                            const active = selectedPresets.includes(preset.value);
                            return (
                              <Tooltip key={preset.value}>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    onClick={() => togglePreset(preset.value)}
                                    className={`flex w-full items-center justify-between gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition ${
                                      active
                                        ? "border-sky-200 bg-sky-50 text-sky-700"
                                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                                    }`}
                                  >
                                    <span>{preset.label}</span>
                                    <CircleHelp className="h-4 w-4 shrink-0 opacity-50" />
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent className="max-w-xs text-xs leading-relaxed">
                                  {preset.description}
                                </TooltipContent>
                              </Tooltip>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                  </div>
                ) : null}
              </div>
            )}

            {/* Save name + action buttons */}
            <div className="space-y-2">
              <Input
                value={saveName}
                onChange={(e: ChangeEvent<HTMLInputElement>) => setSaveName(e.target.value)}
                placeholder={form.keywords.trim() || "Agent name (for saving)…"}
              />
              <div className="grid grid-cols-2 gap-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={saving || loading}
                  onClick={handleSaveSearch}
                  className="w-full"
                >
                  {saving ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving…
                    </span>
                  ) : (
                    "Save Agent"
                  )}
                </Button>
                <Button
                  type="submit"
                  disabled={loading || !hasResume}
                  className="w-full bg-amber-600 text-white hover:bg-amber-700 focus-visible:ring-amber-300"
                >
                  {loading ? (
                    <span className="inline-flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Searching…
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-2">
                      <Search className="h-4 w-4" />
                      Run Search
                    </span>
                  )}
                </Button>
              </div>
            </div>
          </form>

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
          ) : null}

          {/* Saved Searches */}
          <div className="border-t border-slate-200 pt-5">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">Search Agents</p>
            <div className="space-y-3">
              {savedSearches.length === 0 ? (
                <p className="text-sm text-slate-500">
                  No search agents yet. Enter a name and click "Save Agent" above to create one.
                </p>
              ) : (
                savedSearches.map((saved) => (
                  <div key={saved.id} className="rounded-xl border border-slate-200 bg-white/80 p-3">
                    <p className="text-sm font-semibold text-slate-900">{saved.name}</p>
                    <p className="text-xs text-slate-500">
                      {saved.criteria.keywords} · {saved.criteria.location || "No location"} · p{saved.criteria.page || 1} ×{" "}
                      {saved.criteria.pagesToScan || 1}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-1 flex flex-wrap gap-1">
                      {saved.sources.map(s => (
                        <span key={s} className="rounded bg-amber-50 border border-amber-100 px-1.5 py-0.5 font-medium text-amber-700 capitalize">
                          {s}
                        </span>
                      ))}
                    </p>
                    <p className="mt-1 text-[11px] text-slate-400">Last run {formatLastRunLocalTime(saved.lastRunAt)}</p>
                    <label className="mt-2 flex items-center gap-2 text-xs font-medium text-slate-600">
                      <input
                        type="checkbox"
                        checked={saved.isActive}
                        onChange={(e) => handleToggleSavedSearchCron(saved.id, e.target.checked)}
                      />
                      Active in cron
                      {saved.isActive && cronStartHour != null && cronFrequency && (
                        <span className="text-slate-400">
                          · {cronFrequency.replace(/_/g, " ")} from {formatCronLocalTime(cronStartHour)}
                        </span>
                      )}
                    </label>
                    <div className="mt-2 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void handleRunSavedSearch(saved)}
                        disabled={runningSearchId !== null || loading || saved.isRunning}
                        className="flex-1 rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-1.5 text-xs font-semibold text-indigo-700 transition hover:bg-indigo-100 disabled:opacity-50"
                      >
                        {runningSearchId === saved.id || saved.isRunning ? (
                          <span className="flex items-center justify-center gap-1">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Running
                          </span>
                        ) : (
                          "Run"
                        )}
                      </button>
                      <button
                        type="button"
                        onClick={() => loadSavedSearch(saved.id)}
                        className="flex-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50"
                      >
                        Load
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteSavedSearch(saved.id)}
                        className="rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 transition hover:bg-red-100"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
