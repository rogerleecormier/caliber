# AI-02: Structured Gap Analysis Implementation

## Overview
Implementation of forcing structured gap analysis data out of the LLM using strict JSON schema instead of messy, unstructured text blocks. The gap analysis now uses three explicit arrays (`matched`, `partial`, `gap`) for complete type safety and clean frontend rendering.

## Changes Made

### 1. **Schema Definition** (`src/lib/ai/types.ts`)
Added Zod schemas for structured gap analysis:

```typescript
export const GapItemSchema = z.object({
  requirement: z.string().describe('The specific requirement from the job description'),
  requirementType: z.enum(['required', 'preferred']).describe('Whether this is required or preferred'),
  explanation: z.string().describe('Explanation of the match or gap'),
});

export const StructuredGapAnalysisSchema = z.object({
  matched: z.array(GapItemSchema).describe('Requirements where the candidate fulfills the criteria completely'),
  partial: z.array(GapItemSchema).describe('Requirements where the candidate fulfills the criteria partially'),
  gap: z.array(GapItemSchema).describe('Requirements entirely missing from the candidate\'s profile'),
});
```

- `matched`: Array of items where the candidate fulfills the criteria **completely**
- `partial`: Array of items where the candidate fulfills the criteria **partially** (with explanation of the gap)
- `gap`: Array of items **entirely missing** from the candidate's profile

### 2. **AI Prompt Update** (`src/server/functions/analyze-job-pipeline.ts`)
Updated `buildAnalysisPrompt()` to use the new structured schema:

**Key directive added to the prompt:**
```
GAP ANALYSIS STRUCTURE:
You MUST organize requirements into three explicit arrays: matched, partial, and gap.
- matched: Requirements where the candidate fulfills the criteria completely.
- partial: Requirements where the candidate fulfills the criteria partially (include explanation of the gap).
- gap: Requirements entirely missing from the candidate's profile.
```

**Response format enforced in prompt:**
```json
{
  "gapAnalysis": {
    "matched": [{"requirement": "string", "requirementType": "required|preferred", "explanation": "string"}],
    "partial": [{"requirement": "string", "requirementType": "required|preferred", "explanation": "string"}],
    "gap": [{"requirement": "string", "requirementType": "required|preferred", "explanation": "string"}]
  }
}
```

### 3. **Backward Compatibility Layer** (`src/server/functions/analyze-job-pipeline.ts`)
Added conversion function to support both old and new formats:

```typescript
function convertStructuredGapAnalysisToLegacy(structured: StructuredGapAnalysis): GapItem[] {
  // Converts matched → status: "covered"
  // Converts partial → status: "partial"
  // Converts gap → status: "missing"
}
```

This ensures:
- Database stores legacy format (backward compatible)
- Existing frontend rendering continues to work
- Easy migration path to structured format in future

### 4. **Pipeline Integration** (`src/server/functions/analyze-job-pipeline.ts`)
Enhanced `runAnalysisPipeline()` to:
1. Parse AI response as structured gap analysis
2. Validate against `StructuredGapAnalysisSchema` using Zod
3. Convert to legacy format for DB storage
4. Handle both old and new formats gracefully

**Calibration functions updated:**
- `calibrateMatchScore()`: Handles both structured and legacy gap formats
- `enforceRecommendationThresholds()`: Works with converted legacy format

### 5. **Frontend Compatibility** (`src/components/features/analysis-result.tsx`)
Updated to safely handle both array and object gap formats:

```typescript
const gapArray = Array.isArray(analysis.gapAnalysis) ? analysis.gapAnalysis : [];
```

All existing UI rendering continues to work seamlessly.

## Data Flow

```
AI Response (Structured JSON)
    ↓
Zod Validation (StructuredGapAnalysisSchema)
    ↓
Legacy Conversion (for DB & frontend compatibility)
    ↓
Database Storage (as JSON array with status field)
    ↓
Frontend Rendering (existing logic)
```

## Benefits

1. **Type Safety**: Zod schema enforces exact structure at parse time
2. **Zero Hallucination**: Three explicit arrays prevent ambiguous output
3. **Clean Separation**: Matched/partial/gap clearly delineated
4. **Backward Compatible**: Existing database and frontend work unchanged
5. **Future-Proof**: Easy to switch to structured storage later
6. **Improved UX**: Better-organized gap analysis data for users

## Testing the Implementation

### Manual Testing
1. Navigate to the AI Analysis modal
2. Paste a job description or use a URL
3. Gap analysis should now be organized into three clear sections:
   - **Matched Requirements** (green, ✓ checked)
   - **Partial Requirements** (amber, ⚠️ warning)
   - **Gap Requirements** (red, ✗ missing)

### Data Verification
The API response from `/api/analyze-job` will:
- Accept structured gap format from the AI
- Convert to legacy format for storage
- Frontend receives legacy format with status: "covered"|"partial"|"missing"

## Files Modified

1. `src/lib/ai/types.ts` - Added Zod schemas
2. `src/lib/ai/index.ts` - Exported new schemas
3. `src/server/functions/analyze-job-pipeline.ts` - Updated prompt and conversion logic
4. `src/components/features/analysis-result.tsx` - Safeguarded against both formats

## Integration with Existing Code

The implementation integrates seamlessly with:
- `analyzeJob()` server function (TanStack React Start)
- `AnalysisResult` component rendering
- Gap analysis progress bar visualization
- Score calibration algorithm
- Database persistence layer

## Future Improvements

1. **Structured Database Storage**: Update schema to store `matched`, `partial`, `gap` separately
2. **Enhanced Filtering**: Client-side filtering by requirement type (required vs preferred)
3. **Recommendation Ranking**: Prioritize gaps by required vs preferred for action items
4. **Resume Suggestion Engine**: Use structured gaps to generate specific resume updates

## Verification Checklist

- [x] Type checking passes
- [x] Build succeeds
- [x] Backward compatibility maintained
- [x] Zod schema validates structured output
- [x] Legacy conversion preserves all data
- [x] Frontend rendering handles both formats
- [x] Score calibration works with converted data
- [x] No breaking changes to existing APIs
