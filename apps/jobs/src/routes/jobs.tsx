import { Link, createFileRoute, useLoaderData } from "@tanstack/react-router";
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Briefcase,
  Loader2,
  X,
  Sparkles,
  Info,
  Settings2,
  Zap,
  Star,
  Bot,
} from "lucide-react";
import { useDebouncedCallback } from "@tanstack/react-pacer";
import { PageHero, PageSection } from "@spearyx/ui-kit";
import JobCard from "../components/JobCard";
import SearchBar from "../components/SearchBar";
import FilterDropdown from "../components/FilterDropdown";
import SortControls from "../components/SortControls";
import { JobResultCard, type JobStatus, type JobResultCardJob } from "../components/features/job-result-card";
import { updateUserJobStatus, deleteUserJobs, USER_JOB_STATUSES } from "@/server/functions/user-jobs";
import type { JobWithCategory } from "../lib/search-utils";
import type { JobScoreResult } from "./api/ai/score-all";

import { getDbFromContext, schema } from "../db/db";
import { desc, sql } from "drizzle-orm";

export const Route = createFileRoute("/jobs")({
  loader: async ({ context }: { context: any }) => {
    try {
      const db = await getDbFromContext(context as any);

      const countResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(schema.jobs);
      const totalCount = countResult[0]?.count || 0;

      const jobsData = await db
        .select()
        .from(schema.jobs)
        .orderBy(desc(schema.jobs.postDate))
        .limit(30);

      const categoriesData = await db.select().from(schema.categories);
      const categoriesMap = new Map(categoriesData.map((c: any) => [c.id, c]));

      const jobs = jobsData.map((job: any) => ({
        ...job,
        category: categoriesMap.get(job.categoryId) || categoriesData[0],
      }));

      return {
        initialJobs: jobs,
        categories: categoriesData,
        totalCount,
        hasMore: jobsData.length >= 30,
      };
    } catch (error) {
      console.error("Loader error:", error);
      return { initialJobs: [], categories: [], totalCount: 0, hasMore: false };
    }
  },
  component: HomePage,
});

interface Category {
  id: number;
  name: string;
  slug: string;
}

type JobView = "all" | "my";

// A user_jobs row carries the per-user scores synthesized vs the resume.
interface UserJobRecord {
  atsScore: number | null;
  careerScore: number | null;
  outlookScore: number | null;
  masterScore: number | null;
  atsReason: string | null;
  careerReason: string | null;
  outlookReason: string | null;
  isUnicorn: boolean | number | null;
  unicornReason: string | null;
  relationship: string;
  status: JobStatus | null;
}

type EnrichedJob = JobWithCategory & { userJob?: UserJobRecord | null };

function userJobToScore(job: EnrichedJob): JobScoreResult | undefined {
  const uj = job.userJob;
  if (!uj || uj.masterScore == null) return undefined;
  return {
    jobId: job.id,
    atsScore: uj.atsScore ?? 0,
    careerScore: uj.careerScore ?? 0,
    outlookScore: uj.outlookScore ?? 0,
    masterScore: uj.masterScore ?? 0,
    atsReason: uj.atsReason ?? "",
    careerReason: uj.careerReason ?? "",
    outlookReason: uj.outlookReason ?? "",
    isUnicorn: !!uj.isUnicorn,
    unicornReason: uj.unicornReason ?? null,
  };
}

function jobToResultCard(job: EnrichedJob): JobResultCardJob {
  const uj = job.userJob;
  return {
    id: job.id,
    title: job.title,
    company: job.company ?? "",
    location: (job as any).location ?? null,
    sourceUrl: job.sourceUrl,
    salary: (job as any).payRange ?? null,
    snippet: (job as any).description ?? null,
    description: (job as any).fullDescription ?? (job as any).description ?? null,
    status: uj?.status ?? "Analyzed",
    masterScore: uj?.masterScore ?? null,
    atsScore: uj?.atsScore ?? null,
    careerScore: uj?.careerScore ?? null,
    outlookScore: uj?.outlookScore ?? null,
    atsReason: uj?.atsReason ?? null,
    isUnicorn: uj?.isUnicorn ?? null,
    unicornReason: uj?.unicornReason ?? null,
    relationship: uj?.relationship ?? null,
  };
}

