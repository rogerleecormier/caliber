# Testing Guide for Caliber

This document describes the testing and type-checking infrastructure for the Caliber job search platform.

## Quick Start

### Run All Tests
```bash
npm run test
```

### Run Tests in Watch Mode
```bash
npm run test:watch
```

### Run TypeScript Type Checking
```bash
npm run type-check
```

### Generate Coverage Reports
```bash
npm run test:coverage
```

### Open Test UI (Interactive Dashboard)
```bash
npm run test:ui
```

## Test Structure

Tests are organized by feature and module:

### Authentication & Session Management
- **File**: `src/lib/resolve-user.test.ts`
- **Coverage**: Session token verification, cookie parsing, request context handling
- **Tests**: 15+
  - Token format validation
  - Cookie extraction by name
  - Multiple cookie name candidates (secure prefixes)
  - Session resolution strategies
  - Context parameter handling

### Server Functions
- **File**: `src/server/functions/functions.test.ts`
- **Coverage**: Handler signatures, context extraction, error handling
- **Tests**: 20+
  - GET/POST handler parameter extraction
  - Request extraction from context
  - Context handling (undefined, null, missing properties)
  - Helper function context passing
  - Safe optional chaining

### Auth Server Functions
- **File**: `src/server/functions/auth.test.ts`
- **Coverage**: Authentication flow, role management
- **Tests**: 10+
  - SessionUser type validation
  - Admin role support
  - Email/password validation
  - Context extraction patterns

### Resume Management
- **File**: `src/server/functions/manage-resume.test.ts`
- **Coverage**: Resume data structure, parsing, updates
- **Tests**: 25+
  - Resume fields and optional properties
  - Competencies and tools arrays
  - Experience and education parsing
  - Resume validation
  - Skill deduplication
  - Partial updates and timestamps

### Job Scoring
- **File**: `src/lib/job-score.test.ts`
- **Coverage**: Job matching, skill analysis, salary comparison
- **Tests**: 20+
  - Score calculation (0-100 range)
  - Score categorization
  - Skill matching percentage
  - Experience level fit
  - Overqualification/underqualification detection
  - Salary range parsing

### Pipeline Management
- **File**: `src/lib/pipeline-constants.test.ts`
- **Coverage**: Job pipeline statuses and transitions
- **Tests**: 15+
  - Status constants validation
  - Pipeline status normalization
  - Status transitions (Discovered → Analyzed → Applied)
  - Archiving functionality

### Integration Tests
- **File**: `src/integration.test.ts`
- **Coverage**: End-to-end feature flows
- **Tests**: 40+
  - Authentication flow
  - Job analysis pipeline
  - Resume processing
  - Document generation
  - Pipeline management
  - Search and filtering
  - Analytics and reporting
  - Error handling
  - Data persistence

### CloudFlare Types
- **File**: `src/lib/cloudflare.test.ts`
- **Coverage**: Environment variable handling, bindings
- **Tests**: 15+
  - CloudflareEnv type structure
  - SessionUser type validation
  - Binding availability checks
  - Environment variable handling

### Resume Section Parsing (Existing)
- **File**: `src/lib/resume-section-parsing.test.ts`
- **Coverage**: AI response parsing, JSON repair, guardrails
- **Tests**: 48
  - Well-formed JSON parsing
  - Field name case variations
  - Malformed JSON repair
  - Plaintext fallback
  - Guardrail enforcement
  - Certification extraction

## Test Statistics

```
Test Files: 9 passed
Total Tests: 173 passed
Duration: ~600ms
```

## Configuration

### Vitest Configuration
Located in `vitest.config.ts`:
- **Environment**: Node.js (no DOM/browser APIs)
- **Include patterns**: `src/**/*.test.ts` and `src/**/*.spec.ts`
- **Globals**: Enabled (no import of `describe`, `it`, `expect` needed)
- **Coverage**:
  - Provider: V8
  - Reporters: Text, JSON, HTML, LCOV
  - Excludes: node_modules, dist, test files

