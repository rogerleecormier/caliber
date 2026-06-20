import { describe, it, expect } from 'vitest';
import { jaroWinkler } from './fuzzy';

describe('Deduplication Pipeline', () => {
  describe('jaroWinkler distance metric', () => {
    it('should return 1.0 for exact matches', () => {
      expect(jaroWinkler('Software Engineer', 'Software Engineer')).toBe(1.0);
      expect(jaroWinkler('software engineer', 'SOFTWARE ENGINEER')).toBe(1.0);
    });

    it('should return 0.0 for completely different strings or empty inputs', () => {
      expect(jaroWinkler('', 'Software Engineer')).toBe(0.0);
      expect(jaroWinkler('abc', 'xyz')).toBe(0.0);
    });

    it('should calculate correct similarity for similar titles', () => {
      const sim = jaroWinkler('Software Engineer', 'Senior Software Engineer');
      expect(sim).toBeGreaterThan(0.7);
    });
  });
});
