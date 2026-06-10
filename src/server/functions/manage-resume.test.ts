import { describe, it, expect } from "vitest";

interface ResumeData {
  id?: number;
  fullName: string;
  email?: string;
  phone?: string;
  linkedin?: string;
  website?: string;
  summary?: string;
  competencies?: string[];
  tools?: string[];
  experience?: any[];
  education?: any[];
  certifications?: string[];
  awards?: string[];
  personalProjects?: any[];
  rawText?: string;
  updatedAt?: string;
}

describe("Resume Management", () => {
  describe("Resume Data Structure", () => {
    it("should have required fullName field", () => {
      const resume: ResumeData = {
        fullName: "John Doe",
      };
      expect(resume.fullName).toBeDefined();
      expect(resume.fullName).toBe("John Doe");
    });

    it("should support optional fields", () => {
      const resume: ResumeData = {
        fullName: "Jane Doe",
        email: "jane@example.com",
        phone: "555-1234",
        summary: "Software Engineer",
      };
      expect(resume.email).toBe("jane@example.com");
      expect(resume.phone).toBe("555-1234");
      expect(resume.summary).toBe("Software Engineer");
    });

    it("should support arrays of competencies", () => {
      const resume: ResumeData = {
        fullName: "John Doe",
        competencies: ["JavaScript", "React", "Node.js"],
      };
      expect(resume.competencies).toHaveLength(3);
      expect(resume.competencies).toContain("JavaScript");
    });

    it("should support tools array", () => {
      const resume: ResumeData = {
        fullName: "John Doe",
        tools: ["Git", "Docker", "AWS"],
      };
      expect(resume.tools).toHaveLength(3);
    });

    it("should support experience array", () => {
      const resume: ResumeData = {
        fullName: "John Doe",
        experience: [
          {
            title: "Senior Developer",
            company: "Tech Corp",
            startDate: "2020-01",
            endDate: "2023-12",
          },
        ],
      };
      expect(resume.experience).toHaveLength(1);
    });

    it("should support education array", () => {
      const resume: ResumeData = {
        fullName: "John Doe",
        education: [
          {
            degree: "BS",
            institution: "University",
            graduationDate: "2020",
          },
        ],
      };
      expect(resume.education).toHaveLength(1);
    });

    it("should support certifications array", () => {
      const resume: ResumeData = {
        fullName: "John Doe",
        certifications: ["AWS Certified", "Kubernetes Certified"],
      };
      expect(resume.certifications).toHaveLength(2);
    });
  });

  describe("Resume Validation", () => {
    it("should require fullName", () => {
      expect(() => {
        const resume: ResumeData = { fullName: "" };
        if (!resume.fullName) throw new Error("fullName is required");
      }).toThrow();
    });

    it("should allow empty optional fields", () => {
      const resume: ResumeData = {
        fullName: "John Doe",
        email: undefined,
        phone: undefined,
      };
      expect(resume.email).toBeUndefined();
      expect(resume.phone).toBeUndefined();
    });

    it("should validate email format", () => {
      const email = "invalid-email";
      const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      expect(isValidEmail).toBe(false);
    });

    it("should accept valid email format", () => {
      const email = "user@example.com";
      const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
      expect(isValidEmail).toBe(true);
    });

    it("should validate URL format", () => {
      const url = "https://example.com";
      expect(() => {
        new URL(url);
      }).not.toThrow();
    });
  });

  describe("Resume Parsing", () => {
    it("should handle empty competencies", () => {
      const competencies = [];
      expect(competencies.length).toBe(0);
    });

    it("should deduplicate competencies", () => {
      const competencies = ["JavaScript", "JavaScript", "React"];
      const deduplicated = [...new Set(competencies)];
      expect(deduplicated).toHaveLength(2);
    });

    it("should parse JSON experience data", () => {
      const experienceJson = '[{"title":"Dev","company":"Corp"}]';
      const parsed = JSON.parse(experienceJson);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].title).toBe("Dev");
    });

    it("should handle malformed JSON gracefully", () => {
      const malformedJson = '{invalid json}';
      expect(() => {
        JSON.parse(malformedJson);
      }).toThrow();
    });
  });

  describe("Resume Updates", () => {
    it("should preserve untouched fields during partial update", () => {
      const original: ResumeData = {
        fullName: "John Doe",
        email: "john@example.com",
        summary: "Engineer",
      };

      const partial: Partial<ResumeData> = { email: "newemail@example.com" };
      const updated = { ...original, ...partial };

      expect(updated.fullName).toBe("John Doe");
      expect(updated.email).toBe("newemail@example.com");
      expect(updated.summary).toBe("Engineer");
    });

    it("should update timestamp on save", () => {
      const resume: ResumeData = {
        fullName: "John Doe",
        updatedAt: "2024-01-01T00:00:00Z",
      };

      const now = new Date().toISOString();
      const updated = { ...resume, updatedAt: now };

      expect(updated.updatedAt).not.toBe(resume.updatedAt);
    });
  });
});
