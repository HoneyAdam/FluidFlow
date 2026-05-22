/**
 * Syntax Repair
 *
 * Basic syntax error detection and repair for AI-generated code.
 */

// ============================================================================
// Ternary Operator Fixes
// ============================================================================

/**
 * Fix malformed ternary operators
 * AI often writes: condition ? <Component /> : condition2 && <Other />
 * Should be: condition ? <Component /> : (condition2 && <Other />)
 */
export function fixMalformedTernary(code: string): string {
  let result = code;

  // Pattern 1: ? <JSX> : condition && <JSX>  ->  ? <JSX> : (condition && <JSX>)
  result = result.replace(
    /(\?\s*<[A-Z]\w*[^?:]*(?:\/>|<\/[A-Z]\w*>))\s*:\s*(\w+(?:\.\w+)*\s*&&\s*<[A-Z])/g,
    '$1 : ($2'
  );

  // Pattern 2: Incomplete ternary: ? <JSX />  } without :
  // Look for ? followed by JSX, then } without intervening :
  result = result.replace(
    /(\?\s*<[A-Z]\w*[^}]*(?:\/>|<\/[A-Z]\w*>))(\s*\})/g,
    (match, jsx, closing) => {
      // Check if there's already a : in the jsx part
      if (jsx.includes(':') && !jsx.includes('className:') && !jsx.includes('style:')) {
        return match;
      }
      return `${jsx} : null${closing}`;
    }
  );

  // Pattern 3: ? <JSX> : otherJsx without proper wrapping when otherJsx is conditional
  result = result.replace(
    /:\s*(\w+\s*\?\s*<[A-Z])/g,
    ': ($1'
  );

  return result;
}

// ============================================================================
// Arrow Function Fixes
// ============================================================================

/**
 * Fix arrow function syntax errors
 */
