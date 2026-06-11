import { type ChangeEvent, type FormEvent, useState } from "react";
import {
  Button,
  Input,
  Sheet,
  SheetContent,
  SheetTitle,
} from "@caliber/ui-kit";
import { Loader2, Search } from "lucide-react";
import type { SearchConfigurationRow } from "@/lib/normalized-jobs-persistence";
import {
  removeSearchAgent,
  toggleSearchAgentCron,
} from "@/server/functions/jobs-pipeline";
import {
  AD_HOC_SOURCES,
  type AdHocSource,
  executeAdHocSearch,
  saveSearchAsAgent,
} from "@/server/functions/ad-hoc-search";
import { POPULAR_CITIES, SALARY_BANDS } from "@/lib/linkedin-search";
import { useSearchStatusContext } from "@/hooks/useSearchStatus";

// ─── Types ────────────────────────────────────────────────────────────────────

type FormState = {
  keywords: string;
  location: string;
  salaryMin: string;
  workplaceTypes: string[];
  sources: AdHocSource[];
};

export interface AgentsSearchDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hasResume: boolean;
  fullName: string | null;
  initialSavedSearches: SearchConfigurationRow[];
  cronStartHour?: number | null;
  cronFrequency?: string | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const defaultForm: FormState = {
  keywords: "",
  location: "United States",
  salaryMin: "",
  workplaceTypes: ["remote"],
  sources: ["adzuna", "greenhouse", "lever"],
};

const workplaceOptions = [
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "on-site", label: "On-site" },
];

const sourceOptions: Array<{ value: AdHocSource; label: string }> = [
  { value: "adzuna", label: "Adzuna" },
  { value: "jooble", label: "Jooble" },
  { value: "remotive", label: "Remotive" },
  { value: "greenhouse", label: "Greenhouse" },
  { value: "lever", label: "Lever" },
];

// ─── Utilities ────────────────────────────────────────────────────────────────

