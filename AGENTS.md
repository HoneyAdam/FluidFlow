# Agent Guidelines for FluidFlow

## Development Commands
```bash
npm run dev              # Start both frontend (3100) + backend (3101)
npm run type-check       # TypeScript checking (tsc --noEmit)
npm run lint             # ESLint with zero warnings tolerance
npm run lint:fix         # Auto-fix ESLint issues
npm run format           # Prettier formatting
npm test                 # Vitest watch mode
npm test -- path/to/test.ts  # Run specific test file
npm run test:security    # Security tests only
```

## Code Style Guidelines

### Imports & Formatting
- Use `@/*` path alias for all imports
- Single quotes, trailing commas, 2-space indentation
- React imports first, then external libs, then internal modules
- Order: React → External → Internal (grouped by directory)

### TypeScript
- Strict mode enabled, prefer explicit typing
- Use `interface` for object shapes, `type` for unions/primitives
- Prefix unused params with `_` to bypass ESLint
- Avoid `any` except in test files

### Naming & Patterns
- Components: PascalCase (e.g., `ControlPanel`)
- Files: kebab-case for folders, PascalCase for React files
- Hooks: `useXxx` prefix, always custom hooks in `/hooks`
- Constants: UPPER_SNAKE_CASE in `/constants`

### Error Handling
- Validate inputs with `utils/validation.ts`
- Use try-catch for async operations
- Log with `debugLog()` from `useDebugStore`
- Security: sanitize file paths, prevent XSS via DOMPurify

### Architecture Notes
- State via `contexts/AppContext.tsx` - avoid local state
- AI calls through `services/ai/index.ts` ProviderManager
- Virtual filesystem in `projects/[id]/files/`
- Tests: Vitest with jsdom, security tests in `/tests/security`

<!-- dfmt:v1 begin -->
# Context Discipline — REQUIRED

This project uses DFMT to keep large tool outputs from exhausting the
context window. **Read this section at the start of every conversation
in this project.**

## Rule 1 — Prefer DFMT tools over native tools

Always use DFMT's MCP tools when an output might exceed 2 KB:

| Native     | DFMT replacement |
|------------|------------------|
| `Bash`     | `dfmt_exec`      |
| `Read`     | `dfmt_read`      |
| `WebFetch` | `dfmt_fetch`     |
| `Glob`     | `dfmt_glob`      |
| `Grep`     | `dfmt_grep`      |
| `Edit`     | `dfmt_edit`      |
| `Write`    | `dfmt_write`     |

Include an `intent` argument on every call, describing what you need
from the output. The `intent` lets DFMT return the relevant portion of
a large output without flooding the context.

## Rule 2 — On DFMT failure, report and fall back

DFMT is a strong preference, not a hard dependency. If a `dfmt_*` tool
errors, times out, or is unavailable, report the failure to the user
(one short line — which call, what error) and continue with the native
equivalent so the session is not blocked. The ban is on *silent*
fallback — every switch must be announced. After a fallback, drop a
brief `dfmt_remember` note tagged `gap` when practical. If the native
tool is also denied (permission rule, sandbox refusal), stop and ask
the user; do not retry blindly.

## Rule 3 — Record user decisions

When the user states a preference or correction ("use X instead of Y",
"do not modify Z"), call `dfmt_remember` with a `decision` tag so the
choice survives context compaction.

## Why these rules matter

Some agents do not provide hooks to enforce these rules automatically.
**Compliance is your responsibility as the agent.** A single raw shell
output above 8 KB can push earlier context out of the window, erasing
the conversation's history. Following the rules above preserves it.
<!-- dfmt:v1 end -->
