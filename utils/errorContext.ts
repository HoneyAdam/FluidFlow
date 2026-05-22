/**
 * Error Context Utilities
 *
 * Helpers for building context from errors for AI-powered fixing.
 * Extracted from useAutoFix for reusability.
 */

import { FileSystem, LogEntry } from '@/types';
import { errorAnalyzer, ErrorCategory, ParsedError } from '@/services/errorFix';

/**
 * Parse stack trace to identify error location
 */
export function parseStackTrace(errorMessage: string): { file?: string; line?: number; column?: number } {
  // Pattern: Transpilation failed for src/components/Features.tsx
  const transpileMatch = errorMessage.match(/(?:Transpilation failed for|failed for)\s+(src\/[\w./]+\.tsx?)[\s:]/i);
  if (transpileMatch) {
    const lineMatch = errorMessage.match(/\((\d+):(\d+)\)/);
    return {
      file: transpileMatch[1] ?? '',
      line: lineMatch ? parseInt(lineMatch[1] ?? '0', 10) : undefined,
      column: lineMatch ? parseInt(lineMatch[2] ?? '0', 10) : undefined
    };
  }

  // Pattern: at Component (filename.tsx:123:45)
  const stackMatch = errorMessage.match(/at\s+(?:\w+\s+\()?([\w./]+\.tsx?):(\d+):(\d+)/);
  if (stackMatch) {
    return {
      file: stackMatch[1] ?? '',
      line: parseInt(stackMatch[2] ?? '0', 10),
      column: parseInt(stackMatch[3] ?? '0', 10)
    };
  }

  // Pattern: Error in src/App.tsx:123
  const simpleMatch = errorMessage.match(/(?:Error in|at)\s+(src\/[\w./]+\.tsx?):?(\d+)?/i);
  if (simpleMatch) {
    return {
      file: simpleMatch[1] ?? '',
      line: simpleMatch[2] ? parseInt(simpleMatch[2], 10) : undefined
    };
  }

  // Pattern: /src/components/File.tsx: Unexpected token
  const pathMatch = errorMessage.match(/\/(src\/[\w./]+\.tsx?):/);
  if (pathMatch) {
    const lineMatch = errorMessage.match(/\((\d+):(\d+)\)/);
    return {
      file: pathMatch[1] ?? '',
      line: lineMatch ? parseInt(lineMatch[1] ?? '0', 10) : undefined,
      column: lineMatch ? parseInt(lineMatch[2] ?? '0', 10) : undefined
    };
  }

  return {};
}

/**
 * Extract local imports from code
 */
export function extractLocalImports(code: string, files: FileSystem): string[] {
  const imports: string[] = [];
  const importRegex = /import\s+(?:(?:\{[^}]*\}|[^{}\s,]+|\*\s+as\s+\w+)(?:\s*,\s*)?)+\s+from\s+['"]\.\.?\/([^'"]+)['"]/g;
  let match;

  while ((match = importRegex.exec(code)) !== null) {
    const importPath = match[1];
    const possiblePaths = [
      `src/${importPath}.tsx`,
      `src/${importPath}.ts`,
      `src/${importPath}/index.tsx`,
      `src/${importPath}/index.ts`,
      `${importPath}.tsx`,
      `${importPath}.ts`,
    ];

    for (const p of possiblePaths) {
      if (files[p]) {
        imports.push(p);
        break;
      }
    }
  }

  return [...new Set(imports)];
}

/**
 * Get related files based on error context
 */