export function fixArrowFunctions(code: string): string {
  let result = code;

  // FIRST: = > should be => (must run before hybrid function fix)
  result = result.replace(/=\s+>/g, '=>');

  // CRITICAL: Fix hybrid function/arrow syntax: "function Name() => {" -> "function Name() {"
  // AI commonly generates this invalid mix of function declaration and arrow function

  // Pattern 1: Simple case - no params: function Name() => {
  result = result.replace(/function\s+(\w+)\s*\(\)\s*=>\s*\{/g, 'function $1() {');

  // Pattern 2: With params but no nested parens: function Name(a, b) => {
  result = result.replace(/function\s+(\w+)\s*\(([^)]*)\)\s*=>\s*\{/g, 'function $1($2) {');

  // Pattern 3: Complex - any content between function and => { (non-greedy)
  result = result.replace(/(\bfunction\s+\w+[\s\S]*?)\s*=>\s*\{/g, '$1 {');

  // ( ) => should be () =>
  result = result.replace(/\(\s+\)\s*=>/g, '() =>');

  // Fix missing arrow after parameter: (x) { should be (x) => {
  result = result.replace(/\)\s*\{(\s*(?:return|const|let|if|for|while))/g, ') => {$1');

  // Fix async () { to async () => {
  result = result.replace(/async\s*\([^)]*\)\s*\{(?!\s*=>)/g, (match) => {
    if (match.includes('=>')) return match;
    return match.replace('{', '=> {');
  });

  return result;
}

// ============================================================================
// JSX Attribute Fixes
// ============================================================================

/**
 * Fix JSX attribute syntax errors
 */
export function fixJsxAttributes(code: string): string {
  let result = code;

  // className"value" -> className="value"
  result = result.replace(/(\bclassName)"([^"]+)"/g, '$1="$2"');
  result = result.replace(/(\bclassName)'([^']+)'/g, "$1='$2'");

  // onClick"handler" -> onClick={handler} or onClick="handler"
  result = result.replace(/(\bonClick)"(\w+)"/g, '$1={$2}');

  // style"..." -> style={...}
  result = result.replace(/(\bstyle)"([^"]+)"/g, '$1={{$2}}');

  // key"value" -> key="value"
  result = result.replace(/(\bkey)"([^"]+)"/g, '$1="$2"');

  // href"url" -> href="url"
  result = result.replace(/(\bhref)"([^"]+)"/g, '$1="$2"');

  // src"url" -> src="url"
  result = result.replace(/(\bsrc)"([^"]+)"/g, '$1="$2"');

  // Fix double equals in JSX: className=="value" -> className="value"
  result = result.replace(/(\b(?:className|style|onClick|key|href|src|alt|id|name|type|value))==(")/g, '$1=$2');

  // Fix missing closing brace in JSX expression: {value -> {value}
  // This is tricky, only do it in obvious cases
  result = result.replace(/=\{([a-zA-Z_]\w*)(\s+[a-z])/gi, '={$1}$2');

  return result;
}

// ============================================================================
// String and Template Literal Fixes
// ============================================================================

/**
 * Fix string and template literal issues
 */
export function fixStringIssues(code: string): string {
  const result = code;
  const lines = result.split('\n');
  const fixedLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i] ?? '';

    // Count quotes to detect unclosed strings
    const singleQuotes = (line.match(/(?<!\\)'/g) || []).length;
    const doubleQuotes = (line.match(/(?<!\\)"/g) || []).length;
    const backticks = (line.match(/(?<!\\)`/g) || []).length;

    // If odd number of single quotes and line ends without semicolon
    if (singleQuotes % 2 === 1 && !line.trim().endsWith("'") && !line.trim().endsWith("',") && !line.trim().endsWith("';")) {
      // Check if next line starts with continuation
      if (i + 1 < lines.length && /^\s*['"]/.test(lines[i + 1] ?? '')) {
        // Likely multi-line string, leave it
      } else if (line.includes("'") && !line.includes('`')) {
        // Try to close the string at end of meaningful content
        const match = line.match(/'([^']+)$/);
        if (match) {
          line = line.replace(/'([^']+)$/, "'$1'");
        }
      }
    }

    // Same for double quotes
    if (doubleQuotes % 2 === 1 && !line.trim().endsWith('"') && !line.trim().endsWith('",') && !line.trim().endsWith('";')) {
      if (i + 1 < lines.length && /^\s*["']/.test(lines[i + 1] ?? '')) {
        // Multi-line, leave it
      } else if (line.includes('"') && !line.includes('`')) {
        const match = line.match(/"([^"]+)$/);
        if (match) {
          line = line.replace(/"([^"]+)$/, '"$1"');
        }
      }
    }

    // Fix unclosed template literals at end of line
    if (backticks % 2 === 1 && line.includes('${') && !line.trim().endsWith('`')) {
      // Check if it's a multi-line template literal
      const hasClosingBacktick = lines.slice(i + 1, i + 10).some(l => l.includes('`'));
      if (!hasClosingBacktick) {
        line = line + '`';
      }
    }

    fixedLines.push(line);
  }

  return fixedLines.join('\n');
}

// ============================================================================
// TypeScript-Specific Fixes
// ============================================================================

/**
 * Fix TypeScript-specific issues
 */
export function fixTypeScriptIssues(code: string): string {
  let result = code;

  // Fix: type[] = [] should be: type[] = []
  // Sometimes AI writes: const arr: string = [] instead of const arr: string[] = []
  result = result.replace(/:\s*(\w+)\s*=\s*\[\]/g, ': $1[] = []');

  // Fix duplicate type annotations: : : type -> : type
  result = result.replace(/:\s*:\s*/g, ': ');

  // Fix: interface Foo extends Bar, { -> interface Foo extends Bar {
  result = result.replace(/interface\s+(\w+)\s+extends\s+(\w+)\s*,\s*\{/g, 'interface $1 extends $2 {');

  // Fix: type Foo = | value -> type Foo = value
  result = result.replace(/type\s+(\w+)\s*=\s*\|\s*/g, 'type $1 = ');

  // Fix generic angle brackets that look like JSX: React.FC<Props> should stay, but < alone shouldn't

  return result;
}
