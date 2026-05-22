/**
 * Clean Code - Unified Facade
 *
 * This file re-exports all code cleaning, parsing, and validation utilities
 * from their focused modules. It maintains backward compatibility with the
 * original monolithic cleanCode.ts API.
 *
 * Modules:
 * - jsxFixer.ts         - JSX text content escaping
 * - importFixer.ts      - Bare specifier import fixing
 * - codeCleaner.ts      - Code cleaning and artifact removal
 * - jsonParser.ts       - JSON parsing and validation
 * - multiFileParser.ts  - Multi-file response parsing
 * - unifiedParser.ts    - Unified format detection and parsing
 * - syntaxFixer.ts      - Comprehensive syntax error fixing
 * - markerFormat.ts     - Marker format parsing
 * - searchReplace.ts    - Search/replace mode parsing
 * - codeValidator.ts    - Code validation and syntax checking
 */

// ============================================================================
// File Path Utilities
// ============================================================================

import { isIgnoredPath } from './filePathUtils';
export { isIgnoredPath as isIgnoredFilePath };

// ============================================================================
// JSX Fixer - JSX text content escaping
// ============================================================================

export { fixJsxTextContent } from './jsxFixer';

// ============================================================================
// Import Fixer - Bare specifier import fixing
// ============================================================================

export { fixBareSpecifierImports, BARE_SPECIFIER_DIRS } from './importFixer';

// ============================================================================
// Code Cleaner - Artifact removal and cleaning
// ============================================================================

export { cleanGeneratedCode } from './codeCleaner';

// ============================================================================
// JSON Parser - JSON parsing and validation
// ============================================================================

export {
  stripPlanComment,
  preValidateJson,
  safeParseAIResponse,
  repairTruncatedJson,
  type JsonValidationResult,
} from './jsonParser';

// ============================================================================
// Multi-File Parser - Multi-file response parsing
// ============================================================================

export {
  parseMultiFileResponse,
  type GenerationMeta,
  type MultiFileParseResult,
} from './multiFileParser';

// ============================================================================
// Unified Parser - Format detection and unified parsing
// ============================================================================

export {
  detectResponseFormat,
  parseUnifiedResponse,
  extractFileListUnified,
  getStreamingStatusUnified,
  type ResponseFormatType,
  type UnifiedParsedResponse,
} from './unifiedParser';

// ============================================================================
// Syntax Fixer - Comprehensive syntax fixing
// ============================================================================

export {
  fixMalformedTernary,
  fixArrowFunctions,
  fixJsxAttributes,
  fixStringIssues,
  fixTypeScriptIssues,
  extractJsxTags,
  findUnclosedTags,
  fixJsxTagBalance,
  fixBracketBalanceAdvanced,
  parseImports,
  fixAndMergeImports,
  fixReturnStatements,
  aggressiveFix,
  quickValidate,
  safeAggressiveFix,
  type ErrorPattern,
  type JsxTag,
  type ImportInfo,
  type FixResult,
} from './syntaxFixer';

// ============================================================================
// Search/Replace Mode
// ============================================================================

export {
  parseSearchReplaceModeResponse,
  applySearchReplace,
  mergeSearchReplaceChanges,
  type SearchReplaceMergeResult,
} from './searchReplace';

// ============================================================================
// Marker Format
// ============================================================================

export {
  isMarkerFormat,
  parseMarkerFormatResponse,
  parseMarkerPlan,
  parseMarkerFiles,
  parseStreamingMarkerFiles,
  extractMarkerFileList,
  getMarkerStreamingStatus,
  stripMarkerMetadata,
  type MarkerFilePlan,
  type MarkerFormatResponse,
} from './markerFormat';

// ============================================================================
// Code Validator
// ============================================================================

export {
  validateJsxSyntax,
  validateAndFixCode,
  getErrorContext,
  parseBabelError,
  isValidCode,
  type SyntaxIssue,
} from './codeValidator';

