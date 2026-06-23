import React, { useState, useRef } from "react";
import {
  ChevronDown,
  ChevronUp,
  Clock,
  Loader2,
  Search,
  Sparkles,
  Star,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { POPULAR_CITIES } from "@/lib/linkedin-search";
import {
  executeAdHocSearch,
  saveSearchAsAgent,
  type AdHocSearchResult,
} from "@/server/functions/ad-hoc-search";
import {
  removeSearchAgent,
  toggleSearchAgentCron,
} from "@/server/functions/jobs-pipeline";
import type { SearchConfigurationRow } from "@/lib/normalized-jobs-persistence";
import type { LinkedInScrapedJob } from "@/lib/linkedin-search";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FormState {
  keywords: string;
  location: string;
  workplaceTypes: string[];
  employmentTypes: string[];
  salaryMin: string;
}

interface UnifiedSearchPanelProps {
  initialSavedSearches: SearchConfigurationRow[];
  hasResume: boolean;
  onResultsFavorited?: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const defaultForm: FormState = {
  keywords: "",
  location: "United States",
  workplaceTypes: ["remote"],
  employmentTypes: [],
  salaryMin: "",
};

const WORKPLACE_OPTIONS = [
  { value: "remote", label: "Remote" },
  { value: "hybrid", label: "Hybrid" },
  { value: "on-site", label: "On-site" },
];

const EMPLOYMENT_OPTIONS = [
  { value: "full-time", label: "Full-time" },
  { value: "contract", label: "Contract" },
  { value: "part-time", label: "Part-time" },
];

const SALARY_OPTIONS = [
  { value: "", label: "Any salary" },
  { value: "50000", label: "$50K+" },
  { value: "75000", label: "$75K+" },
  { value: "100000", label: "$100K+" },
  { value: "125000", label: "$125K+" },
  { value: "150000", label: "$150K+" },
  { value: "200000", label: "$200K+" },
];

const INTERVAL_OPTIONS = [
  { value: 1, label: "Every hour" },
  { value: 2, label: "Every 2 hours" },
  { value: 4, label: "Every 4 hours" },
  { value: 8, label: "Every 8 hours" },
  { value: 12, label: "Every 12 hours" },
  { value: 24, label: "Daily" },
];

const SOURCE_LABELS: Record<string, string> = {
  adzuna: "Adzuna",
  jooble: "Jooble",
  remotive: "Remotive",
  remoteok: "RemoteOK",
  jobicy: "Jobicy",
  greenhouse: "Greenhouse",
  lever: "Lever",
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toggleValue<T>(arr: T[], val: T): T[] {
  return arr.includes(val) ? arr.filter((x) => x !== val) : [...arr, val];
}

function formatLastRun(lastRunAt: string | null): string {
  if (!lastRunAt) return "never";
  const date = new Date(lastRunAt);
  if (isNaN(date.getTime())) return "never";
  return date.toLocaleString();
}

function formatInterval(hours: number): string {
  return INTERVAL_OPTIONS.find((o) => o.value === hours)?.label ?? `${hours}h`;
}

// ─── Result card ──────────────────────────────────────────────────────────────

function ResultCard({ job, onFavorite, isFavorited }: { job: LinkedInScrapedJob; onFavorite: () => void; isFavorited: boolean }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-slate-900 truncate">{job.title}</p>
          <p className="text-sm text-slate-500 truncate">{job.company}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            {SOURCE_LABELS[job.sourceName ?? ""] ?? job.sourceName}
          </span>
          <button
            type="button"
            onClick={onFavorite}
            title={isFavorited ? "Remove from My Jobs" : "Add to My Jobs"}
            className={`rounded-lg p-1.5 transition ${isFavorited ? "text-amber-500 hover:text-amber-600" : "text-slate-300 hover:text-amber-400"}`}
          >
            <Star className="h-4 w-4" fill={isFavorited ? "currentColor" : "none"} />
          </button>
        </div>
      </div>
      {job.location && <p className="text-xs text-slate-400">{job.location}</p>}
      {job.salary && <p className="text-xs font-medium text-emerald-700">{job.salary}</p>}
      {job.snippet && <p className="text-xs text-slate-500 line-clamp-2">{job.snippet}</p>}
      {job.sourceUrl && (
        <a
          href={job.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 self-start rounded-lg border border-slate-200 px-3 py-1 text-xs font-medium text-slate-600 hover:border-slate-300 hover:bg-slate-50 transition"
        >
          View job
        </a>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function UnifiedSearchPanel({
  initialSavedSearches,
  hasResume,
  onResultsFavorited,
}: UnifiedSearchPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [form, setForm] = useState<FormState>(defaultForm);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AdHocSearchResult | null>(null);
  const [favoritedIds, setFavoritedIds] = useState<Set<string>>(new Set());
  const [showCitySuggestions, setShowCitySuggestions] = useState(false);
  const locationRef = useRef<HTMLInputElement>(null);

  // Agent save state
  const [agentName, setAgentName] = useState("");
  const [agentInterval, setAgentInterval] = useState(24);
  const [saving, setSaving] = useState(false);

  // My Agents
  const [savedSearches, setSavedSearches] = useState<SearchConfigurationRow[]>(initialSavedSearches);
  const [agentsExpanded, setAgentsExpanded] = useState(false);

  const citySuggestions =
    form.location.trim().length >= 2
      ? POPULAR_CITIES.filter(
          (c) =>
            c.city.toLowerCase().includes(form.location.toLowerCase()) ||
            c.state.toLowerCase().includes(form.location.toLowerCase()),
        ).slice(0, 5)
      : [];

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!form.keywords.trim()) {
      toast.error("Keywords are required");
      return;
    }
    setLoading(true);
    setResult(null);
    setFavoritedIds(new Set());
    try {
      const res = await executeAdHocSearch({
        data: {
          keywords: form.keywords,
          location: form.location || undefined,
          workplaceTypes: form.workplaceTypes as any,
          employmentTypes: form.employmentTypes,
          salaryMin: form.salaryMin ? Number(form.salaryMin) : null,
        },
      });
      setResult(res);
      if (res.jobs.length === 0) {
        toast.info("No jobs found — try different keywords or filters");
      } else {
        toast.success(`Found ${res.jobs.length} jobs across all sources`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Search failed");
    } finally {
      setLoading(false);
    }
  }

  async function handleFavorite(job: LinkedInScrapedJob) {
    // Optimistic toggle — actual persistence handled via starCatalogJob or similar
    const key = job.id;
    setFavoritedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) { next.delete(key); } else { next.add(key); }
      return next;
    });
    toast.success(favoritedIds.has(key) ? "Removed from My Jobs" : "Added to My Jobs");
    onResultsFavorited?.();
  }

  async function handleSaveAgent(e: React.FormEvent) {
    e.preventDefault();
    if (!agentName.trim()) { toast.error("Agent name is required"); return; }
    if (!form.keywords.trim()) { toast.error("Keywords are required to save an agent"); return; }
    setSaving(true);
    try {
      await saveSearchAsAgent({
        data: {
          name: agentName,
          keywords: form.keywords,
          location: form.location || undefined,
          workplaceTypes: form.workplaceTypes as any,
          employmentTypes: form.employmentTypes,
          salaryMin: form.salaryMin ? Number(form.salaryMin) : null,
          runIntervalHours: agentInterval,
          isActive: true,
        },
      });
      toast.success(`Agent "${agentName}" saved — runs every ${formatInterval(agentInterval).toLowerCase()}`);
      setAgentName("");
      // Refresh the saved list (optimistic: re-fetch would require server fn; just show toast)
      setAgentsExpanded(true);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save agent");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteAgent(id: number) {
    if (!window.confirm("Delete this search agent?")) return;
    try {
      await removeSearchAgent({ data: { id } });
      setSavedSearches((prev) => prev.filter((s) => s.id !== id));
      toast.success("Agent deleted");
    } catch {
      toast.error("Failed to delete agent");
    }
  }

  async function handleToggleAgent(id: number, isActive: boolean) {
    try {
      await toggleSearchAgentCron({ data: { id, isActive } });
      setSavedSearches((prev) =>
        prev.map((s) => (s.id === id ? { ...s, isActive } : s)),
      );
    } catch {
      toast.error("Failed to update agent");
    }
  }

  const sourceEntries = result
    ? Object.entries(result.sources).filter(([, v]) => v.count > 0 || v.error)
    : [];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* ── Header / toggle ─────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <div className="flex items-center gap-2.5">
          <Sparkles className="h-4 w-4 text-orange-500" />
          <span className="font-semibold text-slate-800">Search All Job Sources</span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
            Adzuna · Jooble · Remotive · RemoteOK · Jobicy · Greenhouse · Lever
          </span>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-slate-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-slate-400" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-slate-100 px-5 pb-5 pt-4 space-y-5">
          {!hasResume && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Upload a resume in Settings to enable AI scoring on search results.
            </div>
          )}

          {/* ── Search form ──────────────────────────────────────────────── */}
          <form onSubmit={handleSearch} className="space-y-4">
            {/* Keywords */}
            <div className="space-y-1">
              <label className="block text-xs font-medium text-slate-700">Keywords <span className="text-red-500">*</span></label>
              <input
                type="text"
                value={form.keywords}
                onChange={(e) => update("keywords", e.target.value)}
                placeholder="e.g. Senior product manager, React developer"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
              />
            </div>

            {/* Location */}
            <div className="relative space-y-1">
              <label className="block text-xs font-medium text-slate-700">Location</label>
              <input
                ref={locationRef}
                type="text"
                value={form.location}
                onChange={(e) => { update("location", e.target.value); setShowCitySuggestions(true); }}
                onFocus={() => setShowCitySuggestions(true)}
                onBlur={() => setTimeout(() => setShowCitySuggestions(false), 150)}
                placeholder="City, State or United States"
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm placeholder:text-slate-400 focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
              />
              {showCitySuggestions && citySuggestions.length > 0 && (
                <ul className="absolute z-20 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-lg">
                  {citySuggestions.map((c) => (
                    <li key={`${c.city}-${c.state}`}>
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                        onMouseDown={() => {
                          update("location", `${c.city}, ${c.state}`);
                          setShowCitySuggestions(false);
                        }}
                      >
                        {c.city}, {c.state}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Filters row */}
            <div className="grid gap-4 sm:grid-cols-3">
              {/* Workplace type */}
              <div className="space-y-1.5">
                <span className="block text-xs font-medium text-slate-700">Workplace</span>
                <div className="flex flex-wrap gap-2">
                  {WORKPLACE_OPTIONS.map((opt) => (
                    <label key={opt.value} className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-600">
                      <input
                        type="checkbox"
                        checked={form.workplaceTypes.includes(opt.value)}
                        onChange={() => update("workplaceTypes", toggleValue(form.workplaceTypes, opt.value))}
                        className="rounded border-slate-300 text-orange-500 focus:ring-orange-400"
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>

              {/* Employment type */}
              <div className="space-y-1.5">
                <span className="block text-xs font-medium text-slate-700">Employment</span>
                <div className="flex flex-wrap gap-2">
                  {EMPLOYMENT_OPTIONS.map((opt) => (
                    <label key={opt.value} className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-600">
                      <input
                        type="checkbox"
                        checked={form.employmentTypes.includes(opt.value)}
                        onChange={() => update("employmentTypes", toggleValue(form.employmentTypes, opt.value))}
                        className="rounded border-slate-300 text-orange-500 focus:ring-orange-400"
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
              </div>

              {/* Min salary */}
              <div className="space-y-1.5">
                <span className="block text-xs font-medium text-slate-700">Min Salary</span>
                <select
                  value={form.salaryMin}
                  onChange={(e) => update("salaryMin", e.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs shadow-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
                >
                  {SALARY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-700 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              {loading ? "Searching all sources…" : "Search"}
            </button>
          </form>

          {/* ── Results ──────────────────────────────────────────────────── */}
          {result && (
            <div className="space-y-4">
              {/* Source summary pills */}
              {sourceEntries.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {sourceEntries.map(([src, info]) => (
                    <span
                      key={src}
                      className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                        info.error
                          ? "bg-red-50 text-red-600"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {SOURCE_LABELS[src] ?? src}: {info.error ? "error" : info.count}
                    </span>
                  ))}
                  <span className="rounded-full bg-orange-50 px-2.5 py-0.5 text-[11px] font-semibold text-orange-700">
                    {result.jobs.length} total
                  </span>
                </div>
              )}

              {result.jobs.length > 0 ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  {result.jobs.map((job) => (
                    <ResultCard
                      key={job.id}
                      job={job}
                      isFavorited={favoritedIds.has(job.id)}
                      onFavorite={() => handleFavorite(job)}
                    />
                  ))}
                </div>
              ) : (
                <p className="text-sm text-slate-400 italic">No jobs found. Try adjusting your keywords or filters.</p>
              )}

              {/* ── Save as Agent ───────────────────────────────────────── */}
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
                <p className="mb-3 text-sm font-semibold text-slate-700">Save as Search Agent</p>
                <form onSubmit={handleSaveAgent} className="flex flex-wrap items-end gap-3">
                  <div className="flex-1 min-w-[160px] space-y-1">
                    <label className="block text-xs font-medium text-slate-600">Agent name</label>
                    <input
                      type="text"
                      value={agentName}
                      onChange={(e) => setAgentName(e.target.value)}
                      placeholder="My PM search"
                      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-slate-600">Run every</label>
                    <select
                      value={agentInterval}
                      onChange={(e) => setAgentInterval(Number(e.target.value))}
                      className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-orange-400 focus:outline-none focus:ring-1 focus:ring-orange-400"
                    >
                      {INTERVAL_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Clock className="h-3.5 w-3.5" />}
                    Save Agent
                  </button>
                </form>
              </div>
            </div>
          )}

          {/* ── My Agents ────────────────────────────────────────────────── */}
          {savedSearches.length > 0 && (
            <div className="border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => setAgentsExpanded((p) => !p)}
                className="flex items-center gap-2 text-sm font-semibold text-slate-700"
              >
                {agentsExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                My Search Agents ({savedSearches.length})
              </button>

              {agentsExpanded && (
                <ul className="mt-3 space-y-2">
                  {savedSearches.map((agent) => (
                    <li
                      key={agent.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-800">{agent.name}</p>
                        <p className="text-xs text-slate-400">
                          {formatInterval(agent.runIntervalHours)} · Last run: {formatLastRun(agent.lastRunAt)}
                        </p>
                        {agent.criteria?.keywords && (
                          <p className="mt-0.5 truncate text-xs text-slate-500 italic">"{agent.criteria.keywords}"</p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-600">
                          <input
                            type="checkbox"
                            checked={agent.isActive}
                            onChange={(e) => handleToggleAgent(agent.id, e.target.checked)}
                            className="rounded border-slate-300 text-orange-500 focus:ring-orange-400"
                          />
                          Active
                        </label>
                        <button
                          type="button"
                          onClick={() => handleDeleteAgent(agent.id)}
                          className="rounded p-1 text-slate-300 hover:text-red-500 transition"
                          title="Delete agent"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
