const PROMPT_ECHO_MARKERS = [
  "current summary",
  "target job",
  "job description",
  "executive resume strategist",
  "core competencies from a provided list",
  "competencies explicitly in the candidate",
  "keyword alignment",
  "order by relevance",
  "single skill/domain area",
  "json only",
  "no markdown",
  "no prose",
  "respond with only",
  "return only this exact json",
];

const looksLikePromptEcho = (value) => {
  const haystack = (typeof value === "string" ? value : JSON.stringify(value)).toLowerCase();
  const matched = PROMPT_ECHO_MARKERS.filter((m) => haystack.includes(m));
  return {
    isEcho: matched.length > 0,
    matchedMarkers: matched
  };
};

const testSummaries = [
  "PMP-certified Technical Project Manager with 15+ years of experience. Expert in Model Context Protocol (MCP) server implementations. Eager to contribute to the target job.",
  "Experienced developer with 8 years of experience aligning development teams with the job description.",
  "Summarize the CURRENT SUMMARY to fit the TARGET JOB", // True prompt echo
  "PMP-certified Technical Project Manager, Solutions Architect, and Full-Stack AI Engineer with 15+ years of experience."
];

console.log("=== Testing Summaries ===");
testSummaries.forEach(s => {
  console.log(`\nText: "${s}"`);
  console.log("Result:", looksLikePromptEcho(s));
});

const testCompetencies = [
  ["Project Management", "Agile Delivery", "Aligning to target job requirements"],
  ["Enterprise technology roadmap development", "Keyword Alignment", "Cross-functional leadership"],
  ["Competency 1", "Competency 2", "Competency 3"]
];

console.log("\n=== Testing Competencies ===");
testCompetencies.forEach(c => {
  console.log(`\nCompetencies:`, c);
  console.log("Result:", looksLikePromptEcho(c));
});
