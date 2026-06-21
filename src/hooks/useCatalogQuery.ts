import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { useDebouncedValue } from '@tanstack/react-pacer';
import { useRouter } from '@tanstack/react-router';
import { getCatalogJobs, starCatalogJob } from '@/server/functions/jobs-pipeline';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CatalogFilters {
  query: string;
  remote: boolean | undefined;
  company: string;
  ats: string;
  salaryMin: number;
  page: number;
}

export type CatalogJob = {
  id: string;
  titleDisplay: string;
  companyDisplay: string;
  locationDisplay: string | null;
  remote: boolean | null;
  employmentType: string | null;
  experienceLevel: string | null;
  compensationMin: number | null;
  compensationMax: number | null;
  compensationCurrency: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  ats: string | null;
  sourceUrl: string | null;
  applyUrl: string | null;
  isSaved: boolean;
  isFavorited: boolean;
};

export type CatalogData = {
  jobs: CatalogJob[];
  total: number;
  page: number;
  pageSize: number;
};

// ─── Query Keys ───────────────────────────────────────────────────────────────

export const catalogQueryKeys = {
  all: ['catalog'] as const,
  list: (filters: CatalogFilters) => ['catalog', 'list', filters] as const,
};

const PAGE_SIZE = 20;

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useCatalogQuery(filters: CatalogFilters) {
  const queryClient = useQueryClient();
  const router = useRouter();

  // Debounce keyword/company inputs via @tanstack/react-pacer
  const [debouncedQuery] = useDebouncedValue(filters.query, { wait: 350 });
  const [debouncedCompany] = useDebouncedValue(filters.company, { wait: 350 });

  // Effective filters (debounced text inputs, immediate toggles)
  const effectiveFilters: CatalogFilters = {
    ...filters,
    query: debouncedQuery,
    company: debouncedCompany,
  };

  // Main query
  const query = useQuery<CatalogData>({
    queryKey: catalogQueryKeys.list(effectiveFilters),
    queryFn: () =>
      getCatalogJobs({
        data: {
          query: effectiveFilters.query || undefined,
          remote: effectiveFilters.remote,
          company: effectiveFilters.company || undefined,
          ats: effectiveFilters.ats || undefined,
          salaryMin: effectiveFilters.salaryMin || undefined,
          page: effectiveFilters.page,
          pageSize: PAGE_SIZE,
        },
      }) as Promise<CatalogData>,
    staleTime: 1000 * 60 * 2,       // 2 min — catalog doesn't change fast
    gcTime: 1000 * 60 * 10,          // 10 min cache
    placeholderData: (prev) => prev, // keep previous page visible while fetching next
  });

  // Prefetch adjacent page so pagination feels instant
  const prefetchPage = (targetPage: number) => {
    void queryClient.prefetchQuery({
      queryKey: catalogQueryKeys.list({ ...effectiveFilters, page: targetPage }),
      queryFn: () =>
        getCatalogJobs({
          data: {
            query: effectiveFilters.query || undefined,
            remote: effectiveFilters.remote,
            company: effectiveFilters.company || undefined,
            ats: effectiveFilters.ats || undefined,
            salaryMin: effectiveFilters.salaryMin || undefined,
            page: targetPage,
            pageSize: PAGE_SIZE,
          },
        }) as Promise<CatalogData>,
      staleTime: 1000 * 60 * 2,
    });
  };

  // Star mutation with optimistic update
  const starMutation = useMutation({
    mutationFn: ({ canonicalJobId, star }: { canonicalJobId: string; star: boolean }) =>
      starCatalogJob({ data: { canonicalJobId, star } }),

    // Optimistically update every matching catalog cache entry
    onMutate: async ({ canonicalJobId, star }) => {
      await queryClient.cancelQueries({ queryKey: catalogQueryKeys.all });

      const snapshots = new Map<string, CatalogData | undefined>();

      queryClient.getQueriesData<CatalogData>({ queryKey: catalogQueryKeys.all }).forEach(
        ([key, data]) => {
          const keyStr = JSON.stringify(key);
          snapshots.set(keyStr, data);
          if (data) {
            queryClient.setQueryData<CatalogData>(key, {
              ...data,
              jobs: data.jobs.map((j) =>
                j.id === canonicalJobId ? { ...j, isFavorited: star, isSaved: true } : j,
              ),
            });
          }
        },
      );

      return { snapshots };
    },

    // Roll back on error
    onError: (_err, _vars, context) => {
      if (context?.snapshots) {
        context.snapshots.forEach((data, keyStr) => {
          queryClient.setQueryData(JSON.parse(keyStr), data);
        });
      }
    },

    onSettled: () => {
      // Invalidate My Jobs pipeline so the starred job appears there
      void queryClient.invalidateQueries({ queryKey: ['jobs'] });
      router.invalidate();
    },
  });

  const totalPages = query.data ? Math.ceil(query.data.total / PAGE_SIZE) : 0;
  const isDebouncing = filters.query !== debouncedQuery || filters.company !== debouncedCompany;

  return {
    ...query,
    starMutation,
    prefetchPage,
    totalPages,
    PAGE_SIZE,
    isDebouncing,
    effectiveFilters,
  };
}