// ============================================================================
// Backward Compatibility - fixCommonSyntaxErrors
// ============================================================================

/**
 * Comprehensive syntax error fixer for AI-generated JSX/TSX code.
 *
 * Fixes these common AI mistakes:
 * 1. Malformed ternary chains (mixing && with ?:)
 * 2. Incomplete ternary (missing : null)
 * 3. Duplicate imports (merges them)
 * 4. Malformed arrow functions
 * 5. JSX attribute syntax errors
 * 6. Unclosed template literals
 * 7. TypeScript syntax issues
 */
export function fixCommonSyntaxErrors(code: string): string {
  if (!code) return '';

  let fixed = code;

  // ══════════════════════════════════════════════════════════════
  // PHASE 1: Fix malformed ternary operators (most common AI error)
  // ══════════════════════════════════════════════════════════════

  // 1a: `) : condition && (` → `) : condition ? (`
  fixed = fixed.replace(
    /\)\s*:\s*([\w.]+\s*===?\s*['"][^'"]+['"]\s*)&&\s*\(/g,
    ') : $1? ('
  );

  // 1b: Variable-based: `) : isLoading && (` or `) : !isLoading && (`
  fixed = fixed.replace(
    /\)\s*:\s*(!?[\w.]+)\s*&&\s*\(/g,
    ') : $1 ? ('
  );

  // 1c: After JSX closing tag: `</Component>) : condition && (`
  fixed = fixed.replace(
    /(<\/\w+>)\s*\)\s*:\s*([\w.!]+(?:\s*===?\s*['"][^'"]+['"])?)\s*&&\s*\(/g,
    '$1) : $2 ? ('
  );

  // 1d: After self-closing JSX: `<Component />) : condition && (`
  fixed = fixed.replace(
    /(\/>)\s*\)\s*:\s*([\w.!]+(?:\s*===?\s*['"][^'"]+['"])?)\s*&&\s*\(/g,
    '$1) : $2 ? ('
  );

  // 1e: `{condition && (content) : (other)}` → `{condition ? (content) : (other)}`
  fixed = fixed.replace(
    /\{\s*([\w.!]+(?:\s*[=!<>]+\s*['"\w.]+)?)\s*&&\s*\(([^)]+)\)\s*:\s*\(/g,
    '{ $1 ? ($2) : ('
  );

  // 1f: Negated condition with &&: `) : !something && (`
  fixed = fixed.replace(
    /\)\s*:\s*(![\w.]+(?:\?\.[\w.]+)*)\s*&&\s*\(/g,
    ') : $1 ? ('
  );

  // ══════════════════════════════════════════════════════════════
  // PHASE 2: Fix incomplete ternary (missing else)
  // ══════════════════════════════════════════════════════════════

  // 2a: `{condition ? <Component /> }` missing `: null`
  fixed = fixed.replace(
    /(\?\s*<[\w][\w\s="'{}.,-]*?\s*\/>)\s*(\})/g,
    (match, ternaryPart, closeBrace) => {
      if (match.includes(' : ') || match.includes(': ')) return match;
      return ternaryPart + ' : null' + closeBrace;
    }
  );

  // 2b: `{condition ? (<Component />) }` missing `: null`
  fixed = fixed.replace(
    /(\?\s*\(\s*<[\w][\w\s="'{}.,-]*?\s*\/>\s*\))\s*(\})/g,
    (match, ternaryPart, closeBrace) => {
      if (match.includes(' : ') || match.includes(': ')) return match;
      return ternaryPart + ' : null' + closeBrace;
    }
  );

  // ══════════════════════════════════════════════════════════════
  // PHASE 3: Fix arrow function syntax
  // ══════════════════════════════════════════════════════════════

  // 3a: FIRST - `() = > {` (space before >) → `() => {` (must run before hybrid fix)
  fixed = fixed.replace(/=\s+>/g, '=>');

  // 3b: CRITICAL - Fix hybrid function/arrow syntax
  fixed = fixed.replace(/function\s+(\w+)\s*\(\)\s*=>\s*\{/g, 'function $1() {');
  fixed = fixed.replace(/function\s+(\w+)\s*\(([^)]*)\)\s*=>\s*\{/g, 'function $1($2) {');
  fixed = fixed.replace(/(\bfunction\s+\w+[\s\S]*?)\s*=>\s*\{/g, '$1 {');

  // 3c: `= >{` (no space after =>) → `=> {`
  fixed = fixed.replace(/=>\s*\{/g, '=> {');

  // ══════════════════════════════════════════════════════════════
  // PHASE 4: Fix JSX attribute syntax
  // ══════════════════════════════════════════════════════════════

  // 4a: `className"value"` missing `=`
  fixed = fixed.replace(
    /(className|style|onClick|onChange|onSubmit|type|placeholder|value|disabled|checked|id|name|href|src|alt)("[^"]*")/g,
    '$1=$2'
  );

  // 4b: `className=="value"` double equals
  fixed = fixed.replace(
    /(className|style|onClick|onChange|type|placeholder)=="([^"]*)"/g,
    '$1="$2"'
  );

  // ══════════════════════════════════════════════════════════════
  // PHASE 5: Fix JSX structural issues
  // ══════════════════════════════════════════════════════════════

  // 5a: Extra `}}` that should be single `}`
  fixed = fixed.replace(/\}\}\s*(<\/)/g, '}$1');

  // 5b: `{ {` double opening braces
  fixed = fixed.replace(/\{\s*\{\s*(?=[^{])/g, '{ ');

  // ══════════════════════════════════════════════════════════════
  // PHASE 6: Deduplicate and merge imports
  // ══════════════════════════════════════════════════════════════

  const lines = fixed.split('\n');
  const importsBySource = new Map<string, { line: string; idx: number; named: Set<string>; defaultImport: string | null }>();
  const dedupedLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const trimmed = line.trim();

    if (trimmed.startsWith('import ') && trimmed.includes('from')) {
      const sourceMatch = trimmed.match(/from\s+['"]([^'"]+)['"]/);
      if (sourceMatch?.[1]) {
        const source = sourceMatch[1];
        const existing = importsBySource.get(source);

        const namedMatch = trimmed.match(/\{\s*([^}]+)\s*\}/);
        const namedImports = new Set<string>();
        if (namedMatch) {
          (namedMatch[1] ?? '').split(',').map(s => s.trim()).filter(Boolean).forEach(n => namedImports.add(n));
        }

        const defaultMatch = trimmed.match(/import\s+(\w+)\s*(?:,|\s+from)/);
        const defaultImport = (defaultMatch?.[1] && !trimmed.startsWith('import {')) ? defaultMatch[1] : null;

        if (existing) {
          namedImports.forEach(n => existing.named.add(n));
          if (defaultImport && !existing.defaultImport) {
            existing.defaultImport = defaultImport;
          }
          const merged = buildImportLine(existing.defaultImport, existing.named, source);
          dedupedLines[existing.idx] = merged;
          continue;
        }

        importsBySource.set(source, {
          line,
          idx: dedupedLines.length,
          named: namedImports,
          defaultImport
        });
      }
    } else if (trimmed.startsWith('import ') && !trimmed.includes('from')) {
      const alreadyExists = dedupedLines.some(l => l.trim() === trimmed);
      if (alreadyExists) continue;
    }

    dedupedLines.push(line);
  }

  fixed = dedupedLines.join('\n');

  // ══════════════════════════════════════════════════════════════
  // PHASE 7: Fix unclosed template literals
  // ══════════════════════════════════════════════════════════════

  const backtickCount = (fixed.match(/`/g) || []).length;
  if (backtickCount % 2 !== 0) {
    const lines2 = fixed.split('\n');
    let inTemplate = false;
    for (let i = 0; i < lines2.length; i++) {
      const count = ((lines2[i] ?? '').match(/`/g) || []).length;
      if (count % 2 !== 0) {
        inTemplate = !inTemplate;
        if (inTemplate && i === lines2.length - 1) {
          lines2[i] = (lines2[i] ?? '') + '`';
          inTemplate = false;
        }
      }
    }
    if (inTemplate) {
      fixed += '`';
    } else {
      fixed = lines2.join('\n');
    }
  }

  // ══════════════════════════════════════════════════════════════
  // PHASE 8: Fix TypeScript issues
  // ══════════════════════════════════════════════════════════════

  // 8a: Trailing comma in interface/type before closing brace
  fixed = fixed.replace(/,(\s*\})/g, '$1');

  // 8b: Missing closing > in generics: `React.FC<Props =` → `React.FC<Props> =`
  fixed = fixed.replace(/(React\.FC<\w+)(\s*=)/g, '$1>$2');

  // ══════════════════════════════════════════════════════════════
  // PHASE 9: Fix bracket/brace/parenthesis balance
  // ══════════════════════════════════════════════════════════════

  fixed = fixBracketBalance(fixed);

  return fixed;
}

/**
 * Fix unbalanced brackets, braces, and parentheses
 */
function fixBracketBalance(code: string): string {
  const stack: { char: string; line: number }[] = [];
  const pairs: Record<string, string> = { '(': ')', '[': ']', '{': '}', '<': '>' };
  const closers: Record<string, string> = { ')': '(', ']': '[', '}': '{', '>': '<' };

  let inString = false;
  let stringChar = '';
  let inJsx = false;
  let lineNum = 1;

  for (let i = 0; i < code.length; i++) {
    const char = code[i];
    const prev = code[i - 1];

    if (char === '\n') lineNum++;

    if ((char === '"' || char === "'" || char === '`') && prev !== '\\') {
      if (!inString) {
        inString = true;
        stringChar = char;
      } else if (char === stringChar) {
        inString = false;
        stringChar = '';
      }
      continue;
    }

    if (inString) continue;

    if (char === '<' && /[A-Z]/.test(code[i + 1] || '')) {
      inJsx = true;
    }
    if (inJsx && char === '>') {
      inJsx = false;
      continue;
    }
    if (inJsx) continue;

    if (char === '<' || char === '>') {
      const before = code.substring(Math.max(0, i - 20), i);
      if (/<\w+>/.test(before) || /:\s*$/.test(before) || /extends\s+$/.test(before)) {
        continue;
      }
    }

    if (char && pairs[char] && char !== '<') {
      stack.push({ char, line: lineNum });
    } else if (char && closers[char] && char !== '>') {
      if (stack.length > 0 && stack[stack.length - 1]?.char === closers[char]) {
        stack.pop();
      }
    }
  }

  if (stack.length > 0) {
    let suffix = '';
    while (stack.length > 0) {
      const unmatched = stack.pop();
      if (unmatched) {
        suffix += pairs[unmatched.char];
      }
    }
    if (suffix && code.trim().length > 0) {
      code = code.trimEnd() + '\n' + suffix;
    }
  }

  return code;
}

// ============================================================================
// Backward Compatibility - buildImportLine helper
// ============================================================================

/**
 * Build an import statement from components
 * @deprecated This is an internal helper, use fixAndMergeImports instead
 */
export function buildImportLine(
  defaultImport: string | null,
  named: Set<string>,
  source: string
): string {
  const namedStr = Array.from(named).filter(Boolean).join(', ');

  if (defaultImport && namedStr) {
    return `import ${defaultImport}, { ${namedStr} } from '${source}';`;
  } else if (defaultImport) {
    return `import ${defaultImport} from '${source}';`;
  } else if (namedStr) {
    return `import { ${namedStr} } from '${source}';`;
  }
  return `import '${source}';`;
}
