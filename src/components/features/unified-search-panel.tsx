import React, { useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  Clock,
  Loader2,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import {
  saveSearchAsAgent,
} from "@/server/functions/ad-hoc-search";
import {
  removeSearchAgent,
  toggleSearchAgentCron,
} from "@/server/functions/jobs-pipeline";
import type { SearchConfigurationRow } from "@/lib/normalized-jobs-persistence";
import type { CatalogFilters } from "@/hooks/useCatalogQuery";

// ─── Types ────────────────────────────────────────────────────────────────────

interface UnifiedSearchPanelProps {
  initialSavedSearches: SearchConfigurationRow[];
  hasResume: boolean;
  /** Current catalog filters — used to pre-fill the "save as agent" form */
  activeFilters?: CatalogFilters;
  onResultsFavorited?: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const INTERVAL_OPTIONS = [
  { value: 1, label: "Every hour" },
  { value: 2, label: "Every 2 hours" },
  { value: 4, label: "Every 4 hours" },
  { value: 8, label: "Every 8 hours" },
  { value: 12, label: "Every 12 hours" },
  { value: 24, label: "Daily" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatLastRun(lastRunAt: string | null): string {
  if (!lastRunAt) return "never";
  const date = new Date(lastRunAt);
  if (isNaN(date.getTime())) return "never";
  return date.toLocaleString();
}

function formatInterval(hours: number): string {
  return INTERVAL_OPTIONS.find((o) => o.value === hours)?.label ?? `${hours}h`;
}

// ─── Main component ───────────────────────────────────────────────────────────

export function UnifiedSearchPanel({
  initialSavedSearches,
  hasResume: _hasResume,
  activeFilters,
  onResultsFavorited: _onResultsFavorited,
}: UnifiedSearchPanelProps) {
  const [expanded, setExpanded] = useState(false);
  const [agentName, setAgentName] = useState("");
  const [agentInterval, setAgentInterval] = useState(24);
  const [saving, setSaving] = useState(false);
  const [savedSearches, setSavedSearches] = useState<SearchConfigurationRow[]>(initialSavedSearches);
  const [agentsExpanded, setAgentsExpanded] = useState(false);

  async function handleSaveAgent(e: React.FormEvent) {
    e.preventDefault();
    if (!agentName.trim()) { toast.error("Agent name is required"); return; }
    const keywords = activeFilters?.query?.trim() ?? "";
    if (!keywords) { toast.error("Enter search keywords in the search bar first"); return; }
    setSaving(true);
    try {
      await saveSearchAsAgent({
        data: {
          name: agentName,
          keywords,
          location: activeFilters?.location || undefined,
          workplaceTypes: activeFilters?.remote === true ? ["remote"] : activeFilters?.remote === false ? ["on-site"] : [],
          employmentTypes: [],
          salaryMin: activeFilters?.salaryMin ? activeFilters.salaryMin : null,
          runIntervalHours: agentInterval,
          isActive: true,
        },
      });
      toast.success(`Agent "${agentName}" saved — runs ${formatInterval(agentInterval).toLowerCase()}`);
      setAgentName("");
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

  const hasKeywords = (activeFilters?.query?.trim() ?? "").length > 0;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* ── Header / toggle ───────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setExpanded((p) => !p)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
      >
        <div className="flex items-center gap-2.5">
          <Clock className="h-4 w-4 text-slate-500" />
          <span className="font-semibold text-slate-800">Search Agents</span>
          {savedSearches.length > 0 && (
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
              {savedSearches.length} active
            </span>
          )}
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-slate-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-slate-400" />
        )}
      </button>

      {expanded && (
        <div className="border-t border-slate-100 px-5 pb-5 pt-4 space-y-5">
          {/* ── Save as Agent ──────────────────────────────────────────────── */}
          <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4">
            <p className="mb-1 text-sm font-semibold text-slate-700">Save current search as agent</p>
            {!hasKeywords && (
              <p className="mb-3 text-xs text-slate-400 italic">
                Enter keywords in the search bar above, then save here to run automatically.
              </p>
            )}
            {hasKeywords && (
              <p className="mb-3 text-xs text-slate-500">
                Will search for <span className="font-semibold text-slate-700">"{activeFilters?.query}"</span>
                {activeFilters?.location ? ` in ${activeFilters.location}` : ""}
                {activeFilters?.remote === true ? " · remote" : activeFilters?.remote === false ? " · on-site" : ""}
                {activeFilters?.salaryMin ? ` · $${(activeFilters.salaryMin / 1000).toFixed(0)}K+` : ""}
              </p>
            )}
            <form onSubmit={handleSaveAgent} className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[160px] space-y-1">
                <label className="block text-xs font-medium text-slate-600">Agent name</label>
                <input
                  type="text"
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  placeholder="My PM search"
                  className="w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-slate-600">Run every</label>
                <select
                  value={agentInterval}
                  onChange={(e) => setAgentInterval(Number(e.target.value))}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-indigo-400 focus:outline-none focus:ring-1 focus:ring-indigo-400"
                >
                  {INTERVAL_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <button
                type="submit"
                disabled={saving || !hasKeywords}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Clock className="h-3.5 w-3.5" />}
                Save Agent
              </button>
            </form>
          </div>

          {/* ── My Agents ─────────────────────────────────────────────────── */}
          {savedSearches.length > 0 && (
            <div>
              <button
                type="button"
                onClick={() => setAgentsExpanded((p) => !p)}
                className="flex items-center gap-2 text-sm font-semibold text-slate-700"
              >
                {agentsExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                My Agents ({savedSearches.length})
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
                          <p className="mt-0.5 truncate text-xs text-slate-500 italic">
                            "{agent.criteria.keywords}"
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-600">
                          <input
                            type="checkbox"
                            checked={agent.isActive}
                            onChange={(e) => handleToggleAgent(agent.id, e.target.checked)}
                            className="rounded border-slate-300 text-indigo-500 focus:ring-indigo-400"
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
