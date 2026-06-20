import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JobAggregatorService } from '../job-aggregator';
import { AdzunaService } from '../adzuna';
import { JoobleService } from '../jooble';
import { RemotiveService } from '../remotive';
import type { UnifiedJob } from '../types';

// Mock KV namespace
const createMockKV = (): KVNamespace => {
  const storage = new Map<string, string>();
  return {
    get: async (key: string, options?: any) => {
      const value = storage.get(key);
      if (!value) return null;
      const isJson = options === 'json' || options?.type === 'json';
      return isJson ? JSON.parse(value) : value;
    },
    put: async (key: string, value: string | ReadableStream | ArrayBuffer) => {
      if (typeof value === 'string') {
        storage.set(key, value);
      }
    },
    delete: async (key: string) => {
      storage.delete(key);
    },
    list: async () => ({ keys: [], list_complete: true }),
    getWithMetadata: async () => ({ value: null, metadata: null }),
  } as any;
};

describe('JobAggregatorService', () => {
  let mockKV: KVNamespace;

  beforeEach(() => {
    mockKV = createMockKV();
  });

  describe('search', () => {
    it('should aggregate jobs from multiple sources concurrently', async () => {
      const aggregator = new JobAggregatorService(mockKV, 'app_id:app_key', 'api_key');

      // Mock the fetch calls
      const mockAdzunaResponse = {
        results: [
          {
            job_id: 'adzuna_1',
            job_title: 'Senior Engineer',
            company: { display_name: 'Tech Corp' },
            location: { display_name: 'San Francisco, CA' },
            redirect_url: 'https://adzuna.com/job/1',
          },
        ],
        count: 1,
      };

      const mockJoobleResponse = {
        jobs: [
          {
            id: 'jb_1',
            title: 'Staff Engineer',
            company: 'Cloud Systems',
            location: 'Remote',
            link: 'https://jooble.org/job/1',
            snippet: 'Looking for a staff engineer',
            updated: Math.floor(Date.now() / 1000),
          },
        ],
        totalCount: 1,
      };

      const mockRemotiveResponse = {
        jobs: [
          {
            id: 1,
            title: 'DevOps Engineer',
            company_name: 'StartupXYZ',
            location: 'Remote',
            url: 'https://remotive.com/job/1',
            publication_date: '2025-01-01T00:00:00Z',
            job_type: 'full-time' as const,
            description: 'Looking for a DevOps engineer',
          },
        ],
      };

      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockAdzunaResponse,
        } as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockJoobleResponse,
        } as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockRemotiveResponse,
        } as any);

      const result = await aggregator.search({
        keywords: 'Engineer',
        location: 'Remote',
        limit: 50,
      });

      expect(result.jobs).toHaveLength(3);
      expect(result.sources.adzuna?.success).toBe(true);
      expect(result.sources.jooble?.success).toBe(true);
      expect(result.sources.remotive?.success).toBe(true);
      expect(result.deduped).toBe(0);
    });

    it('should handle partial source failures with Promise.allSettled', async () => {
      const aggregator = new JobAggregatorService(mockKV, 'app_id:app_key', 'api_key');

      const mockRemotiveResponse = {
        jobs: [
          {
            id: 1,
            title: 'DevOps Engineer',
            company_name: 'StartupXYZ',
            location: 'Remote',
            url: 'https://remotive.com/job/1',
            publication_date: '2025-01-01T00:00:00Z',
            job_type: 'full-time' as const,
            description: 'Looking for a DevOps engineer',
          },
        ],
      };

      global.fetch = vi.fn()
        .mockRejectedValueOnce(new Error('Adzuna API failed'))
        .mockRejectedValueOnce(new Error('Jooble API failed'))
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockRemotiveResponse,
        } as any);

      const result = await aggregator.search({
        keywords: 'Engineer',
        location: 'Remote',
      });

      // Should still get jobs from Remotive
      expect(result.jobs).toHaveLength(1);
      expect(result.jobs[0].source).toBe('remotive');

      // Both Adzuna and Jooble should show failures
      expect(result.sources.adzuna?.success).toBe(false);
      expect(result.sources.jooble?.success).toBe(false);
      expect(result.sources.remotive?.success).toBe(true);
    });

    it('should deduplicate jobs by URL', async () => {
      const aggregator = new JobAggregatorService(mockKV, 'app_id:app_key', 'api_key');

      // Same job from different sources pointing to same URL
      const mockAdzunaResponse = {
        results: [
          {
            job_id: 'adzuna_1',
            job_title: 'Senior Engineer',
            company: { display_name: 'Tech Corp' },
            location: { display_name: 'San Francisco, CA' },
            redirect_url: 'https://techcorp.com/jobs/123',
          },
        ],
        count: 1,
      };

      const mockJoobleResponse = {
        jobs: [
          {
            id: 'jb_1',
            title: 'Senior Engineer',
            company: 'Tech Corp',
            location: 'San Francisco, CA',
            link: 'https://techcorp.com/jobs/123', // Same URL
            snippet: 'Senior engineer role',
            updated: Math.floor(Date.now() / 1000),
          },
        ],
        totalCount: 1,
      };

      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockAdzunaResponse,
        } as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockJoobleResponse,
        } as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ jobs: [] }),
        } as any);

      const result = await aggregator.search({
        keywords: 'Engineer',
        location: 'San Francisco',
      });

      // Should deduplicate to 1 job
      expect(result.jobs).toHaveLength(1);
      expect(result.deduped).toBe(1);
    });

    it('should filter sources by request parameter', async () => {
      const aggregator = new JobAggregatorService(mockKV, 'app_id:app_key', 'api_key');

      const mockRemotiveResponse = {
        jobs: [
          {
            id: 1,
            title: 'Engineer',
            company_name: 'Startup',
            location: 'Remote',
            url: 'https://remotive.com/job/1',
            publication_date: '2025-01-01T00:00:00Z',
            job_type: 'full-time' as const,
            description: 'Job',
          },
        ],
      };

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => mockRemotiveResponse,
      } as any);

      const result = await aggregator.search({
        keywords: 'Engineer',
        sources: ['remotive'], // Only request Remotive
      });

      expect(global.fetch).toHaveBeenCalledTimes(1); // Only 1 API call
      expect(result.jobs).toHaveLength(1);
    });

    it('should use KV cache for repeated queries', async () => {
      const aggregator = new JobAggregatorService(mockKV, 'app_id:app_key', 'api_key');

      const mockRemotiveResponse = {
        jobs: [
          {
            id: 1,
            title: 'Engineer',
            company_name: 'Startup',
            location: 'Remote',
            url: 'https://remotive.com/job/1',
            publication_date: '2025-01-01T00:00:00Z',
            job_type: 'full-time' as const,
            description: 'Job',
          },
        ],
      };

      let fetchCount = 0;
      global.fetch = vi.fn().mockImplementation(async () => {
        fetchCount++;
        return {
          ok: true,
          json: async () => mockRemotiveResponse,
        };
      });

      // First call should hit API
      const result1 = await aggregator.search({
        keywords: 'Engineer',
        sources: ['remotive'],
      });

      expect(fetchCount).toBe(1);

      // Second call should use cache
      const result2 = await aggregator.search({
        keywords: 'Engineer',
        sources: ['remotive'],
      });

      expect(fetchCount).toBe(1); // No additional API call
      expect(JSON.parse(JSON.stringify(result1.jobs))).toEqual(JSON.parse(JSON.stringify(result2.jobs)));
    });
  });

  describe('UnifiedJob interface', () => {
    it('should map all sources to consistent interface', async () => {
      const aggregator = new JobAggregatorService(mockKV, 'app_id:app_key', 'api_key');

      const mockAdzunaResponse = {
        results: [
          {
            job_id: 'adzuna_1',
            job_title: 'Senior Engineer',
            company: { display_name: 'Tech Corp' },
            location: { display_name: 'San Francisco, CA' },
            redirect_url: 'https://adzuna.com/job/1',
            salary_min: 150000,
            salary_max: 200000,
            salary_currency_code: 'USD',
          },
        ],
        count: 1,
      };

      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => mockAdzunaResponse,
        } as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ data: [] }),
        } as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ jobs: [] }),
        } as any);

      const result = await aggregator.search({
        keywords: 'Engineer',
        location: 'San Francisco',
      });

      const job = result.jobs[0];
      expect(job.id).toBe('adzuna_1');
      expect(job.title).toBe('Senior Engineer');
      expect(job.company).toBe('Tech Corp');
      expect(job.location).toBe('San Francisco, CA');
      expect(job.source).toBe('adzuna');
      expect(job.salary?.min).toBe(150000);
      expect(job.salary?.max).toBe(200000);
      expect(job.salary?.currency).toBe('USD');
      expect(job.rawData).toBeDefined();
    });
  });
});
