/**
 * Bracket Balance
 *
 * Bracket balancing with context awareness.
 */

import type { BracketInfo } from './types';

// ============================================================================
// Bracket Balancing
// ============================================================================

/**
 * Advanced bracket balancing with context awareness
 */
export function fixBracketBalanceAdvanced(code: string): string {
  const stack: BracketInfo[] = [];
  const pairs: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
  const closers: Record<string, string> = { ')': '(', ']': '[', '}': '{' };

  let inString = false;
  let stringChar = '';
  let inTemplate = false;
  let templateDepth = 0;
  let inComment = false;
  let inMultilineComment = false;

  const lines = code.split('\n');
  let globalIndex = 0;

  for (let lineNum = 0; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum];
    if (!line) continue;

    for (let col = 0; col < line.length; col++) {
      const char = line[col];
      if (!char) continue;
      const nextChar = line[col + 1] || '';
      const prevChar = col > 0 ? line[col - 1] ?? '' : '';

      // Track comment state
      if (!inString && !inMultilineComment && char === '/' && nextChar === '/') {
        inComment = true;
      }
      if (!inString && !inComment && char === '/' && nextChar === '*') {
        inMultilineComment = true;
      }
      if (inMultilineComment && char === '*' && nextChar === '/') {
        inMultilineComment = false;
        col++;
        continue;
      }
      if (inComment || inMultilineComment) {
        globalIndex++;
        continue;
      }

      // Track string state
      if (!inTemplate && (char === '"' || char === "'") && prevChar !== '\\') {
        if (!inString) {
          inString = true;
          stringChar = char;
        } else if (char === stringChar) {
          inString = false;
        }
      }

      // Track template literal state
      if (char === '`' && prevChar !== '\\') {
        if (!inTemplate) {
          inTemplate = true;
          templateDepth = 0;
        } else if (templateDepth === 0) {
          inTemplate = false;
        }
      }

      // Track ${} inside template literals
      if (inTemplate && char === '$' && nextChar === '{') {
        templateDepth++;
      }
      if (inTemplate && templateDepth > 0 && char === '}') {
        templateDepth--;
      }

      if (inString || (inTemplate && templateDepth === 0)) {
        globalIndex++;
        continue;
      }

      // Track brackets
      if (pairs[char]) {
        stack.push({
          char,
          line: lineNum + 1,
          column: col + 1,
          index: globalIndex
        });
      } else if (closers[char]) {
        const lastOpen = stack[stack.length - 1];
        if (lastOpen && lastOpen.char === closers[char]) {
          stack.pop();
        } else {
          // Mismatched closer - this is an extra closer
          // We'll handle this by potentially removing it or ignoring
        }
      }

      globalIndex++;
    }

    inComment = false;
    globalIndex++; // For the newline
  }

  // Add missing closers at appropriate positions
  if (stack.length > 0) {
    // Sort by index descending to add from bottom up
    stack.sort((a, b) => b.index - a.index);

    let result = code;

    for (const unclosed of stack) {
      const closer = pairs[unclosed.char] ?? '';

      // Find a good place to insert the closer
      // Generally at the end of the same or next logical block
      const insertPos = findBestCloserPosition(result, unclosed.index, closer);

      result = result.slice(0, insertPos) + closer + result.slice(insertPos);
    }

    return result;
  }

  return code;
}

/**
 * Find the best position to insert a missing closer
 */
export function findBestCloserPosition(code: string, afterIndex: number, closer: string): number {
  const rest = code.slice(afterIndex);
  const lines = rest.split('\n');

  // For braces, look for end of block
  if (closer === '}') {
    // Look for lines that end with semicolon or another brace
    let offset = afterIndex;
    for (const line of lines.slice(0, 10)) {
      offset += line.length + 1;
      if (/;\s*$/.test(line) || /\}\s*$/.test(line)) {
        return offset;
      }
    }
  }

  // For parentheses, look for end of expression
  if (closer === ')') {
    let offset = afterIndex;
    for (const line of lines.slice(0, 5)) {
      // Look for likely expression ends
      if (/[;,}\]]/.test(line)) {
        const match = line.match(/[;,}\]]/);
        const matchIndex = match?.index ?? 0;
        if (match) {
          return offset + matchIndex;
        }
      }
      offset += line.length + 1;
    }
  }

  // Default: insert at end of code
  return code.length;
}