function toggleValue<T>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function formatCronLocalTime(utcHour: number): string {
  const d = new Date();
  d.setUTCHours(utcHour, 0, 0, 0);
  return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function formatLastRunLocalTime(lastRunAt: string | null): string {
  if (!lastRunAt) return "never";
  const date = new Date(lastRunAt);
  if (isNaN(date.getTime())) return "never";
  return date.toLocaleString();
}

// ─── Main component ───────────────────────────────────────────────────────────

export function AgentsSearchDrawer({
  open,
  onOpenChange,
  hasResume,
  fullName: _fullName,
  initialSavedSearches,
  cronStartHour,
  cronFrequency,
}: AgentsSearchDrawerProps) {
  const searchStatusContext = useSearchStatusContext();
  const [form, setForm] = useState<FormState>(defaultForm);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveName, setSaveName] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedSearches, setSavedSearches] = useState(initialSavedSearches);
  const [activeSavedSearchId, setActiveSavedSearchId] = useState<number | null>(null);
  const [showCitySuggestions, setShowCitySuggestions] = useState(false);
  const [previewJobCount, setPreviewJobCount] = useState<number | null>(null);

  const citySuggestions = form.location.trim().length >= 2
    ? POPULAR_CITIES.filter((c) =>
        c.city.toLowerCase().includes(form.location.toLowerCase()) ||
        c.state.toLowerCase().includes(form.location.toLowerCase())
      ).slice(0, 5)
    : [];

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    setPreviewJobCount(null);

    const searchId = `search-${Date.now()}`;
    searchStatusContext.startSearch(searchId, `Searching for "${form.keywords}"...`);

    try {
      const result = await executeAdHocSearch({
        data: {
          keywords: form.keywords,
          location: form.location,
          salaryMin: form.salaryMin ? Number(form.salaryMin) : null,
          workplaceTypes: form.workplaceTypes as never,
          sources: form.sources,
        },
      });
      setPreviewJobCount(result.jobs.length);
      searchStatusContext.setJobsFound(searchId, result.jobs.length);
      searchStatusContext.updateSearch(searchId, "completed", `Found ${result.jobs.length} job${result.jobs.length !== 1 ? "s" : ""}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Search failed.";
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
      const result = await saveSearchAsAgent({
        data: {
          id: activeSavedSearchId ?? undefined,
          name,
          keywords: form.keywords,
          location: form.location,
          sources: form.sources,
        },
      });
      if (result.id) {
        setActiveSavedSearchId(result.id);
        setSavedSearches((prev) => {
          const existing = prev.find((s) => s.id === result.id);
          const next: SearchConfigurationRow = {
            id: result.id!,
            userId: existing?.userId ?? "",
            name,
            criteria: { keywords: form.keywords, location: form.location },
            isActive: existing?.isActive ?? true,
            runIntervalHours: existing?.runIntervalHours ?? 24,
            sources: form.sources,
            lastRunAt: existing?.lastRunAt ?? null,
            createdAt: existing?.createdAt ?? new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            isRunning: existing?.isRunning ?? false,
          };
          if (existing) return prev.map((s) => (s.id === result.id ? next : s));
          return [next, ...prev];
        });
      }
      setSaveName("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save search.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteSavedSearch(id: number) {
    await removeSearchAgent({ data: { id } });
    setSavedSearches((prev) => prev.filter((s) => s.id !== id));
    if (activeSavedSearchId === id) setActiveSavedSearchId(null);
  }

  async function handleToggleSavedSearchCron(id: number, isActive: boolean) {
    await toggleSearchAgentCron({ data: { id, isActive } });
    setSavedSearches((prev) => prev.map((s) => (s.id === id ? { ...s, isActive } : s)));
  }

  function loadSavedSearch(id: number) {
    const saved = savedSearches.find((s) => s.id === id);
    if (!saved) return;
    setActiveSavedSearchId(saved.id);
    const criteria = saved.criteria as { keywords?: string; location?: string };
    setForm({
      ...defaultForm,
      keywords: criteria.keywords || "",
      location: criteria.location || "",
      sources: (saved.sources as AdHocSource[]).filter((s) => AD_HOC_SOURCES.includes(s)),
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

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="relative space-y-1.5">
                    <label className="text-sm font-semibold text-slate-800" htmlFor="drawer-location">Location</label>
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
                              update("location", `${suggestion.city}, ${suggestion.state}`);
                              setShowCitySuggestions(false);
                            }}
                            className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 transition"
                          >
                            <span className="font-medium">
                              {suggestion.city}, {suggestion.state}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-semibold text-slate-800" htmlFor="drawer-salaryMin">Minimum Salary</label>
                    <select
                      id="drawer-salaryMin"
                      value={form.salaryMin}
                      onChange={(e) => update("salaryMin", e.target.value)}
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 h-[40px] focus:border-amber-500 focus:outline-none"
                    >
                      <option value="">Any Salary</option>
                      {Object.keys(SALARY_BANDS).map((amount) => (
                        <option key={amount} value={amount}>
                          ${Number(amount).toLocaleString()}+
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-800">Workplace Type</label>
                  <div className="flex gap-4 pt-1">
                    {workplaceOptions.map((option) => (
                      <label key={option.value} className="flex cursor-pointer items-center gap-2 text-sm text-slate-600 hover:text-slate-900">
                        <input
                          type="checkbox"
                          checked={form.workplaceTypes.includes(option.value)}
                          onChange={() => update("workplaceTypes", toggleValue(form.workplaceTypes, option.value))}
                          className="h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                        />
                        {option.label}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            {/* Sources */}
            <div className="rounded-xl border border-amber-200 bg-amber-500/5 p-4 space-y-4">
              <p className="text-sm font-semibold text-amber-900 flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                Search Sources
              </p>

              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">Target Sources</label>
                <div className="flex flex-col gap-2 pt-1">
                  {sourceOptions.map((src) => (
                    <label key={src.value} className="flex cursor-pointer items-center gap-2.5 text-sm text-slate-600 hover:text-slate-900">
                      <input
                        type="checkbox"
                        checked={form.sources.includes(src.value)}
                        onChange={() => update("sources", toggleValue(form.sources, src.value))}
                        className="h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                      />
                      {src.label}
                    </label>
                  ))}
                </div>
              </div>
            </div>

            {previewJobCount !== null && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
                Found {previewJobCount} job{previewJobCount !== 1 ? "s" : ""}. Use Quick Search on the main page to view results, or save this as a scheduled agent below.
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
                      Test Search
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
                savedSearches.map((saved) => {
                  const criteria = saved.criteria as { keywords?: string; location?: string };
                  return (
                    <div key={saved.id} className="rounded-xl border border-slate-200 bg-white/80 p-3">
                      <p className="text-sm font-semibold text-slate-900">{saved.name}</p>
                      <p className="text-xs text-slate-500">
                        {criteria.keywords} · {criteria.location || "No location"}
                      </p>
                      <p className="text-[11px] text-slate-500 mt-1 flex flex-wrap gap-1">
                        {saved.sources.map((s) => (
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
                  );
                })
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
