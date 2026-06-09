import { describe, it, expect, vi } from "vitest";
import {
  parsePlaintextSection,
  parseSectionResponse,
  getDefaultSectionValue,
  enforceGuardrails,
} from "./resume-section-parsing";

describe("getDefaultSectionValue", () => {
  it("returns empty string for professional_summary", () => {
    expect(getDefaultSectionValue("professional_summary")).toBe("");
  });

  it("returns empty arrays for list-based sections", () => {
    for (const section of [
      "core_competencies",
      "technical_skills",
      "professional_experience",
      "personal_projects",
      "education",
      "certifications",
      "awards",
    ] as const) {
      expect(getDefaultSectionValue(section)).toEqual([]);
    }
  });
});

describe("enforceGuardrails - professional_summary", () => {
  it("returns empty string for empty/whitespace input", () => {
    expect(enforceGuardrails("professional_summary", "")).toBe("");
    expect(enforceGuardrails("professional_summary", "   ")).toBe("");
  });

  it("passes through a valid 3-sentence summary under 60 words", () => {
    const summary = "Experienced PM with 15 years in SaaS. Delivered 10+ integrations across finance platforms. Reduced manual work by 40% via automation.";
    expect(enforceGuardrails("professional_summary", summary)).toBe(summary);
  });

  it("truncates summaries over 60 words at the last sentence boundary", () => {
    const longSentence = (n: number) => Array.from({ length: n }, (_, i) => `word${i}`).join(" ");
    const summary = `${longSentence(25)}. ${longSentence(25)}. ${longSentence(25)}.`;
    const result = enforceGuardrails("professional_summary", summary) as string;

    const wordCount = result.split(/\s+/).filter(Boolean).length;
    expect(wordCount).toBeLessThanOrEqual(60);
    expect(result.endsWith(".")).toBe(true);
  });

  it("trims summaries with more than 4 sentences down to 4", () => {
    const summary = "One sentence here. Two sentence here. Three sentence here. Four sentence here. Five sentence here.";
    const result = enforceGuardrails("professional_summary", summary) as string;
    const sentenceCount = result.split(/[.!?]+/).filter((s) => s.trim().length > 0).length;
    expect(sentenceCount).toBe(4);
  });

  it("warns but does not throw for fewer than 3 sentences", () => {
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const summary = "Just one sentence here.";
    const result = enforceGuardrails("professional_summary", summary);
    expect(result).toBe(summary);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});

describe("enforceGuardrails - core_competencies", () => {
  it("passes through exactly 8 items unchanged", () => {
    const comps = Array.from({ length: 8 }, (_, i) => `Competency ${i + 1}`);
    expect(enforceGuardrails("core_competencies", comps)).toEqual(comps);
  });

  it("pads with empty strings when fewer than 8", () => {
    const comps = ["A", "B", "C"];
    const result = enforceGuardrails("core_competencies", comps);
    expect(result).toHaveLength(8);
    expect(result.slice(0, 3)).toEqual(["A", "B", "C"]);
    expect(result.slice(3)).toEqual(["", "", "", "", ""]);
  });

  it("truncates to 8 when more than 8", () => {
    const comps = Array.from({ length: 12 }, (_, i) => `Competency ${i + 1}`);
    const result = enforceGuardrails("core_competencies", comps);
    expect(result).toHaveLength(8);
    expect(result).toEqual(comps.slice(0, 8));
  });

  it("filters out non-string and empty entries before counting", () => {
    const comps = ["A", "", "B", null, undefined, "C"];
    const result = enforceGuardrails("core_competencies", comps);
    expect(result.slice(0, 3)).toEqual(["A", "B", "C"]);
    expect(result).toHaveLength(8);
  });

  it("handles non-array input", () => {
    const result = enforceGuardrails("core_competencies", null);
    expect(result).toHaveLength(8);
    expect(result.every((c: string) => c === "")).toBe(true);
  });
});

describe("enforceGuardrails - technical_skills", () => {
  const makeCategories = (n: number) =>
    Array.from({ length: n }, (_, i) => ({
      category: `Category ${i + 1}`,
      skills: ["Skill A", "Skill B"],
    }));

  it("passes through 5-6 valid categories unchanged", () => {
    const cats = makeCategories(5);
    expect(enforceGuardrails("technical_skills", cats)).toEqual(cats);

    const cats6 = makeCategories(6);
    expect(enforceGuardrails("technical_skills", cats6)).toEqual(cats6);
  });

  it("trims to 6 categories when more than 6", () => {
    const cats = makeCategories(9);
    const result = enforceGuardrails("technical_skills", cats);
    expect(result).toHaveLength(6);
    expect(result).toEqual(cats.slice(0, 6));
  });

  it("filters out categories with no category name or empty skills", () => {
    const cats = [
      { category: "Valid", skills: ["A"] },
      { category: "", skills: ["B"] },
      { category: "NoSkills", skills: [] },
      { category: "AlsoValid", skills: ["C"] },
    ];
    const result = enforceGuardrails("technical_skills", cats);
    expect(result).toEqual([
      { category: "Valid", skills: ["A"] },
      { category: "AlsoValid", skills: ["C"] },
    ]);
  });

  it("handles non-array input by returning empty array", () => {
    expect(enforceGuardrails("technical_skills", null)).toEqual([]);
    expect(enforceGuardrails("technical_skills", undefined)).toEqual([]);
  });
});

describe("enforceGuardrails - professional_experience", () => {
  it("trims bullets to 6 per role", () => {
    const roles = [
      {
        title: "Engineer",
        company: "Acme",
        dates: "2020 - Present",
        bullets: Array.from({ length: 10 }, (_, i) => `Bullet ${i + 1}`),
      },
    ];
    const result = enforceGuardrails("professional_experience", roles);
    expect(result[0].bullets).toHaveLength(6);
    expect(result[0].bullets).toEqual(roles[0].bullets.slice(0, 6));
  });

  it("filters out non-string/empty bullets", () => {
    const roles = [
      {
        title: "Engineer",
        company: "Acme",
        dates: "2020 - Present",
        bullets: ["Valid bullet", "", null, "Another valid bullet"],
      },
    ];
    const result = enforceGuardrails("professional_experience", roles);
    expect(result[0].bullets).toEqual(["Valid bullet", "Another valid bullet"]);
  });

  it("preserves roles with 6 or fewer bullets unchanged", () => {
    const roles = [
      { title: "Engineer", company: "Acme", dates: "2020", bullets: ["A", "B", "C"] },
    ];
    expect(enforceGuardrails("professional_experience", roles)).toEqual(roles);
  });

  it("handles non-array input", () => {
    expect(enforceGuardrails("professional_experience", null)).toEqual([]);
  });
});

describe("enforceGuardrails - personal_projects", () => {
  const makeProjects = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ name: `Project ${i + 1}`, description: "desc" }));

  it("passes through 3-4 projects unchanged", () => {
    expect(enforceGuardrails("personal_projects", makeProjects(3))).toEqual(makeProjects(3));
    expect(enforceGuardrails("personal_projects", makeProjects(4))).toEqual(makeProjects(4));
  });

  it("trims to 4 projects when more are provided", () => {
    const projects = makeProjects(6);
    const result = enforceGuardrails("personal_projects", projects);
    expect(result).toHaveLength(4);
    expect(result).toEqual(projects.slice(0, 4));
  });

  it("filters out projects without a name", () => {
    const projects = [{ name: "Valid", description: "x" }, { description: "no name" }];
    expect(enforceGuardrails("personal_projects", projects)).toEqual([{ name: "Valid", description: "x" }]);
  });
});