### TypeScript Configuration
- **Command**: `npm run type-check`
- **Strictness**: Full type checking enabled
- **Output**: Human-readable error messages

## Features Tested

### 🔐 Authentication
- ✅ Session resolution with fallback mechanisms
- ✅ Cookie token verification
- ✅ Request context extraction
- ✅ Admin authorization

### 📄 Resume Management
- ✅ Resume data structure and validation
- ✅ Skill parsing and deduplication
- ✅ Experience and education entries
- ✅ Partial updates with timestamp tracking

### 🎯 Job Analysis
- ✅ Job matching scores (0-100)
- ✅ Skill requirement analysis
- ✅ Experience level evaluation
- ✅ Salary comparison
- ✅ Job fit metrics

### 📊 Pipeline Management
- ✅ Job status tracking
- ✅ Status transitions
- ✅ Job archiving
- ✅ Application progress tracking

### 🔍 Search and Filtering
- ✅ Filter by job status
- ✅ Filter by remote status
- ✅ Search by job title
- ✅ Search by company

### 📈 Analytics
- ✅ Application rate calculation
- ✅ Interview rate calculation
- ✅ Average match score
- ✅ Application timeline tracking

### 📋 Document Generation
- ✅ Cover letter generation
- ✅ Tailored resume generation
- ✅ Job-specific highlighting

## Running Tests

### By Feature
```bash
# Test only auth
npm run test -- src/server/functions/auth.test.ts

# Test only resume
npm run test -- src/server/functions/manage-resume.test.ts

# Test only jobs
npm run test -- src/lib/job-score.test.ts
```

### By Pattern
```bash
# Test anything with "session" in the name
npm run test -- --grep "session"

# Test integration tests only
npm run test -- src/integration.test.ts
```

### Watch Mode
```bash
# Watch all tests
npm run test:watch

# Watch specific test file
npm run test:watch -- src/server/functions/auth.test.ts
```

### Coverage Report
```bash
npm run test:coverage
```

This generates HTML coverage reports in `./coverage/index.html`

## Writing New Tests

### Test File Location
- Create files with `.test.ts` suffix
- Place in the same directory as the code being tested
- Example: `src/lib/new-feature.ts` → `src/lib/new-feature.test.ts`

### Test Structure
```typescript
import { describe, it, expect } from "vitest";

describe("Feature Name", () => {
  describe("Sub-feature", () => {
    it("should do something specific", () => {
      const result = functionToTest();
      expect(result).toBe(expectedValue);
    });

    it("should handle error cases", () => {
      expect(() => {
        functionToTest("invalid");
      }).toThrow();
    });
  });
});
```

### Best Practices
- ✅ One assertion per test (or related assertions)
- ✅ Descriptive test names
- ✅ Group related tests with `describe`
- ✅ Test both success and failure paths
- ✅ Use `beforeEach` for setup if needed
- ✅ Avoid testing implementation details

## CI/CD Integration

These commands should be run in your CI pipeline:

```bash
# Type check
npm run type-check

# Run all tests
npm run test

# Optionally generate coverage
npm run test:coverage
```

## Troubleshooting

### Tests Fail with "Cannot find module"
Check that the path alias `@` in `vitest.config.ts` matches your `tsconfig.json`.

### Type Errors in Tests
Ensure `vitest/config` is imported correctly and globals are enabled in config.

### Cloudflare-specific Imports Fail
Tests that import Cloudflare-specific modules need to be isolated. See `src/lib/resolve-user.test.ts` for the pattern.

## Future Improvements

- [ ] Add E2E tests with Playwright
- [ ] Add performance benchmarks
- [ ] Add visual regression tests for UI components
- [ ] Increase component unit test coverage
- [ ] Add API integration tests with mocked Cloudflare bindings
