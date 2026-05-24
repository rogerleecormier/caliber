import { Link, createFileRoute, useLoaderData } from "@tanstack/react-router";
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Briefcase,
  Loader2,
  X,
  Sparkles,
  Info,
  Search,
  Settings2,
  ArrowRight,
  Zap,
} from "lucide-react";
import { useDebouncedCallback } from "@tanstack/react-pacer";
import { PageHero, PageSection } from "@spearyx/ui-kit";
import JobCard from "../components/JobCard";
import SearchBar from "../components/SearchBar";
import FilterDropdown from "../components/FilterDropdown";
import SortControls from "../components/SortControls";
import type { JobWithCategory } from "../lib/search-utils";

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

interface JobsResponse {
  success: boolean;
  data: {
    jobs: JobWithCategory[];
    total: number;
    limit: number;
    offset: number;
    hasMore: boolean;
  };
}

function HomePage() {
  const loaderData = useLoaderData({ from: "/jobs" });

  const [jobs, setJobs] = useState<JobWithCategory[]>(loaderData.initialJobs);
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
  const [showAIInfoModal, setShowAIInfoModal] = useState(false);

  const loadMoreRef = useRef<HTMLDivElement>(null);
  const isInitialLoad = useRef(true);

  const debouncedFetchJobs = useDebouncedCallback(
    async (params: URLSearchParams) => {
      setLoading(true);
      try {
        const response = await fetch(`/api/v3/jobs?${params.toString()}`);
        const data = (await response.json()) as JobsResponse;
        if (data.success) {
          setJobs(data.data.jobs);
          setTotalJobs(data.data.total);
          setHasMore(data.data.hasMore);
          setOffset(0);
        }
      } catch (error) {
        console.error("Error fetching jobs:", error);
      } finally {
        setLoading(false);
      }
    },
    { wait: 300 }
  );

  useEffect(() => {
    if (isInitialLoad.current) {
      isInitialLoad.current = false;
      return;
    }
    const params = new URLSearchParams();
    if (searchQuery) params.set("search", searchQuery);
    if (selectedCategoryId) params.set("category", selectedCategoryId.toString());
    if (selectedSource) params.set("source", selectedSource);
    if (selectedCompany) params.set("company", selectedCompany);
    params.set("sortBy", sortBy);
    params.set("limit", "30");
    params.set("offset", "0");
    debouncedFetchJobs(params);
  }, [searchQuery, selectedCategoryId, selectedSource, selectedCompany, sortBy]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    const nextOffset = offset + 30;
    const params = new URLSearchParams();
    if (searchQuery) params.set("search", searchQuery);
    if (selectedCategoryId) params.set("category", selectedCategoryId.toString());
    if (selectedSource) params.set("source", selectedSource);
    if (selectedCompany) params.set("company", selectedCompany);
    params.set("sortBy", sortBy);
    params.set("limit", "30");
    params.set("offset", nextOffset.toString());
    try {
      const response = await fetch(`/api/v3/jobs?${params.toString()}`);
      const data = (await response.json()) as JobsResponse;
      if (data.success) {
        setJobs((prev: JobWithCategory[]) => [...prev, ...data.data.jobs]);
        setOffset(nextOffset);
        setHasMore(data.data.hasMore);
      }
    } catch (error) {
      console.error("Error loading more jobs:", error);
    } finally {
      setLoadingMore(false);
    }
  }, [offset, hasMore, loadingMore, searchQuery, selectedCategoryId, selectedSource, selectedCompany, sortBy]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loading && !loadingMore) {
          loadMore();
        }
      },
      { threshold: 0.1, rootMargin: "100px" }
    );
    if (loadMoreRef.current) observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [hasMore, loading, loadingMore, loadMore]);

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

  return (
    <div className="spx-page spx-stack">
      <PageHero
        eyebrow="Remote Opportunities"
        icon={<Briefcase className="h-3.5 w-3.5" />}
        title="Find Your Next Role"
        description="AI-curated remote jobs from top tech companies — searched, scored, and ready for you to analyze."
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

      {/* Analyze CTA Banner */}
      <div
        className="relative overflow-hidden rounded-2xl px-6 py-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
        style={{
          background: "linear-gradient(135deg, rgba(220,38,38,0.07) 0%, rgba(220,38,38,0.03) 50%, rgba(99,102,241,0.05) 100%)",
          border: "1px solid rgba(220,38,38,0.15)",
          backdropFilter: "blur(12px)",
        }}
      >
        <div className="flex items-center gap-4">
          <div
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl"
            style={{ background: "rgba(220,38,38,0.1)", border: "1px solid rgba(220,38,38,0.2)" }}
          >
            <Sparkles className="h-5 w-5 text-primary-600" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">
              Have a job description you'd like to analyze?
            </p>
            <p className="text-xs text-slate-500 mt-0.5">
              Paste any JD to get AI match scoring, gap analysis, and a tailored resume strategy.
            </p>
          </div>
        </div>
        <Link
          to="/analyze"
          className="inline-flex flex-shrink-0 items-center gap-2 rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-primary-900/10 transition-all hover:bg-primary-700 hover:shadow-md hover:shadow-primary-900/15"
        >
          Analyze Now
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      {/* Search, Filters, and Job Grid */}
      <PageSection>
        {/* Search + filters row */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
          <div className="w-full lg:flex-[2] min-w-[300px]">
            <SearchBar onSearch={handleSearch} />
          </div>
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
                { id: "Greenhouse", label: "Greenhouse" },
                { id: "Lever", label: "Lever" },
                { id: "Workable", label: "Workable" },
              ]}
              onChange={handleSourceSelect}
            />
          </div>
        </div>

        {/* Active company filter */}
        {selectedCompany && (
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
            ) : (
              <>
                <strong className="text-slate-900">{totalJobs || jobs.length}</strong> remote jobs
              </>
            )}
          </span>
          <SortControls sortBy={sortBy} onSortChange={handleSortChange} />
        </div>

        {/* Job cards */}
        <div className="mt-6 min-h-[400px]">
          {loading && jobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center text-slate-500">
              <Loader2 className="mb-4 animate-spin text-primary-600" size={40} />
              <p className="text-sm">Finding the best remote jobs for you…</p>
            </div>
          ) : jobs.length === 0 ? (
            <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 py-16 text-center">
              <Briefcase size={48} className="mb-4 text-slate-300" />
              <h2 className="text-lg font-semibold text-slate-900">No jobs found</h2>
              <p className="mt-1 text-sm text-slate-500">
                Try adjusting your search or filters to find more opportunities.
              </p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
                {jobs.map((job: JobWithCategory) => (
                  <JobCard
                    key={job.id}
                    job={job}
                    onCompanyClick={handleCompanySelect}
                  />
                ))}
              </div>

              <div ref={loadMoreRef} className="flex h-20 items-center justify-center">
                {loadingMore && (
                  <div className="flex items-center gap-2 text-slate-400">
                    <Loader2 className="animate-spin" size={18} />
                    <span className="text-sm">Loading more…</span>
                  </div>
                )}
                {!hasMore && jobs.length > 0 && (
                  <p className="text-sm text-slate-400">You've seen all jobs</p>
                )}
              </div>
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
                <h3 className="mb-1 font-medium text-slate-900">✨ Intelligent Job Analysis</h3>
                <p>Get a deep-dive evaluation of any role. Our AI performs multi-dimensional checks to assess role quality and your compatibility.</p>
              </div>
              <div>
                <h3 className="mb-1 font-medium text-slate-900">🎯 Personalized Match Score</h3>
                <p>Your saved resume is compared against each role, highlighting alignment, gaps, and likely strengths.</p>
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
                Powered by Cloudflare Workers AI and your Caliber account data.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
