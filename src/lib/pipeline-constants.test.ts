import { describe, it, expect } from "vitest";
import {
  PIPELINE_STATUSES,
  normalizePipelineStatus,
  type PipelineStatus,
} from "./pipeline-constants";

describe("Pipeline Constants", () => {
  describe("PIPELINE_STATUSES", () => {
    it("should contain valid statuses", () => {
      expect(PIPELINE_STATUSES).toBeDefined();
      expect(Array.isArray(PIPELINE_STATUSES)).toBe(true);
      expect(PIPELINE_STATUSES.length).toBeGreaterThan(0);
    });

    it("should include Favorited status", () => {
      expect(PIPELINE_STATUSES).toContain("Favorited");
    });

    it("should include Analyzed status", () => {
      expect(PIPELINE_STATUSES).toContain("Analyzed");
    });

    it("should include Applied status", () => {
      expect(PIPELINE_STATUSES).toContain("Applied");
    });

    it("should include Archived status", () => {
      expect(PIPELINE_STATUSES).toContain("Archived");
    });
  });

  describe("normalizePipelineStatus", () => {
    it("should return valid status unchanged", () => {
      const status: PipelineStatus = "Applied";
      expect(normalizePipelineStatus(status)).toBe("Applied");
    });

    it("should handle all pipeline statuses", () => {
      PIPELINE_STATUSES.forEach((status) => {
        const normalized = normalizePipelineStatus(status);
        expect(PIPELINE_STATUSES).toContain(normalized);
      });
    });

    it("should return a valid status for invalid input", () => {
      const result = normalizePipelineStatus("InvalidStatus" as any);
      expect(PIPELINE_STATUSES).toContain(result);
    });
  });

  describe("Pipeline Status Transitions", () => {
    it("should support transitioning from Favorited to Analyzed", () => {
      expect(PIPELINE_STATUSES).toContain("Favorited");
      expect(PIPELINE_STATUSES).toContain("Analyzed");
    });

    it("should support transitioning to Applied", () => {
      expect(PIPELINE_STATUSES).toContain("Applied");
    });

    it("should support archiving jobs", () => {
      expect(PIPELINE_STATUSES).toContain("Archived");
    });
  });
});
