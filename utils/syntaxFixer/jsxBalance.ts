/**
 * JSX Balance
 *
 * JSX tag extraction and balancing utilities.
 */

import type { JsxTag } from './types';

// ============================================================================
// JSX Tag Extraction
// ============================================================================

/**
 * Extract all JSX tags from code
 */
export function extractJsxTags(code: string): JsxTag[] {
  const tags: JsxTag[] = [];
  const lines = code.split('\n');
  let inString = false;
  let stringChar = '';
  let inComment = false;
  let inMultilineComment = false;

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum] ?? '';

    for (let col = 0; col < line.length; col++) {
      const char = line[col] ?? '';
      const nextChar = line[col + 1] || '';
      const prevChar = line[col - 1] || '';

      // Track comment state
      if (!inString && !inMultilineComment && char === '/' && nextChar === '/') {
        inComment = true;
      }
      if (!inString && !inComment && char === '/' && nextChar === '*') {
        inMultilineComment = true;
      }
      if (inMultilineComment && char === '*' && nextChar === '/') {
        inMultilineComment = false;
        col++; // Skip the /
        continue;
      }
      if (inComment || inMultilineComment) continue;

      // Track string state
      if ((char === '"' || char === "'" || char === '`') && prevChar !== '\\') {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          inString = false;
        }
      }
      if (inString) continue;

      // Look for JSX tags
      if (char === '<') {
        // Check if it's a comparison operator
        if (nextChar === '=' || prevChar === ' ' && /[<>=!]/.test(nextChar)) continue;

        // Extract the tag
        const restOfLine = line.slice(col);

        // Self-closing tag: <Component ... />
        const selfClosingMatch = restOfLine.match(/^<([A-Z][a-zA-Z0-9]*)(?:\s[^>]*)?\s*\/>/);
        if (selfClosingMatch) {
          tags.push({
            name: selfClosingMatch[1] ?? '',
            isClosing: false,
            isSelfClosing: true,
            line: lineNum + 1,
            column: col + 1,
            index: code.indexOf(line) + col
          });
          continue;
        }

        // Closing tag: </Component>
        const closingMatch = restOfLine.match(/^<\/([A-Z][a-zA-Z0-9]*)\s*>/);
        if (closingMatch) {
          tags.push({
            name: closingMatch[1] ?? '',
            isClosing: true,
            isSelfClosing: false,
            line: lineNum + 1,
            column: col + 1,
            index: code.indexOf(line) + col
          });
          continue;
        }

        // Opening tag: <Component ...>
        const openingMatch = restOfLine.match(/^<([A-Z][a-zA-Z0-9]*)(?:\s[^>]*)?\s*>/);
        if (openingMatch) {
          tags.push({
            name: openingMatch[1] ?? '',
            isClosing: false,
            isSelfClosing: false,
            line: lineNum + 1,
            column: col + 1,
            index: code.indexOf(line) + col
          });
        }
      }
    }

    inComment = false; // Reset single-line comment at end of line
  }

  return tags;
}

// ============================================================================
// Unclosed Tag Detection
// ============================================================================

/**
 * Find unclosed JSX tags
 */
export function findUnclosedTags(tags: JsxTag[]): JsxTag[] {
  const stack: JsxTag[] = [];

  for (const tag of tags) {
    if (tag.isSelfClosing) continue;

    if (tag.isClosing) {
      // Look for matching opening tag
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i]?.name === tag.name) {
          stack.splice(i, 1);
          break;
        }
      }
    } else {
      stack.push(tag);
    }
  }

  return stack;
}

// ============================================================================
// JSX Tag Balance Fixing
// ============================================================================

/**
 * Fix unclosed JSX tags by adding closing tags
 */
export function fixJsxTagBalance(code: string): string {
  const tags = extractJsxTags(code);
  const unclosed = findUnclosedTags(tags);

  if (unclosed.length === 0) return code;

  // Sort unclosed tags by line number (descending) so we add closers from bottom up
  unclosed.sort((a, b) => b.line - a.line);

  const lines = code.split('\n');

  for (const tag of unclosed) {
    // Find a good place to insert the closing tag
    // Look for the next closing brace or the end of the containing block
    let insertLine = tag.line - 1; // 0-indexed

    // Search for a good insertion point
    for (let i = insertLine; i < lines.length; i++) {
      const line = lines[i] ?? '';

      // If we find a return statement end or closing brace, insert before it
      if (i > insertLine && (/^\s*\);?\s*$/.test(line) || /^\s*\}\s*$/.test(line))) {
        insertLine = i;
        break;
      }

      // do not go past the function/component end
      if (i > insertLine + 20) {
        insertLine = Math.min(insertLine + 5, lines.length - 1);
        break;
      }
    }

    // Insert the closing tag
    const indent = (lines[tag.line - 1] ?? '').match(/^\s*/)?.[0] || '';
    lines.splice(insertLine, 0, `${indent}</${tag.name}>`);
  }

  return lines.join('\n');
}
