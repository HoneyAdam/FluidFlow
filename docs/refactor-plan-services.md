# FluidFlow Services Refactoring Plan

## Goal
Extract ALL business logic from hooks/utils into proper service modules.
Each service is independently testable, has clear boundaries, and a single responsibility.

## Current Architecture Problems
1. **Hooks contain business logic** — `useContinuationGeneration` (823 lines), `useCodeGeneration` (584 lines) mix React state with AI orchestration, parsing, retry logic, and validation
2. **Utils contain services** — `utils/generationUtils.ts` imports from services, accesses localStorage, calls `getProviderManager()` — it's a service pretending to be a utility
3. **Flat services/ directory** — 20 loose files that are already services but not organized
4. **No index barrel exports** for top-level services

## Refactoring Phases

### Phase 1: Organize existing services (LOW RISK)
**Goal:** Create barrel exports, organize loose files into subdirectories.

1.1 Create `services/generation/` — extract from hooks
- `services/generation/continuation.ts` — multi-batch continuation logic from `useContinuationGeneration`
- `services/generation/streamingProcessor.ts` — streaming response handling from `useStreamingResponse`
- `services/generation/validator.ts` — `validateGeneratedFiles` + file validation from `useContinuationGeneration`
- `services/generation/messageBuilder.ts` — `createCompletionMessage` + AIHistoryEntry builders
- `services/generation/index.ts` — barrel export

1.2 Move `utils/generationUtils.ts` → `services/generation/utils.ts`
- It already accesses localStorage, imports from services, calls getProviderManager()
- It IS a service, not a utility

1.3 Create barrel `services/index.ts`

### Phase 2: Extract business logic from hooks (MEDIUM RISK)
**Goal:** Make hooks thin wrappers that delegate to services.

2.1 Extract from `useContinuationGeneration`:
- `validateGeneratedFiles()` → `services/generation/validator.ts`
- `createCompletionMessage()` → `services/generation/messageBuilder.ts`
- Continuation prompt building → `services/generation/promptBuilder.ts`
- Retry logic (exponential backoff) → `services/generation/retry.ts`
- The hook becomes: state management + calling service functions

2.2 Extract from `useStreamingResponse`:
- Module-level `_lastAIResponse` store → service-level store
- `processStreamingResponse` core logic → `services/generation/streamingProcessor.ts`
- Hook keeps only refs and callbacks

2.3 Extract from `useResponseParser`:
- Already mostly pure functions, move to `services/generation/parser.ts`
- Hook becomes thin wrapper

2.4 Extract from `useCodeGeneration`:
- Request building → `services/generation/requestBuilder.ts`
- History entry creation → `services/generation/messageBuilder.ts`
- Hook orchestrates services

### Phase 3: Organize loose services (LOW RISK)
**Goal:** Move remaining flat files into proper subdirectories.

3.1 `services/storage/` — storage-related services
- `providerStorage.ts` (already in ai/)
- `promptHistory.ts` → move here
- `promptTemplateStorage.ts` → move here
- `wipStorage.ts` → move here
- `analyticsStorage.ts` → move here

3.2 `services/project/` — project management
- `projectApi.ts` → move here
- `projectContext.ts` → move here
- `projectHealth.ts` → move here

3.3 Keep as-is (already organized):
- `services/ai/` ✓
- `services/api/` ✓
- `services/compaction/` ✓
- `services/context/` ✓
- `services/errorFix/` ✓
- `services/fluidflow/` ✓

3.4 Keep loose files that don't fit elsewhere:
- `services/activityLogger.ts` — cross-cutting
- `services/batchGeneration.ts` — already uses ai/ services
- `services/contextCompaction.ts` — uses compaction/
- `services/contextExport.ts` — standalone export utility
- `services/conversationContext.ts` — uses context/
- `services/fluidflowConfig.ts` — uses fluidflow/
- `services/screenshotService.ts` — standalone
- `services/snippetLibrary.ts` — standalone
- `services/tokenCostEstimator.ts` — standalone
- `services/version.ts` — standalone

### Phase 4: Tests
**Goal:** Every extracted service gets its own test file.

4.1 New test files:
- `tests/services/generation/validator.test.ts`
- `tests/services/generation/messageBuilder.test.ts`
- `tests/services/generation/promptBuilder.test.ts`
- `tests/services/generation/retry.test.ts`
- `tests/services/generation/utils.test.ts` (moved from `tests/utils/generationUtils.test.ts`)
- `tests/services/generation/streamingProcessor.test.ts`

4.2 Update existing tests to import from new locations

## File-by-file mapping

### New files to create:
```
services/generation/index.ts
services/generation/validator.ts
services/generation/messageBuilder.ts
services/generation/promptBuilder.ts
services/generation/retry.ts
services/generation/streamingProcessor.ts
services/generation/utils.ts  (moved from utils/generationUtils.ts)
services/index.ts
services/storage/index.ts
services/project/index.ts
```

### Files to modify (hooks become thin):
```
hooks/useCodeGeneration.ts         — delegate to services/generation/*
hooks/useContinuationGeneration.ts — delegate to services/generation/*
hooks/useStreamingResponse.ts      — delegate to services/generation/*
hooks/useResponseParser.ts         — delegate to services/generation/*
```

### Files to move:
```
utils/generationUtils.ts           → services/generation/utils.ts
services/promptHistory.ts          → services/storage/promptHistory.ts
services/promptTemplateStorage.ts  → services/storage/promptTemplateStorage.ts
services/wipStorage.ts             → services/storage/wipStorage.ts
services/analyticsStorage.ts       → services/storage/analyticsStorage.ts
services/projectApi.ts             → services/project/projectApi.ts
services/projectContext.ts         → services/project/projectContext.ts
services/projectHealth.ts          → services/project/projectHealth.ts
```

## Execution Order (test after each step)
1. Phase 1.1 + 1.2 — Create services/generation/ with extracted logic
2. Run tests
3. Phase 1.3 — Create barrel exports
4. Phase 2.1 — Extract from useContinuationGeneration
5. Run tests
6. Phase 2.2 — Extract from useStreamingResponse
7. Run tests
8. Phase 2.3-2.4 — Extract from remaining hooks
9. Run tests
10. Phase 3 — Reorganize file locations
11. Run tests
12. Phase 4 — Tests for new services
13. Run full test suite