describe("enforceGuardrails - passthrough sections", () => {
  it("returns education and certifications content unchanged", () => {
    const education = [{ degree: "B.S.", institution: "Excelsior", year: "2020" }];
    expect(enforceGuardrails("education", education)).toEqual(education);

    const certs = ["PMP", "CompTIA Network+"];
    expect(enforceGuardrails("certifications", certs)).toEqual(certs);
  });
});

describe("parsePlaintextSection", () => {
  it("extracts the first prose-like line for professional_summary", () => {
    const raw = "Sure, here's the summary:\nExperienced PM with 15 years driving SaaS delivery and automation.";
    expect(parsePlaintextSection(raw, "professional_summary")).toBe(
      "Experienced PM with 15 years driving SaaS delivery and automation.",
    );
  });

  it("extracts a bullet list for core_competencies", () => {
    const raw = "- Project Management\n- DevOps\n* Financial Systems\n1. Risk Management";
    expect(parsePlaintextSection(raw, "core_competencies")).toEqual([
      "Project Management",
      "DevOps",
      "Financial Systems",
      "Risk Management",
    ]);
  });

  it("falls back to comma-separated parsing for a single-line list", () => {
    const raw = "Project Management, DevOps, Financial Systems";
    expect(parsePlaintextSection(raw, "core_competencies")).toEqual([
      "Project Management",
      "DevOps",
      "Financial Systems",
    ]);
  });

  it("extracts certifications from a bullet list", () => {
    const raw = "• PMP\n• CompTIA Network+";
    expect(parsePlaintextSection(raw, "certifications")).toEqual(["PMP", "CompTIA Network+"]);
  });

  it("parses 'Category: skills' lines for technical_skills", () => {
    const raw = "PM Tools: Asana, Smartsheet, Jira\nCloud: Azure, AWS, GCP";
    expect(parsePlaintextSection(raw, "technical_skills")).toEqual([
      { category: "PM Tools", skills: ["Asana", "Smartsheet", "Jira"] },
      { category: "Cloud", skills: ["Azure", "AWS", "GCP"] },
    ]);
  });

  it("returns null for technical_skills when no category lines are found", () => {
    expect(parsePlaintextSection("Just some unrelated prose here.", "technical_skills")).toBeNull();
  });

  it("strips code fences before parsing", () => {
    const raw = "```\nPM Tools: Asana, Smartsheet\n```";
    expect(parsePlaintextSection(raw, "technical_skills")).toEqual([
      { category: "PM Tools", skills: ["Asana", "Smartsheet"] },
    ]);
  });

  it("returns null for structured sections (experience, projects, education)", () => {
    expect(parsePlaintextSection("Some plaintext.", "professional_experience")).toBeNull();
    expect(parsePlaintextSection("Some plaintext.", "personal_projects")).toBeNull();
    expect(parsePlaintextSection("Some plaintext.", "education")).toBeNull();
  });
});

