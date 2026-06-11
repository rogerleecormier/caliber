import { useMemo, useState, useCallback } from 'react';
import {
  Button,
  Input,
  PageSection,
  Pagination,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@caliber/ui-kit';
import {
  ChevronDown,
  Filter,
  Loader2,
  MapPin,
  DollarSign,
  Briefcase,
} from 'lucide-react';
import {
  AggregatedJobCard,
  type AggregatedJobCardJob,
} from './aggregated-job-card';

export interface AggregatedJobsResultsProps {
  jobs: AggregatedJobCardJob[];
  loading?: boolean;
  onSaveJob?: (job: AggregatedJobCardJob) => Promise<void>;
  onAnalyzeJob?: (job: AggregatedJobCardJob) => Promise<void>;
  savedJobIds?: Set<string>;
}

type SortOption = 'posted-date' | 'salary-high' | 'salary-low' | 'title' | 'company';
type FilterOption = 'all' | 'adzuna' | 'jooble' | 'remotive' | 'remote-only';

export function AggregatedJobsResults({
  jobs,
  loading = false,
  onSaveJob,
  onAnalyzeJob,
  savedJobIds = new Set(),
}: AggregatedJobsResultsProps) {
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<SortOption>('posted-date');
  const [filter, setFilter] = useState<FilterOption>('all');
  const [searchTerm, setSearchTerm] = useState('');

  const PAGE_SIZE = 10;

  // Filter jobs
  const filteredJobs = useMemo(() => {
    return jobs.filter((job) => {
      // Search filter
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchesSearch =
          job.title.toLowerCase().includes(term) ||
          job.company.toLowerCase().includes(term) ||
          job.location.toLowerCase().includes(term);
        if (!matchesSearch) return false;
      }

      // Source filter
      if (filter === 'adzuna' && job.source !== 'adzuna') return false;
      if (filter === 'jooble' && job.source !== 'jooble') return false;
      if (filter === 'remotive' && job.source !== 'remotive') return false;
      if (filter === 'remote-only' && !job.remote && !job.location.toLowerCase().includes('remote')) {
        return false;
      }

      return true;
    });
  }, [jobs, searchTerm, filter]);

  // Sort jobs
  const sortedJobs = useMemo(() => {
    const sorted = [...filteredJobs];

    switch (sortBy) {
      case 'salary-high':
        sorted.sort(
          (a, b) => (b.salary?.max ?? 0) - (a.salary?.max ?? 0)
        );
        break;
      case 'salary-low':
        sorted.sort(
          (a, b) => (a.salary?.min ?? 0) - (b.salary?.min ?? 0)
        );
        break;
      case 'title':
        sorted.sort((a, b) => (a.title ?? '').localeCompare(b.title ?? ''));
        break;
      case 'company':
        sorted.sort((a, b) => (a.company ?? '').localeCompare(b.company ?? ''));
        break;
      case 'posted-date':
      default:
        sorted.sort((a, b) => {
          const getTimeValue = (date?: Date | string) => {
            if (!date) return 0;
            if (date instanceof Date) return date.getTime();
            return new Date(date).getTime();
          };
          return getTimeValue(b.postedDate) - getTimeValue(a.postedDate);
        });
        break;
    }

    return sorted;
  }, [filteredJobs, sortBy]);

  // Paginate
  const paginatedJobs = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return sortedJobs.slice(start, start + PAGE_SIZE);
  }, [sortedJobs, page]);

  const totalPages = Math.ceil(sortedJobs.length / PAGE_SIZE);

  if (loading) {
    return (
      <PageSection className="flex items-center justify-center py-12">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-2 text-blue-600" />
          <p className="text-gray-600">Searching across all sources...</p>
        </div>
      </PageSection>
    );
  }

  if (jobs.length === 0) {
    return (
      <PageSection className="py-12 text-center">
        <p className="text-gray-600 mb-4">No jobs found. Try adjusting your search criteria.</p>
      </PageSection>
    );
  }

  return (
    <PageSection className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
        {/* Search */}
        <div className="flex-1">
          <label className="block text-sm font-medium mb-1">Search Results</label>
          <Input
            type="text"
            placeholder="Search by title, company, or location..."
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setPage(1);
            }}
          />
        </div>

        {/* Source Filter */}
        <div className="w-full lg:w-48">
          <label className="block text-sm font-medium mb-1">
            <Briefcase className="h-4 w-4 inline mr-1" />
            Source
          </label>
          <Select value={filter} onValueChange={(value) => {
            setFilter(value as FilterOption);
            setPage(1);
          }}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              <SelectItem value="adzuna">🔷 Adzuna</SelectItem>
              <SelectItem value="jooble">🔶 Jooble</SelectItem>
              <SelectItem value="remotive">🌍 Remotive</SelectItem>
              <SelectItem value="remote-only">Remote Only</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Sort */}
        <div className="w-full lg:w-48">
          <label className="block text-sm font-medium mb-1">
            <ChevronDown className="h-4 w-4 inline mr-1" />
            Sort By
          </label>
          <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortOption)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="posted-date">Newest First</SelectItem>
              <SelectItem value="salary-high">Highest Salary</SelectItem>
              <SelectItem value="salary-low">Lowest Salary</SelectItem>
              <SelectItem value="title">Job Title (A-Z)</SelectItem>
              <SelectItem value="company">Company Name (A-Z)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Results Stats */}
      <div className="flex items-center justify-between text-sm text-gray-600 bg-gray-50 px-4 py-2 rounded-lg">
        <span>
          Showing <strong>{Math.min(PAGE_SIZE, paginatedJobs.length)}</strong> of{' '}
          <strong>{sortedJobs.length}</strong> results
          {searchTerm && ` (filtered from ${jobs.length} total)`}
        </span>
      </div>

      {/* Job Cards */}
      <div className="space-y-3">
        {paginatedJobs.map((job) => (
          <AggregatedJobCard
            key={`${job.source}-${job.id}`}
            job={job}
            onSave={onSaveJob}
            isSaved={savedJobIds.has(`${job.source}-${job.id}`)}
            onAnalyze={onAnalyzeJob}
          />
        ))}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center">
          <Pagination
            page={page}
            totalPages={totalPages}
            onPageChange={setPage}
          />
        </div>
      )}
    </PageSection>
  );
}
