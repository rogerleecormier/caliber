# Semantic RAG Implementation (AI-01 & AI-03)

## Overview

This document describes the semantic RAG (Retrieval-Augmented Generation) matching pipeline for matching job descriptions to user resumes with zero-hallucination guarantees on Cloudflare Edge.

**Requirements Implemented:**
1. ✅ Cloudflare Vectorize binding & configuration (bge-large-en-v1.5)
2. ✅ Resume chunking utility with semantic block extraction
3. ✅ Job description pre-filtering via cosine similarity
4. ✅ Ground-truth context injection into document generation
5. ✅ Hard-coded zero-hallucination system prompt

---

## Architecture

### Data Flow

```
Resume Upload
    ↓
chunking (resume-chunking.ts)
    ↓
embedding via Workers AI (resume-embedding.ts)
    ↓
store in Vectorize + DB (resume_vector_index table)
    ↓
[User Analyzes Job]
    ↓
job description embedding (resume-matching.ts)
    ↓
cosine similarity matching → top-5 chunks (with diversity filter)
    ↓
format as ground-truth context
    ↓
inject into Claude prompt + zero-hallucination system prompt
    ↓
generate cover letter / tailored resume
```

---

## Components

### 1. Vectorize Configuration (wrangler.toml)

```toml
[[vectorize]]
binding = "VECTORIZE"
index_name = "resume-embeddings"
dimensions = 1024
```

**Model:** `@cf/baai/bge-large-en-v1.5` (bilingual, domain-agnostic, 1024 dimensions)

### 2. Database Schema (resume_vector_index)

Tracks vectorized resume chunks:
- `user_id` (FK)
- `section_type` (professional_summary, technical_skills, etc.)
- `chunk_index` (0-based within section)
- `chunk_text` (raw semantic block)
- `vector_id` (Vectorize namespace ID: `{userId}#{sectionType}#{chunkIndex}`)
- `content_hash` (SHA-256 to detect changes)
- `embedded_at` (timestamp for cache invalidation)

Indexes:
- `(user_id, section_type)` for fast section lookup
- `(user_id, content_hash)` for change detection

### 3. Resume Chunking (resume-chunking.ts)

**Strategy:** Semantic blocks per section type, with length-based subdivision for long sections.

**Chunk Sizes:**
- Target: ~250 tokens (~1000 chars)
- Max: ~400 tokens (~1600 chars)

**Section-Specific Handling:**
- **professional_summary**: Split by sentences if > max
- **core_competencies** / **certifications**: Group skills/certs into comma-separated chunks
- **technical_skills**: One chunk per category + skills list
- **professional_experience**: One chunk per job (title + company + bullets)
- **education**: One chunk per degree
- **personal_projects**: One chunk per project

**Tokenization:** `tokens = length * 0.25` (rough estimate; actual varies)

### 4. Embedding Generation (resume-embedding.ts)

**Workflow:**
1. Call `@cf/baai/bge-large-en-v1.5` via Cloudflare Workers AI
2. Store embeddings in `resume_vector_index` table
3. Upsert 1024-dim vectors to Vectorize namespace

**Keys:** `{userId}#{sectionType}#{chunkIndex}`
**Metadata:** `{ text, tokens }`

### 5. Job Matching (resume-matching.ts)

**Algorithm:**

1. **Embed Job Description**: Generate 1024-dim vector for incoming job description
2. **Similarity Scoring**: Cosine similarity against all resume chunks
3. **Filtering**: Keep chunks with score ≥ 0.3 (30% similarity threshold)
4. **Ranking**: Sort by score (highest first)
5. **Diversity Filter**: Greedily select top-5 chunks, ensuring min 0.7 similarity between selected chunks (avoid redundancy)
6. **Formatting**: Return chunks with section type + similarity score

**Cosine Similarity:**
```
cos(a, b) = (a · b) / (||a|| * ||b||)
```

**Output:** `GroundTruthContext`
```typescript
{
  chunks: [
    { text, sectionType, similarity },
    ...
  ],
  averageSimilarity: number,
  totalTokens: number,
}
```

### 6. Zero-Hallucination System Prompt (zero-hallucination-prompt.ts)

**Core Constraint:**
```
You are an absolute ground-truth engine. You MUST:
- NOT invent, extrapolate, or embellish metrics, dates, achievements
- NOT assume skills beyond what's explicitly provided
- Rewrite achievements using job description language WITHOUT falsifying facts
- Omit claims you cannot substantiate from the provided context
```

**Applied to:**
- Cover letter generation (`generate-cover-letter.ts`)
- Resume tailoring endpoints (future)
- Any document generation touching candidate data

---

## Integration Points

### Cover Letter Generation (`generate-cover-letter.ts`)

**New Flow:**

1. Fetch resume embeddings from `resume_vector_index` table
2. Call `matchJobDescriptionToResume()` with job description + embeddings
3. Format ground truth context via `formatGroundTruthContext()`
4. Inject context into prompt template:
   ```
   GROUND TRUTH RESUME CONTEXT (verified semantic matches):
   [Chunks with similarity scores]
   
   IMPERATIVE: Base all resume references on this context.
   Do not invent or extrapolate metrics, dates, or achievements.
   ```
