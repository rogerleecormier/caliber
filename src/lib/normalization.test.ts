import { describe, it, expect } from 'vitest';
import { normalizeCompany, normalizeTitle, normalizeLocation, normalizeJob } from './normalization';
import type { AtsJobResponse } from '@/types/crawler';

describe('Normalization Rules', () => {
  describe('normalizeCompany', () => {
    it('should strip common suffixes and punctuation', () => {
      expect(normalizeCompany('Google LLC')).toBe('google');
      expect(normalizeCompany('Acme Corp.')).toBe('acme');
      expect(normalizeCompany('OpenAI Inc')).toBe('openai');
    });

    it('should collapse whitespace and handle lowercase conversion', () => {
      expect(normalizeCompany('  Acme   Corporation  ')).toBe('acme');
    });

    it('should use custom nickname mappings', () => {
      expect(normalizeCompany('AWS')).toBe('amazon web services');
      expect(normalizeCompany('Amazon')).toBe('amazon web services');
      expect(normalizeCompany('MSFT')).toBe('microsoft');
      expect(normalizeCompany('Meta')).toBe('facebook');
    });
  });

  describe('normalizeTitle', () => {
    it('should strip remote/hybrid suffixes and parentheses', () => {
      expect(normalizeTitle('Software Engineer (Remote)')).toBe('software engineer');
      expect(normalizeTitle('Product Manager [Hybrid]')).toBe('product manager');
    });

    it('should standardize seniority abbreviations', () => {
      expect(normalizeTitle('Sr. Software Engineer')).toBe('senior software engineer');
      expect(normalizeTitle('Junior PM')).toBe('junior product manager');
      expect(normalizeTitle('Staff QA')).toBe('staff qa engineer');
      expect(normalizeTitle('Lead SWE')).toBe('lead software engineer');
    });

    it('should strip roman numerals and separator suffixes', () => {
      expect(normalizeTitle('Software Engineer II')).toBe('software engineer');
      expect(normalizeTitle('Software Engineer - US Remote')).toBe('software engineer');
      expect(normalizeTitle('SRE | Infrastructure Team')).toBe('site reliability engineer');
    });
  });

  describe('normalizeLocation', () => {
    it('should detect remote locations', () => {
      expect(normalizeLocation('Remote, US')).toEqual({ locationDisplay: 'Remote', locationNorm: 'remote', remote: true });
      expect(normalizeLocation('Anywhere in US')).toEqual({ locationDisplay: 'Remote', locationNorm: 'remote', remote: true });
      expect(normalizeLocation(undefined)).toEqual({ locationDisplay: 'Remote', locationNorm: 'remote', remote: true });
    });

    it('should normalize onsite locations', () => {
      expect(normalizeLocation('New York, NY')).toEqual({
        locationDisplay: 'New York, NY',
        locationNorm: 'new york, ny',
        remote: false
      });
    });
  });

  describe('normalizeJob', () => {
    it('should fully normalize an AtsJobResponse', () => {
      const mockJob: AtsJobResponse = {
        id: '12345',
        title: 'Sr. Software Engineer (Remote)',
        company: 'Google LLC',
        location: 'New York, NY',
        description: 'We are looking for a software engineer...',
        compensation: {
          min: 120000,
          max: 180000,
          currency: 'USD'
        },
        employmentType: 'Full-time',
        experienceLevel: 'Senior',
        department: 'Engineering',
        team: 'Search',
        raw: {}
      };

      const result = normalizeJob(mockJob);

      expect(result.companyDisplay).toBe('Google LLC');
      expect(result.companyNorm).toBe('google');
      expect(result.titleDisplay).toBe('Sr. Software Engineer (Remote)');
      expect(result.titleNorm).toBe('senior software engineer');
      expect(result.locationDisplay).toBe('New York, NY');
      expect(result.locationNorm).toBe('new york, ny');
      expect(result.remote).toBe(false);
      expect(result.compensationMin).toBe(120000);
      expect(result.compensationMax).toBe(180000);
      expect(result.compensationCurrency).toBe('USD');
      expect(result.employmentType).toBe('Full-time');
      expect(result.experienceLevel).toBe('Senior');
      expect(result.department).toBe('Engineering');
      expect(result.team).toBe('Search');
      expect(result.dedupKey).toContain('google::senior software engineer::new york, ny');
      expect(result.rawHash).not.toBe('no-hash');
    });
  });
});
