# FluidFlow Audit Report

Date: 2026-03-10

## What Was Checked

- TypeScript type checking
- ESLint
- Full test suite and security-focused tests
- Production build
- Manual code review of server, backup, settings, runner, and context persistence flows

## Commands Run

```bash
npm run type-check
npm run lint
npm run test:run
npm run test:security
npm run build
```

## Fixed In This Pass

### 1. Settings secret persistence risk

- `server/api/settings.ts`
- `.env` fallback provider is now applied at runtime instead of being auto-written to `settings/global.json`.
- `settings/global.json` was added to `.gitignore`.

Impact:
- Reduces accidental API key commits.

### 2. Backup privacy leak

- `server/api/github.ts`
- `services/api/github.ts`
- `App.tsx`
- Backup metadata sync now respects `includeContext` and defaults to `false`.
- Existing `.fluidflow/context.json` is removed from backup sync when context sharing is disabled.

Impact:
- Prevents unintended upload of AI conversation history during backup pushes.

### 3. Unload beacon mixed-content risk

- `hooks/useAIHistory.ts`
- Unload save now uses relative `/api` fallback instead of `http://localhost:3101/api`.

Impact:
- Avoids HTTPS mixed-content failures and reduces silent loss of pending AI history.

### 4. Request parsing hardening

- `server/index.ts`
- Global API rate limiting now runs before JSON body parsing.

Impact:
- Reduces repeated large-body parse abuse from the same client.

### 5. Runner dependency auto-install hardening

- `server/api/runner.ts`
- Auto-install of inferred dependencies is now disabled by default.
- It only activates when `FF_AUTO_INSTALL_MISSING_DEPS=true`.

Impact:
- Reduces surprise installs and supply-chain risk from generated code.

### 6. Context save payload guard

- `server/api/projects.ts`
- Added shared save logic for `PUT` and `POST /:id/context`.
- Added a 1 MB payload cap for context persistence.

Impact:
- Reduces risk of oversized context writes and keeps the two save paths consistent.

### 7. Pre-parse JSON request size guard

- `server/middleware/security.ts`
- `server/index.ts`
- Requests with a known `Content-Length` above the JSON parser limit are now rejected before body parsing.

Impact:
- Reduces wasted CPU and memory when oversized JSON requests are sent repeatedly.

### 8. Additional lazy loading for heavy app modals

- `components/LazyModals.tsx`
- `App.tsx`
- `SnippetsPanel`, `ProjectManager`, and `PromptHistoryModal` now load on demand.

Impact:
- Reduces the initial app bundle and moves non-critical UI code off the startup path.

## Remaining Issues / Technical Debt

### Large frontend bundle

- `npm run build` still reports a large minified chunk, but the main chunk was reduced from about 2.7 MB to about 2.66 MB after extra lazy loading.

Impact:
- Slower initial load and poorer caching behavior.

Recommended follow-up:
- Add more route/component-level dynamic imports.
- Split heavy editor and AI-related code further.

### JSON parser still runs before request validation

- `server/index.ts`
- Rate limiting now runs first, but body parsing still occurs before `validateRequest`.

Impact:
- Pattern-based request rejection still happens after parsing.

Recommended follow-up:
- Add route-specific body limits where practical.
- Consider lightweight pre-parse guards for selected endpoints.

## Verification Status

- `npm run type-check` passed
- `npm run lint` passed
- `npm run test:security` passed
- `npm run build` passed

## Overall Assessment

The project is currently buildable and test-green. The biggest risks found were in secret handling, backup privacy, runtime dependency installation, and context persistence. The most urgent issues have been mitigated in this pass.