describe("parseSectionResponse", () => {
  it("parses a well-formed JSON professional_summary response", () => {
    const raw = JSON.stringify({
      professionalSummary: "PM with 10 years of SaaS delivery experience. Led automation initiatives reducing manual work. Drove cross-functional integration projects.",
    });
    const result = parseSectionResponse(raw, "professional_summary");
    expect(result).toContain("PM with 10 years");
  });

  it("supports alternate field name casings", () => {
    const raw = JSON.stringify({ summary: "Alt field name summary text here for testing purposes today." });
    expect(parseSectionResponse(raw, "professional_summary")).toContain("Alt field name");
  });

  it("repairs slightly malformed JSON (trailing commas)", () => {
    const raw = `{"coreCompetencies": ["A", "B", "C", "D", "E", "F", "G", "H",]}`;
    const result = parseSectionResponse(raw, "core_competencies");
    expect(result).toEqual(["A", "B", "C", "D", "E", "F", "G", "H"]);
  });

  it("falls back to plaintext parsing when no JSON braces are present", () => {
    const raw = "- Project Management\n- DevOps\n- Financial Systems\n- Risk Management\n- Cloud Architecture\n- Compliance\n- Stakeholder Management\n- Process Automation";
    const result = parseSectionResponse(raw, "core_competencies");
    expect(result).toHaveLength(8);
    expect(result[0]).toBe("Project Management");
  });

  it("returns default value when response is unusable for structured sections", () => {
    const raw = "I'm sorry, I cannot help with that request.";
    expect(parseSectionResponse(raw, "professional_experience")).toEqual([]);
    expect(parseSectionResponse(raw, "personal_projects")).toEqual([]);
  });

  it("extracts certifications from 'awards' field as fallback", () => {
    const raw = JSON.stringify({ awards: ["PMP", "CompTIA Network+"] });
    expect(parseSectionResponse(raw, "certifications")).toEqual(["PMP", "CompTIA Network+"]);
  });

  it("filters technical_skills categories with empty skills arrays", () => {
    const raw = JSON.stringify({
      technicalSkills: [
        { category: "Valid", skills: ["A", "B"] },
        { category: "Empty", skills: [] },
      ],
    });
    expect(parseSectionResponse(raw, "technical_skills")).toEqual([
      { category: "Valid", skills: ["A", "B"] },
    ]);
  });

  it("applies guardrails after parsing (e.g. trims experience bullets to 6)", () => {
    const raw = JSON.stringify({
      experience: [
        {
          title: "Engineer",
          company: "Acme",
          dates: "2020 - Present",
          bullets: Array.from({ length: 10 }, (_, i) => `Bullet ${i + 1}`),
        },
      ],
    });
    const result = parseSectionResponse(raw, "professional_experience");
    expect(result[0].bullets).toHaveLength(6);
  });
});
