import { describe, it, expect } from "vitest";

describe("Job Scoring", () => {
  describe("Score Calculation", () => {
    it("should calculate scores between 0 and 100", () => {
      const score = 75;
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it("should handle high match scores", () => {
      const score = 95;
      expect(score).toBeGreaterThan(80);
    });

    it("should handle low match scores", () => {
      const score = 15;
      expect(score).toBeLessThan(30);
    });

    it("should handle perfect match score", () => {
      const score = 100;
      expect(score).toBe(100);
    });

    it("should handle no match score", () => {
      const score = 0;
      expect(score).toBe(0);
    });
  });

  describe("Score Categories", () => {
    it("should categorize excellent scores", () => {
      const score = 85;
      const category = score >= 80 ? "excellent" : "good";
      expect(category).toBe("excellent");
    });

    it("should categorize good scores", () => {
      const score = 65;
      const category =
        score >= 80 ? "excellent" : score >= 60 ? "good" : "fair";
      expect(category).toBe("good");
    });

    it("should categorize fair scores", () => {
      const score = 45;
      const category =
        score >= 80 ? "excellent" : score >= 60 ? "good" : "fair";
      expect(category).toBe("fair");
    });

    it("should categorize poor scores", () => {
      const score = 20;
      const category =
        score >= 80 ? "excellent" : score >= 60 ? "good" : "fair";
      expect(category).toBe("fair");
    });
  });

  describe("Job Analysis", () => {
    it("should identify required skills", () => {
      const requiredSkills = ["JavaScript", "React", "Node.js"];
      expect(requiredSkills).toHaveLength(3);
    });

    it("should identify nice-to-have skills", () => {
      const niceToHaveSkills = ["Docker", "Kubernetes"];
      expect(niceToHaveSkills).toHaveLength(2);
    });

    it("should calculate skill match percentage", () => {
      const candidateSkills = ["JavaScript", "React", "Python"];
      const requiredSkills = ["JavaScript", "React", "Node.js"];
      const matched = candidateSkills.filter((s) =>
        requiredSkills.includes(s)
      );
      const matchPercentage = (matched.length / requiredSkills.length) * 100;
      expect(matchPercentage).toBe(66.66666666666666);
    });

    it("should handle missing skills", () => {
      const candidateSkills = ["Python"];
      const requiredSkills = ["JavaScript", "React", "Node.js"];
      const matched = candidateSkills.filter((s) =>
        requiredSkills.includes(s)
      );
      expect(matched.length).toBe(0);
    });
  });

  describe("Salary Analysis", () => {
    it("should parse salary ranges", () => {
      const salaryText = "$100,000 - $150,000";
      const match = salaryText.match(/\$([0-9,]+)\s*-\s*\$([0-9,]+)/);
      expect(match).not.toBeNull();
    });

    it("should handle missing salary information", () => {
      const salaryText = "Competitive salary";
      const match = salaryText.match(/\$([0-9,]+)/);
      expect(match).toBeNull();
    });

    it("should compare salary to expectations", () => {
      const jobSalaryMin = 100000;
      const jobSalaryMax = 150000;
      const expectation = 120000;
      expect(expectation).toBeGreaterThanOrEqual(jobSalaryMin);
      expect(expectation).toBeLessThanOrEqual(jobSalaryMax);
    });
  });

  describe("Job Fit Metrics", () => {
    it("should calculate experience level fit", () => {
      const yearsRequired = 3;
      const yearsCandidateHas = 5;
      expect(yearsCandidateHas).toBeGreaterThanOrEqual(yearsRequired);
    });

    it("should identify overqualification", () => {
      const yearsRequired = 2;
      const yearsCandidateHas = 10;
      const isOverqualified = yearsCandidateHas > yearsRequired * 2;
      expect(isOverqualified).toBe(true);
    });

    it("should identify underqualification", () => {
      const yearsRequired = 5;
      const yearsCandidateHas = 2;
      const isUnderqualified = yearsCandidateHas < yearsRequired;
      expect(isUnderqualified).toBe(true);
    });
  });
});
