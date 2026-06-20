import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHero, PageSection } from "@spearyx/ui-kit";
import { Bot, Play, Trash2, Plus, Power, Loader2, Sparkles } from "lucide-react";
import {
  listSearchAgents,
  createSearchAgent,
  deleteSearchAgent,
  toggleSearchAgent,
  runSearchAgentNow,
  type SearchAgentView,
} from "@/server/functions/search-agents";

export const Route = createFileRoute("/search-agents")({
  beforeLoad: ({ context }) => {
    const ctx = context as { user?: { id: number } | null };
    if (!ctx.user) throw redirect({ to: "/login" });
  },
  component: SearchAgentsPage,
});

function summarizeCriteria(raw: string): string {
  try {
    const c = JSON.parse(raw);
    const parts: string[] = [];
    if (c.keywords) parts.push(`"${c.keywords}"`);
    if (Array.isArray(c.titles) && c.titles.length) parts.push(c.titles.join(", "));
    if (c.location) parts.push(c.location);
    if (c.remotePreference && c.remotePreference !== "any") parts.push(c.remotePreference);
    if (c.salaryMin) parts.push(`≥ $${Number(c.salaryMin).toLocaleString()}`);
    return parts.join(" · ") || "Any role";
  } catch {
    return raw.slice(0, 80);
  }
}

function SearchAgentsPage() {
  const [agents, setAgents] = useState<SearchAgentView[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  // Create form
  const [name, setName] = useState("");
  const [keywords, setKeywords] = useState("");
  const [location, setLocation] = useState("");
  const [remotePreference, setRemotePreference] = useState("any");
  const [salaryMin, setSalaryMin] = useState("");
  const [threshold, setThreshold] = useState(75);
  const [creating, setCreating] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      setAgents(await listSearchAgents());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load agents");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    setMessage("");
    setCreating(true);
    try {
      const criteria = JSON.stringify({
        keywords: keywords.trim() || undefined,
        location: location.trim() || undefined,
        remotePreference,
        salaryMin: salaryMin ? Number(salaryMin) : undefined,
      });
      await createSearchAgent({ data: { name: name.trim() || keywords.trim() || "Untitled agent", criteria, autoFavoriteThreshold: threshold } });
      setName(""); setKeywords(""); setLocation(""); setRemotePreference("any"); setSalaryMin(""); setThreshold(75);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create agent");
    } finally {
      setCreating(false);
    }
  }

  async function handleRun(id: number) {
    setBusyId(id); setError(""); setMessage("");
    try {
      const res = await runSearchAgentNow({ data: { id } });
      setMessage(`Agent run complete: ${res.scored} jobs scored, ${res.autoFavorited} auto-favorited.`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to run agent");
    } finally {
      setBusyId(null);
    }
  }

  async function handleToggle(agent: SearchAgentView) {
    setBusyId(agent.id);
    try {
      await toggleSearchAgent({ data: { id: agent.id, isActive: !agent.isActive } });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to toggle agent");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(id: number) {
    if (!window.confirm("Delete this search agent? Saved jobs it found will remain in My Jobs.")) return;
    setBusyId(id);
    try {
      await deleteSearchAgent({ data: { id } });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete agent");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="spx-page spx-stack">
      <PageHero
        eyebrow="Automated Discovery"
        icon={<Bot className="h-3.5 w-3.5" />}
        title="Search Agents"
        description="Agents query the unified jobs database (fed by the discovery & crawler agents), score matches against your resume, and auto-favorite the strongest into My Jobs."
      />

      <PageSection>
        {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>}
        {message && <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-700">{message}</div>}

        {/* Create form */}
        <form onSubmit={handleCreate} className="mb-8 rounded-2xl border border-slate-200 bg-white p-5">
          <h2 className="mb-4 flex items-center gap-2 text-sm font-bold text-slate-900">
            <Plus size={15} className="text-primary-600" /> New Search Agent
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
              Name
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Senior PM roles"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900" />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
              Keywords
              <input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="product manager"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900" />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
              Location
              <input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="United States"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900" />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
              Remote
              <select value={remotePreference} onChange={(e) => setRemotePreference(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900">
                <option value="any">Any</option>
                <option value="remote">Remote</option>
                <option value="hybrid">Hybrid</option>
                <option value="onsite">On-site</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
              Min salary
              <input value={salaryMin} onChange={(e) => setSalaryMin(e.target.value)} type="number" placeholder="120000"
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-normal text-slate-900" />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-slate-600">
              Auto-favorite at score ≥ {threshold}
              <input value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} type="range" min={50} max={95} step={5}
                className="mt-2" />
            </label>
          </div>
          <button type="submit" disabled={creating}
            className="mt-4 inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-700 disabled:opacity-50">
            {creating ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
            Create Agent
          </button>
        </form>

        {/* Agents list */}
        {loading ? (
          <div className="flex items-center justify-center py-12 text-slate-400">
            <Loader2 className="animate-spin" size={28} />
          </div>
        ) : agents.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 py-12 text-center">
            <Bot size={42} className="mx-auto mb-3 text-slate-300" />
            <p className="text-sm text-slate-500">No search agents yet. Create one above to start auto-collecting matches.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {agents.map((agent) => (
              <div key={agent.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900">{agent.name}</span>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${agent.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
                      {agent.isActive ? "Active" : "Paused"}
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-700">
                      <Sparkles size={10} /> {agent.matchCount} matches
                    </span>
                  </div>
                  <p className="mt-1 truncate text-xs text-slate-500">{summarizeCriteria(agent.criteria)}</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    Auto-favorite ≥ {agent.autoFavoriteThreshold} · {agent.lastRunAt ? `Last run ${new Date(agent.lastRunAt).toLocaleString()}` : "Never run"}
                  </p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button onClick={() => handleRun(agent.id)} disabled={busyId === agent.id}
                    className="inline-flex items-center gap-1 rounded-lg bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-700 transition hover:bg-violet-100 disabled:opacity-50">
                    {busyId === agent.id ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
                    Run now
                  </button>
                  <button onClick={() => handleToggle(agent)} disabled={busyId === agent.id}
                    title={agent.isActive ? "Pause" : "Activate"}
                    className="inline-flex items-center rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50">
                    <Power size={13} />
                  </button>
                  <button onClick={() => handleDelete(agent.id)} disabled={busyId === agent.id}
                    className="inline-flex items-center rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-600 transition hover:bg-red-50 disabled:opacity-50">
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </PageSection>
    </div>
  );
}
