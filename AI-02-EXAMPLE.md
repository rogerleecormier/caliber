# AI-02: Structured Gap Analysis - Usage Example

## Example: Senior React Engineer Role Analysis

### Input
**Job Description**: "We're looking for a Senior React Engineer with 5+ years experience, strong TypeScript skills, Node.js backend knowledge, Kubernetes deployment experience (preferred), and AWS cloud services (nice-to-have)."

**Candidate Resume**: Has 7 years React, 6 years TypeScript, 3 years Node.js, no Kubernetes, some GCP experience.

### LLM Output (Structured JSON)

```json
{
  "jobTitle": "Senior React Engineer",
  "company": "TechCorp",
  "matchScore": 78,
  "gapAnalysis": {
    "matched": [
      {
        "requirement": "5+ years React experience",
        "requirementType": "required",
        "explanation": "Candidate has 7 years of professional React experience across multiple projects"
      },
      {
        "requirement": "Strong TypeScript skills",
        "requirementType": "required",
        "explanation": "Candidate has 6 years of TypeScript, with expertise in advanced patterns and type inference"
      },
      {
        "requirement": "Node.js backend knowledge",
        "requirementType": "required",
        "explanation": "Candidate has 3 years building Express.js APIs and microservices"
      }
    ],
    "partial": [
      {
        "requirement": "Kubernetes deployment",
        "requirementType": "preferred",
        "explanation": "Candidate has Docker containerization experience but limited direct Kubernetes cluster management - would require brief ramp-up"
      },
      {
        "requirement": "AWS cloud services",
        "requirementType": "preferred",
        "explanation": "Candidate has comparable GCP experience with similar services (Compute Engine, Cloud SQL) - concepts transfer well"
      }
    ],
    "gap": []
  },
  "recommendations": [
    "Highlight Node.js projects prominently in resume",
    "Add Docker/containerization work to technical skills section",
    "Mention any learning initiatives around Kubernetes if applicable"
  ]
}
```

### Frontend Rendering

The UI displays this as:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Requirements Analysis  [████████████░░░░░░░]  78% Match
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Progress: 3 matched • 2 partial • 0 gaps

MATCHED REQUIREMENTS ✓
├─ 5+ years React experience [REQUIRED]
│  └─ Candidate has 7 years of professional React experience across multiple projects
├─ Strong TypeScript skills [REQUIRED]
│  └─ Candidate has 6 years of TypeScript, with expertise in advanced patterns and type inference
└─ Node.js backend knowledge [REQUIRED]
   └─ Candidate has 3 years building Express.js APIs and microservices

PARTIAL REQUIREMENTS ⚠️
├─ Kubernetes deployment [PREFERRED]
│  └─ Candidate has Docker containerization experience but limited direct Kubernetes cluster 
│     management - would require brief ramp-up
└─ AWS cloud services [PREFERRED]
   └─ Candidate has comparable GCP experience with similar services (Compute Engine, Cloud SQL) 
      - concepts transfer well

GAPS ✗
(none)
```

## Data Structure Breakdown

### Before (Unstructured/Mixed Status)
```typescript
gapAnalysis: [
  { requirement: "...", status: "covered", suggestion: "..." },
  { requirement: "...", status: "covered", suggestion: "..." },
  { requirement: "...", status: "partial", suggestion: "..." },
  { requirement: "...", status: "partial", suggestion: "..." },
]
// Problem: All mixed together, unclear which are covered vs partial
```

### After (Structured Three-Array)
```typescript
gapAnalysis: {
  matched: [
    { requirement: "...", requirementType: "required", explanation: "..." },
    { requirement: "...", requirementType: "required", explanation: "..." },
    { requirement: "...", requirementType: "required", explanation: "..." },
  ],
  partial: [
    { requirement: "...", requirementType: "preferred", explanation: "..." },
    { requirement: "...", requirementType: "preferred", explanation: "..." },
  ],
  gap: [] // Explicitly empty, zero ambiguity
}
// Solution: Clear separation, three arrays, zero hallucination
```

## Type Safety Example

```typescript
// This is impossible with the new schema:
const analysis: StructuredGapAnalysis = {
  matched: [/* ... */],
  partial: [/* ... */],
  gap: [/* ... */],
  someRandomField: "invalid" // ❌ TypeScript error!
};

// And this will fail at parse time:
const json = `{
  "matched": [...],
  "partial": [...],
  "gap": [...],
  "matchedButMisssingRequirement": true // ❌ Missing "explanation" field
}`;

const parsed = StructuredGapAnalysisSchema.parse(json);
// Error: gapAnalysis.partial[0] missing required field "explanation"
```

## Frontend Integration

The analysis component automatically handles the structured format:

```typescript
// The component works with the converted legacy format
const gapArray = Array.isArray(analysis.gapAnalysis) ? analysis.gapAnalysis : [];

// For future iterations, can also work with structured:
if (!Array.isArray(analysis.gapAnalysis)) {
  const matched = analysis.gapAnalysis.matched.length;
  const partial = analysis.gapAnalysis.partial.length;
  const gap = analysis.gapAnalysis.gap.length;
  // Render with different UI if desired
}
```

## Key Improvements Over Previous Approach

| Aspect | Before | After |
|--------|--------|-------|
| **Ambiguity** | Items mixed in array | Clear three-bucket separation |
| **Type Safety** | String status field | TypeScript enum validation |
| **Zero-Shot Prompt** | Generic instructions | Explicit three-array directive |
| **Schema Validation** | Manual string parsing | Zod runtime validation |
| **Data Quality** | Occasional malformed JSON | Guaranteed valid structure |
| **Frontend Clarity** | Filter by status string | Direct array access |
| **Hallucination Risk** | LLM could add extra fields | Zod rejects unknown fields |

## Migration Path

The implementation uses a **backward-compatible bridge**:

1. **LLM returns** structured format (matched/partial/gap)
2. **Backend validates** with Zod schema
3. **Conversion layer** transforms to legacy format
4. **Database stores** legacy format (no migration needed)
5. **Frontend renders** legacy format (no UI changes)

**Future**: When ready to fully adopt structured format:
- Update database schema to store {matched, partial, gap}
- Update frontend to render directly from structured format
- Remove conversion layer
- Zero breaking changes during transition
