import { useState, useEffect } from "react";
import { Sparkles, RefreshCw, Loader2, ChevronRight } from "lucide-react";
import { loadUserProfile } from "./SkillsModal";
import type { JobWithCategory } from "../../lib/search-utils";
import JobCard from "../JobCard";

const CACHE_KEY = "spearyx_unicorn_cache";
const CACHE_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

interface UnicornCache {
  timestamp: number;
  jobs: JobWithCategory[];
  queries: string[];
}

interface UnicornJobsProps {
  onJobClick?: (job: JobWithCategory) => void;
  onCompanyClick?: (company: string) => void;
  onOpenSkillsModal?: () => void;
}

function loadCache(): UnicornCache | null {
  if (typeof window === "undefined") return null;
  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) return null;
    const data = JSON.parse(cached) as UnicornCache;
    if (Date.now() - data.timestamp > CACHE_DURATION_MS) return null;
    return data;
  } catch {
    return null;
  }
}

function saveCache(jobs: JobWithCategory[], queries: string[]) {
  if (typeof window === "undefined") return;
  const cache: UnicornCache = { timestamp: Date.now(), jobs, queries };
  localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
}

export default function UnicornJobs({ onJobClick, onCompanyClick, onOpenSkillsModal }: UnicornJobsProps) {
  const [state, setState] = useState<
    | { status: "idle" }
    | { status: "no-profile" }
    | { status: "loading" }
    | { status: "success"; jobs: JobWithCategory[]; queries: string[] }
    | { status: "error"; message: string }
  >({ status: "idle" });
  const [isRefreshing, setIsRefreshing] = useState(false);

  const fetchUnicorns = async (forceRefresh = false) => {
    const profile = loadUserProfile();
    
    if (!profile || (!profile.resume && profile.skills.length === 0)) {
      setState({ status: "no-profile" });
      return;
    }

    // Check cache first (unless forcing refresh)
    if (!forceRefresh) {
      const cached = loadCache();
      if (cached && cached.jobs.length > 0) {
        setState({ status: "success", jobs: cached.jobs, queries: cached.queries });
        return;
      }
    }

    setState({ status: "loading" });
    if (forceRefresh) setIsRefreshing(true);

    try {
      const response = await fetch("/api/ai/unicorn", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resume: profile.resume,
          skills: profile.skills,
        }),
      });

      if (!response.ok) throw new Error("Failed to fetch");

      const result = await response.json() as {
        success: boolean;
        data?: { jobs: JobWithCategory[]; queries: string[] };
        error?: string;
      };

      if (result.success && result.data) {
        saveCache(result.data.jobs, result.data.queries);
        setState({ status: "success", jobs: result.data.jobs, queries: result.data.queries });
      } else {
        throw new Error(result.error || "Unknown error");
      }
    } catch (error) {
      setState({
        status: "error",
        message: error instanceof Error ? error.message : "Failed to find unicorns",
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  // Auto-fetch on mount
  useEffect(() => {
    fetchUnicorns();
  }, []);

  // No profile state - prompt to add skills
  if (state.status === "no-profile") {
    return (
      <div className="mb-8 p-6 bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl border border-amber-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-amber-100 rounded-lg">
              <Sparkles className="text-amber-600" size={24} />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900">🦄 Discover Hidden Gem Jobs</h3>
              <p className="text-sm text-slate-600">Add your resume to find jobs you'd be great for but wouldn't search</p>
            </div>
          </div>
          <button
            onClick={onOpenSkillsModal}
            className="px-4 py-2 bg-amber-500 text-white rounded-lg text-sm font-medium hover:bg-amber-600 transition-colors flex items-center gap-1"
          >
            Add Resume
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    );
  }

  // Loading state
  if (state.status === "loading" || state.status === "idle") {
    return (
      <div className="mb-8 p-6 bg-gradient-to-r from-amber-50 to-orange-50 rounded-xl border border-amber-200">
        <div className="flex items-center gap-3">
          <Loader2 className="animate-spin text-amber-600" size={24} />
          <span className="text-amber-700 font-medium">Finding your hidden gem jobs...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (state.status === "error") {
    return (
      <div className="mb-8 p-4 bg-red-50 rounded-xl border border-red-200">
        <p className="text-red-700 text-sm">Couldn't find unicorn jobs: {state.message}</p>
        <button
          onClick={() => fetchUnicorns(true)}
          className="mt-2 text-xs font-medium text-red-600 hover:text-red-700"
        >
          Try again
        </button>
      </div>
    );
  }

  // No jobs found
  if (state.jobs.length === 0) {
    return null;
  }

  // Success state
  return (
    <div className="mb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-amber-100 to-orange-100 border border-amber-200 text-amber-700 rounded-full text-sm font-medium">
            <span>🦄</span>
            <span>Hidden Gems For You</span>
          </div>
          <span className="text-sm text-slate-500">
            High-match jobs you wouldn't search for
          </span>
        </div>
        <button
          onClick={() => fetchUnicorns(true)}
          disabled={isRefreshing}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-600 hover:bg-amber-50 rounded-full transition-colors disabled:opacity-50"
        >
          <RefreshCw size={14} className={isRefreshing ? "animate-spin" : ""} />
          Refresh
        </button>
      </div>

      {/* Jobs Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {state.jobs.map((job) => (
          <div key={job.id} className="relative">
            {/* Unicorn Badge */}
            <div className="absolute -top-2 -right-2 z-10 flex items-center gap-1 px-2 py-1 bg-gradient-to-r from-amber-100 to-orange-100 border border-amber-300 text-amber-700 text-xs font-medium rounded-full shadow-sm">
              🦄 {(job as any).matchScore ? `${(job as any).matchScore}% Match` : "Great Match"}
            </div>
            <JobCard
              job={job}
              onCompanyClick={onCompanyClick}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