export function getRelatedFiles(
  errorMessage: string,
  mainCode: string,
  files: FileSystem
): Record<string, string> {
  const related: Record<string, string> = {};

  // Get local imports from App.tsx
  const localImports = extractLocalImports(mainCode, files);
  for (const importPath of localImports.slice(0, 5)) {
    if (files[importPath]) {
      related[importPath] = files[importPath];
    }
  }

  // Check for component name in error
  const componentMatch = errorMessage.match(/(?:Element type|'|")(\w+)(?:'|")|(?:cannot read|undefined)\s+(?:property\s+)?['"]?(\w+)['"]?/i);
  if (componentMatch) {
    const componentName = componentMatch[1] ?? componentMatch[2] ?? '';
    for (const [path, content] of Object.entries(files)) {
      if (path.toLowerCase().includes(componentName.toLowerCase()) ||
          content.includes(`export const ${componentName}`) ||
          content.includes(`export function ${componentName}`) ||
          content.includes(`export default ${componentName}`)) {
        if (!related[path] && Object.keys(related).length < 6) {
          related[path] = content;
        }
      }
    }
  }

  // Include types file if exists
  if (files['src/types.ts'] && !related['src/types.ts']) {
    related['src/types.ts'] = files['src/types.ts'];
  }

  // Parse stack trace for specific file
  const stackInfo = parseStackTrace(errorMessage);
  const stackFile = stackInfo.file;
  if (stackFile && files[stackFile] && !related[stackFile]) {
    related[stackFile] = files[stackFile];
  }

  return related;
}

/**
 * Get recent console logs for context
 */
export function getRecentLogsContext(logs: LogEntry[]): string {
  const recentLogs = logs.slice(-10);
  if (recentLogs.length === 0) return '';

  const logContext = recentLogs
    .filter(l => l.type === 'error' || l.type === 'warn')
    .map(l => `[${l.type.toUpperCase()}] ${l.message}`)
    .join('\n');

  return logContext ? `## Recent Console Logs\n\`\`\`\n${logContext}\n\`\`\`\n` : '';
}

/**
 * Category-specific hints for error fixing
 */
const CATEGORY_HINTS: Record<ErrorCategory, string> = {
  import: `- Check if the import source exists and is correct
- For motion animations, use 'motion/react' (not 'framer-motion')
- For React Router v7, imports are from 'react-router' (not 'react-router-dom')
- Lucide icons: import from 'lucide-react' (named exports)
- Verify named vs default exports match
- For bare specifiers like 'src/...', convert to relative paths ('./...')`,
  syntax: `- Check for missing brackets, parentheses, or semicolons
- Verify JSX syntax is valid
- Ensure template literals are properly closed
- Check for missing commas in object/array literals`,
  jsx: `- Ensure all JSX tags are properly closed
- Self-closing tags (img, input, br, hr) should use />
- Adjacent JSX elements must be wrapped in a parent or Fragment
- Check for unclosed JSX expressions {}`,
  type: `- Check type definitions in types.ts if available
- Ensure props match expected types
- Verify generic type parameters
- Add optional chaining (?.) for possibly undefined values`,
  runtime: `- Add null checks or optional chaining (?.) for object access
- Verify async operations are properly awaited
- Ensure state is initialized before use
- Check for proper array/iterable handling`,
  react: `- Verify hook rules (only call in component body, not in conditions)
- Add unique key props for list items (use item.id or index as fallback)
- Ensure proper event handler binding
- Use useEffect for side effects, not during render`,
  async: `- Add 'async' keyword before function that uses 'await'
- Ensure Promise chains are properly handled
- Use try-catch for async error handling`,
  transient: '',
  network: '',
  unknown: '',
};

export interface AutoFixPromptContext {
  errorMessage: string;
  targetFile: string;
  targetFileContent: string;
  files: FileSystem;
  techStackContext: string;
  logs: LogEntry[];
}

/**
 * Build the system prompt for AI auto-fix
 */
export function buildAutoFixPrompt(context: AutoFixPromptContext): string {
  const { errorMessage, targetFile, targetFileContent, files, techStackContext, logs } = context;

  const parsed = errorAnalyzer.analyze(errorMessage);
  const relatedFiles = getRelatedFiles(errorMessage, targetFileContent, files);
  const recentLogsContext = getRecentLogsContext(logs);
  const stackInfo = parseStackTrace(errorMessage);
  const categoryHint = CATEGORY_HINTS[parsed.category] || '';

  // Build related files section with smart truncation
  let relatedFilesSection = '';
  const relatedEntries = Object.entries(relatedFiles).filter(([path]) => path !== targetFile);
  if (relatedEntries.length > 0) {
    relatedFilesSection = '\n## Related Files (may contain relevant code)\n';
    for (const [path, content] of relatedEntries) {
      // Smart truncation - keep more context for smaller files
      const maxSize = relatedEntries.length > 3 ? 1500 : 2500;
      const truncated = content.length > maxSize ? content.slice(0, maxSize) + '\n// ... truncated' : content;
      relatedFilesSection += `### ${path}\n\`\`\`tsx\n${truncated}\n\`\`\`\n`;
    }
  }

  // Build suggested fix section if available
  let suggestedFixSection = '';
  if (parsed.suggestedFix) {
    suggestedFixSection = `\n## Suggested Fix\n${parsed.suggestedFix}`;
    if (parsed.identifier) {
      suggestedFixSection += ` (identifier: \`${parsed.identifier}\`)`;
    }
    suggestedFixSection += '\n';
  }

  // Build error location section
  let errorLocation = targetFile;
  if (stackInfo.line) {
    errorLocation += `:${stackInfo.line}`;
    if (stackInfo.column) {
      errorLocation += `:${stackInfo.column}`;
    }
  }

  return `You are a senior React/TypeScript debugger. Fix the runtime error below with the smallest correct patch, on the first try.

${techStackContext}

## DIAGNOSIS FIRST
Before patching, classify the error into ONE bucket and patch accordingly:
1. Import resolution — wrong package, absolute path, missing extension, named-vs-default mismatch.
2. Syntax / JSX — unclosed tag, missing fragment, ternary followed by \`&&\`, missing arrow \`=>\`.
3. Type — missing field on interface, undefined access, wrong argument type.
4. Runtime — null/undefined dereference, missing \`key\` on map, stale closure, infinite update loop.
5. Hook — conditional hook call, hook outside a component, missing/incorrect deps.

## Error Information
- **Error Message**: ${errorMessage}
- **Error Category**: ${parsed.category}
- **Priority**: ${parsed.priority}/5
- **Location**: ${errorLocation}
${suggestedFixSection}
${recentLogsContext}

## Available Files in Project
${Object.keys(files).join(', ')}

${relatedFilesSection}

## File to Fix (${targetFile})
\`\`\`tsx
${targetFileContent}
\`\`\`

## Fix Guidelines
1. **Minimal patch** — fix ONLY the classified error, no refactors, no drive-by improvements.
2. **Preserve style** — match the file's indentation, quote style, and patterns.
3. **Preserve FluidFlow attributes** — never strip \`data-ff-group\` / \`data-ff-id\`.
4. **Correct imports**:
   - \`motion/react\` for animations (NOT \`framer-motion\`)
   - \`react-router\` for routing (NOT \`react-router-dom\`)
   - \`lucide-react\` for icons
   - Always RELATIVE: \`'./components/X'\`, never \`'src/components/X'\`.
5. **Defensive when unsure** — prefer \`?.\` and \`??\` over \`!\` non-null assertions you cannot verify.
6. **For missing exports**, check related files above for the actual export name (named vs. default).
7. **Special characters** — escape apostrophes inside strings; in JSX text use \`&apos;\` or wrap in expression \`{"that's"}\`.

## Quick reference — common fixes

| Symptom | Fix |
|---------|-----|
| \`Failed to resolve 'src/...'\` | Switch to relative: \`'./components/X'\` |
| \`Module not found: 'framer-motion'\` | Use \`'motion/react'\` |
| \`Cannot find 'react-router-dom'\` | Use \`'react-router'\` (v7) |
| \`Adjacent JSX elements...\` | Wrap in \`<>…</>\` |
| \`Cannot read properties of undefined\` | Optional chaining or default value |
| \`Invalid hook call\` | Move hook to top level of a capitalized component |
| \`Each child should have a unique "key"\` | Use a stable id, never the array index |
| \`Maximum update depth exceeded\` | Guard the state update inside the effect |

${categoryHint ? `## Category-Specific Hints\n${categoryHint}` : ''}

## Required Output Format
Return ONLY the complete fixed ${targetFile} content. The first character of your response is the first character of the file (usually \`i\` from \`import\`). No markdown fence, no leading explanation, no trailing comment.`;
}

/**
 * Build a minimal prompt for simple fixes (less tokens)
 */
export function buildMinimalFixPrompt(
  errorMessage: string,
  code: string,
  parsed: ParsedError
): string {
  return `Fix this ${parsed.category} error in React/TypeScript:

Error: ${errorMessage}
${parsed.suggestedFix ? `Hint: ${parsed.suggestedFix}` : ''}

Code:
\`\`\`tsx
${code}
\`\`\`

Return ONLY the fixed code, no explanations.`;
}