function HomePage() {
  const loaderData = useLoaderData({ from: "/jobs" });

  const [view, setView] = useState<JobView>("all");
  const [jobs, setJobs] = useState<EnrichedJob[]>(loaderData.initialJobs);
  const [myJobs, setMyJobs] = useState<EnrichedJob[]>([]);
  const [favoriteIds, setFavoriteIds] = useState<Set<number>>(new Set());
  const [categories] = useState<Category[]>(loaderData.categories);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategoryId, setSelectedCategoryId] = useState<number | null>(null);
  const [selectedSource, setSelectedSource] = useState<string | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<
    "newest" | "oldest" | "title-asc" | "title-desc" | "recently-added"
  >("newest");
  const [totalJobs, setTotalJobs] = useState(loaderData.totalCount || 0);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(loaderData.hasMore);
  const [personalized, setPersonalized] = useState(false);
  const [showAIInfoModal, setShowAIInfoModal] = useState(false);

  const loadMoreRef = useRef<HTMLDivElement>(null);
  const isInitialLoad = useRef(true);

  const hasActiveFilter = !!(searchQuery || selectedCategoryId || selectedSource || selectedCompany);

  const buildParams = (off: number) => {
    const params = new URLSearchParams();
    if (searchQuery) params.set("search", searchQuery);
    if (selectedCategoryId) params.set("category", selectedCategoryId.toString());
    if (selectedSource) params.set("source", selectedSource);
    if (selectedCompany) params.set("company", selectedCompany);
    params.set("sortBy", sortBy);
    params.set("limit", "30");
    params.set("offset", off.toString());
    return params;
  };

  // Load the set of favorited job ids once so cards reflect saved state across views.
  const loadFavorites = useCallback(async () => {
    try {
      const res = await fetch("/api/v3/my-jobs");
      const data = (await res.json()) as { success: boolean; data?: { jobs: EnrichedJob[] } };
      if (data.success && data.data) {
        setFavoriteIds(new Set(data.data.jobs.map((j) => j.id)));
        setMyJobs(data.data.jobs);
      }
    } catch (err) {
      console.error("Error loading favorites:", err);
    }
  }, []);

  useEffect(() => {
    loadFavorites();
  }, [loadFavorites]);

  // "All jobs": personalized recommendations when no active filter, else filtered search.
  const fetchAllJobs = useDebouncedCallback(async () => {
    setLoading(true);
    try {
      const endpoint = hasActiveFilter
        ? `/api/v3/jobs?${buildParams(0).toString()}`
        : `/api/v3/jobs/recommended?limit=30&offset=0`;
      const response = await fetch(endpoint);
      const data = (await response.json()) as any;
      if (data.success) {
        setJobs(data.data.jobs);
        setTotalJobs(data.data.total ?? data.data.jobs.length);
        setHasMore(data.data.hasMore);
        setPersonalized(!!data.data.personalized);
        setOffset(0);
      }
    } catch (error) {
      console.error("Error fetching jobs:", error);
    } finally {
      setLoading(false);
    }
  }, { wait: 300 });

  useEffect(() => {
    if (isInitialLoad.current) {
      isInitialLoad.current = false;
      return;
    }
    if (view === "all") fetchAllJobs();
  }, [searchQuery, selectedCategoryId, selectedSource, selectedCompany, sortBy, view]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || view !== "all") return;
    setLoadingMore(true);
    const nextOffset = offset + 30;
    try {
      const endpoint = hasActiveFilter
        ? `/api/v3/jobs?${buildParams(nextOffset).toString()}`
        : `/api/v3/jobs/recommended?limit=30&offset=${nextOffset}`;
      const response = await fetch(endpoint);
      const data = (await response.json()) as any;
      if (data.success) {
        setJobs((prev) => [...prev, ...data.data.jobs]);
        setOffset(nextOffset);
        setHasMore(data.data.hasMore);
      }
    } catch (error) {
      console.error("Error loading more jobs:", error);
    } finally {
      setLoadingMore(false);
    }
  }, [offset, hasMore, loadingMore, view, hasActiveFilter, searchQuery, selectedCategoryId, selectedSource, selectedCompany, sortBy]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading && !loadingMore && view === "all") {
          loadMore();
        }
      },
      { threshold: 0.1, rootMargin: "100px" }
    );
    if (loadMoreRef.current) observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, loadMore, view]);

  const toggleFavorite = useCallback(async (jobId: number, next: boolean) => {
    // Optimistic update.
    setFavoriteIds((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(jobId);
      else copy.delete(jobId);
      return copy;
    });
    if (!next) setMyJobs((prev) => prev.filter((j) => j.id !== jobId));
    try {
      await fetch("/api/v3/my-jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId, action: next ? "favorite" : "unfavorite" }),
      });
      // Refresh My Jobs so newly-favorited rows pick up their on-demand score.
      if (next) loadFavorites();
    } catch (err) {
      console.error("Error toggling favorite:", err);
    }
  }, [loadFavorites]);

  const handleStatusChange = useCallback(async (jobId: number, status: JobStatus) => {
    setMyJobs((prev) => prev.map((j) =>
      j.id === jobId ? { ...j, userJob: { ...(j.userJob as UserJobRecord), status } } : j));
    try {
      await updateUserJobStatus({ data: { jobId, status } });
    } catch (err) {
      console.error("Error updating status:", err);
    }
  }, []);

  const handleRemoveFromMyJobs = useCallback(async (jobId: number) => {
    setMyJobs((prev) => prev.filter((j) => j.id !== jobId));
    setFavoriteIds((prev) => { const c = new Set(prev); c.delete(jobId); return c; });
    try {
      await deleteUserJobs({ data: { jobIds: [jobId] } });
    } catch (err) {
      console.error("Error removing job:", err);
    }
  }, []);

  const handleSearch = useCallback((query: string) => setSearchQuery(query), []);
  const handleCategorySelect = useCallback((id: number | null) => setSelectedCategoryId(id), []);
  const handleSourceSelect = useCallback((source: string | null) => setSelectedSource(source), []);

  const handleCompanySelect = useCallback((company: string | null) => {
    if (company) {
      setSelectedCategoryId(null);
      setSelectedSource(null);
      setSearchQuery("");
    }
    setSelectedCompany(company);
  }, []);

  const handleSortChange = useCallback(
    (newSort: "newest" | "oldest" | "title-asc" | "title-desc" | "recently-added") =>
      setSortBy(newSort),
    []
  );

  const clearCompanyFilter = useCallback(() => setSelectedCompany(null), []);

  // Which list to render.
  const visibleJobs = view === "my"
    ? (searchQuery
        ? myJobs.filter((j) =>
            j.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
            (j.company || "").toLowerCase().includes(searchQuery.toLowerCase()))
        : myJobs)
    : jobs;

  return (
    <div className="spx-page spx-stack">
      <PageHero
        eyebrow="Remote Opportunities"
        icon={<Briefcase className="h-3.5 w-3.5" />}
        title="Find Your Next Role"
        description="AI-curated remote jobs from top tech companies — discovered, scored, and ready for you to analyze."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              to="/analyze"
              className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary-700"
            >
              <Zap className="h-4 w-4" />
              Analyze a Job
            </Link>
            <Link
              to="/search-agents"
              className="inline-flex items-center gap-1.5 rounded-lg border border-violet-200 bg-violet-50 px-3 py-2 text-sm font-medium text-violet-700 transition hover:bg-violet-100"
            >
              <Bot size={14} />
              Search Agents
            </Link>
            <Link
              to="/sync"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white/70 px-3 py-2 text-sm font-medium text-slate-600 transition hover:bg-white hover:text-slate-900"
            >
              <Settings2 size={14} />
              Sources
            </Link>
            <button
              onClick={() => setShowAIInfoModal(true)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-700 transition hover:bg-amber-100"
            >
              <Sparkles size={14} className="text-amber-500" />
              How AI Works
              <Info size={12} className="text-amber-400" />
            </button>
          </div>
        }
      />

      {/* Search, Filters, and Job Grid */}
      <PageSection>
        {/* View toggle */}
        <div className="mb-4 inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1">
          <button
            onClick={() => setView("all")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
              view === "all" ? "bg-white text-primary-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Briefcase size={14} />
            All Jobs
          </button>
          <button
            onClick={() => setView("my")}
            className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-1.5 text-sm font-semibold transition ${
              view === "my" ? "bg-white text-primary-600 shadow-sm" : "text-slate-500 hover:text-slate-700"
            }`}
          >
            <Star size={14} />
            My Jobs
            {favoriteIds.size > 0 && (
              <span className="ml-1 rounded-full bg-amber-100 px-1.5 text-[11px] font-bold text-amber-700">
                {favoriteIds.size}
              </span>
            )}
          </button>
        </div>

        {/* Search + filters row */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <div className="w-full lg:flex-[2] min-w-[300px]">
            <SearchBar onSearch={handleSearch} />
          </div>
          {view === "all" && (
            <div className="flex flex-wrap gap-2">
              <FilterDropdown
                label="Categories"
                value={selectedCategoryId}
                options={categories.map((c: any) => ({ id: c.id, label: c.name }))}
                onChange={handleCategorySelect}
              />
              <FilterDropdown
                label="Source"
                value={selectedSource}
                options={[
                  { id: "RemoteOK", label: "RemoteOK" },
                  { id: "Greenhouse", label: "Greenhouse" },
                  { id: "Lever", label: "Lever" },
                  { id: "Workable", label: "Workable" },
                  { id: "Himalayas", label: "Himalayas" },
                  { id: "Jobicy", label: "Jobicy" },
                ]}
                onChange={handleSourceSelect}
              />
            </div>
          )}
        </div>

        {/* Active company filter */}
        {selectedCompany && view === "all" && (
          <div className="mt-3 flex items-center gap-2">
            <span className="text-sm text-slate-500">Filtering by company:</span>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 border border-primary-100 px-3 py-1 text-sm font-medium text-primary-700">
              {selectedCompany}
              <button
                onClick={clearCompanyFilter}
                className="rounded-full p-0.5 hover:bg-primary-100 transition-colors"
                aria-label="Clear company filter"
              >
                <X size={13} />
              </button>
            </span>
          </div>
        )}

        {/* Count + sort */}
        <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-4">
          <span className="text-sm text-slate-500">
            {loading ? (
              "Loading…"
            ) : view === "my" ? (
              <>
                <strong className="text-slate-900">{visibleJobs.length}</strong> saved jobs
              </>
            ) : (
              <>
                <strong className="text-slate-900">{totalJobs || visibleJobs.length}</strong> remote jobs
                {personalized && !hasActiveFilter && (
                  <span className="ml-2 inline-flex items-center gap-1 text-xs text-violet-500">
                    <Sparkles size={11} /> personalized for you
                  </span>
                )}
              </>
            )}
          </span>
          {view === "all" && <SortControls sortBy={sortBy} onSortChange={handleSortChange} />}
        </div>

        {/* Job cards */}
        <div className="mt-6 min-h-[400px]">
          {loading && visibleJobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-slate-500">
              <Loader2 className="mb-4 animate-spin text-primary-600" size={40} />
              <p className="text-sm">Finding the best remote jobs for you…</p>
            </div>
          ) : visibleJobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 py-16 text-center">
              {view === "my" ? <Star size={48} className="mb-4 text-slate-300" /> : <Briefcase size={48} className="mb-4 text-slate-300" />}
              <h2 className="text-lg font-semibold text-slate-900">
                {view === "my" ? "No saved jobs yet" : "No jobs found"}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {view === "my"
                  ? "Star jobs from All Jobs, or create a Search Agent to auto-collect matches."
                  : "Try adjusting your search or filters to find more opportunities."}
              </p>
            </div>
          ) : (
            <>
              {view === "my" ? (
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
                  {visibleJobs.map((job: EnrichedJob) => (
                    <JobResultCard
                      key={job.id}
                      job={jobToResultCard(job)}
                      statusOptions={USER_JOB_STATUSES}
                      onStatusChange={(status) => handleStatusChange(job.id, status)}
                      onRemove={() => handleRemoveFromMyJobs(job.id)}
                    />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
                  {visibleJobs.map((job: EnrichedJob) => (
                    <JobCard
                      key={job.id}
                      job={job}
                      score={userJobToScore(job)}
                      favorited={favoriteIds.has(job.id)}
                      onToggleFavorite={toggleFavorite}
                      onCompanyClick={handleCompanySelect}
                    />
                  ))}
                </div>
              )}

              {view === "all" && (
                <div ref={loadMoreRef} className="flex h-20 items-center justify-center">
                  {loadingMore && (
                    <div className="flex items-center gap-2 text-slate-400">
                      <Loader2 className="animate-spin" size={18} />
                      <span className="text-sm">Loading more…</span>
                    </div>
                  )}
                  {!hasMore && visibleJobs.length > 0 && (
                    <p className="text-sm text-slate-400">You've seen all jobs</p>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </PageSection>

      {/* AI Info Modal */}
      {showAIInfoModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 px-4"
          onClick={() => setShowAIInfoModal(false)}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl"
            onClick={(e: React.MouseEvent) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-amber-100 bg-amber-50 px-5 py-4">
              <div className="flex items-center gap-2">
                <Sparkles size={16} className="text-amber-500" />
                <h2 className="font-semibold text-amber-800">How AI Works Here</h2>
              </div>
              <button
                onClick={() => setShowAIInfoModal(false)}
                className="rounded-full p-1 transition-colors hover:bg-amber-100"
              >
                <X size={16} className="text-amber-600" />
              </button>
            </div>
            <div className="space-y-4 p-5 text-sm text-slate-700">
              <div>
                <h3 className="mb-1 font-medium text-slate-900">✨ All Jobs, Personalized</h3>
                <p>Every job in the canonical database is ranked for you using semantic matching between the role and your profile.</p>
              </div>
              <div>
                <h3 className="mb-1 font-medium text-slate-900">🎯 My Jobs</h3>
                <p>Jobs your Search Agents auto-favorited, plus anything you star manually — each scored against your resume.</p>
              </div>
              <div>
                <h3 className="mb-1 font-medium text-slate-900">🔍 Deep Insights</h3>
                <p>Discover estimated salary ranges, work-life balance indicators, culture signals, and potential red flags.</p>
              </div>
              <div>
                <h3 className="mb-1 font-medium text-slate-900">🛡️ Privacy First</h3>
                <p>Analysis runs only when requested. Your documents stay tied to your account and are used only for your workflow.</p>
              </div>
              <div className="border-t border-slate-100 pt-3 text-xs text-slate-400">
                Powered by Cloudflare Workers AI and your Spearyx account data.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