5. Generate cover letter with zero-hallucination system prompt

**Changes:**
- Added imports: `resume-matching.ts`, `zero-hallucination-prompt.ts`
- New handler logic: fetch embeddings → match → format → inject
- System prompt now includes zero-hallucination constraint

---

## Data Flow Examples

### Example 1: Resume with 3 Technical Skills Chunks

```
Section: technical_skills
├─ Chunk 0: "Backend: Node.js, TypeScript, PostgreSQL"
├─ Chunk 1: "Frontend: React, Tailwind CSS, Vite"
└─ Chunk 2: "DevOps: Docker, Kubernetes, GitHub Actions"

All chunked, hashed, embedded, stored in Vectorize + DB
```

### Example 2: Job Matching

Job Description: "Looking for React expertise with TypeScript backend skills"

Similarities:
- Chunk 1 (Frontend): 0.87 ✓
- Chunk 0 (Backend): 0.79 ✓
- Chunk 2 (DevOps): 0.42 ✓

→ Selected: [Chunk 1, Chunk 0] (diversity threshold = 0.7, so Chunk 2 redundant)

### Example 3: Ground Truth Injection

```
User Resume Chunk (Professional Experience):
"Led full-stack redesign of payment system, reducing latency by 40%"

Job Description Keywords: React, TypeScript, payment processing

Similarity: 0.82 → Injected into prompt

Cover Letter Generated (with zero-hallucination constraint):
"I led a full-stack payment system redesign that reduced latency by 40%,
directly addressing [Company]'s need for performance optimization."
```

---

## Fallback & Error Handling

1. **No embeddings available**: Skip semantic matching, fall back to raw resume text
2. **Vectorize unavailable**: Log warning, continue with traditional text-based approach
3. **Embedding generation fails**: Catch, log, continue (fail-safe)
4. **Job description empty**: Return empty ground truth context (no match)
5. **No high-similarity chunks**: Return empty context (better than hallucinated content)

---

## Testing Strategy

### Unit Tests

- **Chunking**: Verify semantic blocks split correctly per section type
- **Similarity**: Test cosine similarity edge cases (orthogonal, identical vectors)
- **Diversity Filter**: Ensure redundant chunks excluded
- **Zero-Hallucination**: Prompt injection should never allow fabrication

### Integration Tests

- **Full Resume → Vectorize**: Chunk, embed, store, retrieve
- **Job Matching → Cover Letter**: E2E flow with real embeddings

### Validation

- Inspect generated cover letters for:
  - No invented metrics
  - No extrapolated dates
  - No assumed skills
  - All claims traceable to ground truth chunks

---

## Performance Considerations

### Latency
- **Chunking**: O(n) where n = resume text length (negligible, <10ms)
- **Embedding**: 1 call per section = ~7 calls per resume (~2-3s depending on Workers AI load)
- **Matching**: O(m) where m = total chunks (~50-100 chunks max, ~10ms)
- **Total per cover letter**: ~3-5s (embedding cache helps on repeat calls)

### Storage
- **Vectorize**: 1024 dims × 4 bytes × 50 chunks × 100k users ≈ ~20GB (scalable)
- **DB**: ~500 bytes per row × 50 chunks × 100k users ≈ ~2.5GB

### Cost Optimization
- Cache embeddings in `resume_vector_index` (avoid re-embedding)
- Detect content changes via `content_hash` before re-embedding
- Batch Vectorize upsertion (not yet implemented, future optimization)

---

## Future Enhancements

1. **Resume Tailoring**: Apply same semantic matching to resume generator
2. **Query Expansion**: Use job title + keywords as secondary embedding signals
3. **Semantic Diversity**: Pre-compute semantic clusters to avoid redundant chunks
4. **Multi-Language**: Support non-English resumes (bge-large-en-v1.5 is bilingual)
5. **Batch Embedding**: Upsert multiple vectors at once (reduce Vectorize API calls)
6. **Caching Layer**: Cache embeddings in KV for 24h before re-generating

---

## Migration Path

**For existing users without embeddings:**
1. On resume section update: Trigger `embedFullResume()` async
2. Fallback: Use raw text until embeddings ready
3. UI: Show "Optimizing resume..." during embedding phase

**Gradual rollout:**
- Phase 1: Embeddings optional, semantic matching in beta
- Phase 2: Embeddings auto-generated on resume upload
- Phase 3: Make semantic matching default for all users

---

## References

- **Vectorize Docs**: https://developers.cloudflare.com/vectorize/
- **BGE Model**: https://huggingface.co/BAAI/bge-large-en-v1.5
- **Cosine Similarity**: https://en.wikipedia.org/wiki/Cosine_similarity
- **RAG Pattern**: https://en.wikipedia.org/wiki/Retrieval-augmented_generation
