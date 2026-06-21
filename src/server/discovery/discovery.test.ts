import { describe, it, expect, vi, beforeEach } from 'vitest';
import { extractTokenFromUrl, inferTokenFromCompanyDomain } from './patterns';
import { validateBoardToken } from './consumer';
import { monitorIndeedForJobs } from './feeds';

describe('Dynamic Board Discovery Unit Tests', () => {
  describe('extractTokenFromUrl', () => {
    it('should parse Greenhouse URLs and extract the board token', () => {
      expect(
        extractTokenFromUrl('https://boards.greenhouse.io/vercel/jobs', 'greenhouse')
      ).toBe('vercel');

      expect(
        extractTokenFromUrl('https://boards-api.greenhouse.io/v1/boards/stripe/jobs?content=false', 'greenhouse')
      ).toBe('stripe');

      expect(
        extractTokenFromUrl('https://boards.greenhouse.io/supabase', 'greenhouse')
      ).toBe('supabase');
    });

    it('should parse Lever URLs and extract the company token', () => {
      expect(
        extractTokenFromUrl('https://jobs.lever.co/vercel', 'lever')
      ).toBe('vercel');

      expect(
        extractTokenFromUrl('https://api.lever.co/v0/postings/stripe?mode=json', 'lever')
      ).toBe('stripe');
    });

    it('should parse Ashby URLs and extract the company token', () => {
      expect(
        extractTokenFromUrl('https://jobs.ashbyhq.com/linear', 'ashby')
      ).toBe('linear');

      expect(
        extractTokenFromUrl('https://api.ashbyhq.com/posting-api/job-board/railway', 'ashby')
      ).toBe('railway');
    });

    it('should parse Workable URLs and extract the company token', () => {
      expect(
        extractTokenFromUrl('https://apply.workable.com/api/v1/widget/accounts/superhuman', 'workable')
      ).toBe('superhuman');

      expect(
        extractTokenFromUrl('https://www.workable.com/careers/superhuman', 'workable')
      ).toBe('superhuman');
    });

    it('should return empty string for invalid URLs or mismatched ATS platforms', () => {
      expect(
        extractTokenFromUrl('https://google.com', 'greenhouse')
      ).toBe('');

      expect(
        extractTokenFromUrl('invalid-url', 'lever')
      ).toBe('');
    });
  });

  describe('inferTokenFromCompanyDomain', () => {
    it('should infer candidate tokens from company domains', () => {
      expect(inferTokenFromCompanyDomain('vercel.com')).toBe('vercel');
      expect(inferTokenFromCompanyDomain('stripe.com')).toBe('stripe');
      expect(inferTokenFromCompanyDomain('acme-labs.co.uk')).toBe('acme-labs');
    });
  });

  describe('validateBoardToken', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('should return true for valid Greenhouse boards (HTTP 200)', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        status: 200,
        ok: true,
      });
      vi.stubGlobal('fetch', mockFetch);

      const isValid = await validateBoardToken('greenhouse', 'vercel');
      expect(isValid).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://boards-api.greenhouse.io/v1/boards/vercel/jobs?content=false',
        expect.any(Object)
      );
    });

    it('should return false for invalid Lever boards (HTTP 404)', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        status: 404,
        ok: false,
      });
      vi.stubGlobal('fetch', mockFetch);

      const isValid = await validateBoardToken('lever', 'non-existent-token');
      expect(isValid).toBe(false);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.lever.co/v0/postings/non-existent-token?mode=json',
        expect.any(Object)
      );
    });

    it('should handle network errors gracefully and return false', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network disconnected'));
      vi.stubGlobal('fetch', mockFetch);

      const isValid = await validateBoardToken('ashby', 'railway');
      expect(isValid).toBe(false);
    });
  });

  describe('monitorIndeedForJobs', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('should extract boards from Indeed when successful', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: async () => `
          <html>
            <body>
              <a href="https://boards.greenhouse.io/acme-corp/jobs/1">Acme Greenhouse</a>
              <a href="https://jobs.lever.co/another-corp">Another Corp Lever</a>
            </body>
          </html>
        `
      });
      vi.stubGlobal('fetch', mockFetch);

      const boards = await monitorIndeedForJobs(['engineering'], {});
      expect(boards).toEqual([
        { company: 'Acme-corp', ats: 'greenhouse', token: 'acme-corp', source: 'rss' },
        { company: 'Another-corp', ats: 'lever', token: 'another-corp', source: 'rss' }
      ]);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should fall back to Hacker News RSS feed when Indeed returns 403', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 403,
          statusText: 'Forbidden'
        })
        .mockResolvedValueOnce({
          ok: true,
          text: async () => `
            <rss>
              <item>
                <description>
                  <![CDATA[We use Greenhouse: https://boards.greenhouse.io/fallback-corp]]>
                </description>
              </item>
            </rss>
          `
        });
      vi.stubGlobal('fetch', mockFetch);

      const boards = await monitorIndeedForJobs(['engineering'], {});
      expect(boards).toEqual([
        { company: 'Fallback-corp', ats: 'greenhouse', token: 'fallback-corp', source: 'rss' }
      ]);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });
});
