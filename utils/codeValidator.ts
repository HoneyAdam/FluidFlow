/**
 * Code Validation Utilities
 *
 * Provides syntax validation for generated code without attempting fixes.
 * Extracted from cleanCode.ts for better separation of concerns.
 */

// ============================================================================
// TYPES
// ============================================================================

/**
 * Represents a syntax issue found during validation
 */
export interface SyntaxIssue {
  type: 'error' | 'warning';
  message: string;
  line?: number;
  column?: number;
  fix?: string;
}

// ============================================================================
// VALIDATION FUNCTIONS
// ============================================================================

/**
 * Validate JSX syntax and return issues found.
 * This is a quick pre-check before transpilation.
 */
export function validateJsxSyntax(code: string): SyntaxIssue[] {
  const issues: SyntaxIssue[] = [];
  const lines = code.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;
    const lineNum = i + 1;

    // Check for `: condition && (` pattern
    if (/\)\s*:\s*[\w!.]+\s*&&\s*\(/.test(line)) {
      issues.push({
        type: 'error',
        message: 'Malformed ternary: using && instead of ? after :',
        line: lineNum,
        fix: 'Replace && with ? for chained ternary'
      });
    }

    // Check for unclosed JSX tags on single line
    const jsxTagMatch = line.match(/<([A-Z]\w*)(?:\s[^>]*)?>(?!.*<\/\1>)(?!.*\/>)/);
    const jsxTagName = jsxTagMatch?.[1];
    if (jsxTagMatch && jsxTagName && !line.includes('return') && !lines.slice(i + 1, i + 10).some(l => l.includes(`</${jsxTagName}>`))) {
      // do not warn if closing tag is on a nearby line
      const hasClosingNearby = lines.slice(i, i + 20).some(l => l.includes(`</${jsxTagName}>`));
      if (!hasClosingNearby) {
        issues.push({
          type: 'warning',
          message: `Potentially unclosed JSX tag: <${jsxTagName}>`,
          line: lineNum
        });
      }
    }

    // Check for = > instead of =>
    if (/=\s+>/.test(line) && !/[<>]=/.test(line)) {
      issues.push({
        type: 'error',
        message: 'Malformed arrow function: space between = and >',
        line: lineNum,
        fix: 'Remove space: = > should be =>'
      });
    }

    // Check for className"value" without =
    if (/className"[^"]+"|onClick"[^"]+"/.test(line)) {
      issues.push({
        type: 'error',
        message: 'Missing = in JSX attribute',
        line: lineNum,
        fix: 'Add = before the value'
      });
    }

    // Check for incomplete ternary at end of expression
    const trimmedLine = line.trim();
    if (trimmedLine && /\?\s*<[A-Z]\w*[^:]*\s*\}$/.test(trimmedLine)) {
      const hasColonAfter = lines.slice(i + 1, i + 3).some(l => /^\s*:/.test(l));
      if (!hasColonAfter) {
        issues.push({
          type: 'error',
          message: 'Incomplete ternary: missing else branch (: null)',
          line: lineNum,
          fix: 'Add : null before the closing }'
        });
      }
    }
  }

  // Check overall bracket balance
  let braceCount = 0;
  let parenCount = 0;
  let bracketCount = 0;

  for (const char of code) {
    if (char === '{') braceCount++;
    if (char === '}') braceCount--;
    if (char === '(') parenCount++;
    if (char === ')') parenCount--;
    if (char === '[') bracketCount++;
    if (char === ']') bracketCount--;
  }

  if (braceCount !== 0) {
    issues.push({
      type: 'error',
      message: `Unbalanced braces: ${braceCount > 0 ? 'missing ' + braceCount + ' closing }' : 'extra ' + Math.abs(braceCount) + ' closing }'}`,
    });
  }
  if (parenCount !== 0) {
    issues.push({
      type: 'error',
      message: `Unbalanced parentheses: ${parenCount > 0 ? 'missing ' + parenCount + ' closing )' : 'extra ' + Math.abs(parenCount) + ' closing )'}`,
    });
  }
  if (bracketCount !== 0) {
    issues.push({
      type: 'error',
      message: `Unbalanced brackets: ${bracketCount > 0 ? 'missing ' + bracketCount + ' closing ]' : 'extra ' + Math.abs(bracketCount) + ' closing ]'}`,
    });
  }

  return issues;
}

/**
 * Validates code and returns issues found.
 *
 * IMPORTANT: This function no longer attempts to "fix" code.
 * Previous "fix" attempts were causing more harm than good by transforming
 * valid LLM-generated code into broken code.
 *
 * Now it only validates and reports issues - the caller can decide what to do.
 */
export function validateAndFixCode(code: string, filePath?: string): {
  code: string;
  fixed: boolean;
  issues: SyntaxIssue[];
} {
  if (!code) return { code: '', fixed: false, issues: [] };

  // Only validate - do NOT attempt to fix
  // Aggressive fixes were causing issues like:
  // - "function Name() => {" hybrid syntax errors
  // - "const x = (param: Type) {" missing arrow errors
  const issues = validateJsxSyntax(code);

  if (issues.length > 0 && filePath) {
    console.warn(`[validateAndFixCode] ${filePath}: ${issues.length} syntax issues detected`);
  }

  return {
    code: code, // Return original code unchanged
    fixed: false,
    issues
  };
}

/**
 * Extract line context around an error for better debugging
 */
export function getErrorContext(code: string, line: number, contextLines = 2): string {
  const lines = code.split('\n');
  const start = Math.max(0, line - 1 - contextLines);
  const end = Math.min(lines.length, line + contextLines);

  return lines
    .slice(start, end)
    .map((l, i) => {
      const lineNum = start + i + 1;
      const marker = lineNum === line ? '>>> ' : '    ';
      return `${marker}${lineNum.toString().padStart(4)}: ${l}`;
    })
    .join('\n');
}

/**
 * Parse Babel error message to extract line/column info
 */
export function parseBabelError(message: string): { line?: number; column?: number; message: string } {
  // Try to extract line:column from various error formats
  const lineColMatch = message.match(/\((\d+):(\d+)\)/);
  if (lineColMatch) {
    return {
      line: parseInt(lineColMatch[1] ?? '0', 10),
      column: parseInt(lineColMatch[2] ?? '0', 10),
      message
    };
  }

  const lineMatch = message.match(/Line (\d+):/);
  if (lineMatch) {
    return {
      line: parseInt(lineMatch[1] ?? '0', 10),
      message
    };
  }

  return { message };
}

/**
 * Validates that the cleaned code looks like valid code
 */
export function isValidCode(code: string): boolean {
  if (!code || code.length < 10) return false;

  // Check for common code patterns
  const hasImport = /import\s+/.test(code);
  const hasExport = /export\s+/.test(code);
  const hasFunction = /function\s+|const\s+\w+\s*=|=>\s*{/.test(code);
  const hasJSX = /<\w+/.test(code);
  const hasClass = /class\s+\w+/.test(code);

  return hasImport || hasExport || hasFunction || hasJSX || hasClass;
}
