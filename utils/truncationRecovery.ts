/**
 * Truncation Recovery Utilities
 *
 * Handles recovery of files from truncated AI responses.
 * Extracted from useCodeGeneration for better maintainability.
 */

import { FileSystem } from '@/types';
import { GenerationMeta } from './cleanCode';
import { extractFilesFromTruncatedResponse } from './extractPartialFiles';

export interface FilePlan {
  create: string[];
  delete: string[];
  total: number;
  completed?: string[];
}

export interface RecoveryResult {
  /** Type of recovery action to take */
  action: 'none' | 'continuation' | 'success' | 'partial';
  /** Files that were successfully recovered */
  recoveredFiles?: Record<string, string>;
  /** Files that need to be regenerated */
  filesToRegenerate?: string[];
  /** Files that are confirmed complete */
  goodFiles?: Record<string, string>;
  /** Generation metadata for continuation */
  generationMeta?: GenerationMeta;
  /** Explanation message */
  message?: string;
  /** Count of recovered files */
  recoveredCount?: number;
}

/**
 * Analyze truncated response and determine recovery action
 */
export function analyzeTruncatedResponse(
  fullText: string,
  currentFiles: FileSystem,
  filePlan: FilePlan | null
): RecoveryResult {
  // Too short to recover anything meaningful
  if (fullText.length < 1000) {
    return { action: 'none' };
  }

  const extraction = extractFilesFromTruncatedResponse(fullText, currentFiles);
  const completeCount = Object.keys(extraction.completeFiles).length;
  const partialCount = Object.keys(extraction.partialFiles).length;

  if (completeCount === 0 && partialCount === 0) {
    return { action: 'none' };
  }

  const recoveredFileNames = Object.keys(extraction.completeFiles);

  // Check if we have a plan and there are missing files
  if (filePlan && filePlan.create.length > 0) {
    const missingFromPlan = filePlan.create.filter(
      (f) => !recoveredFileNames.includes(f)
    );

    if (missingFromPlan.length > 0) {
      const genMeta: GenerationMeta = {
        totalFilesPlanned: filePlan.total,
        filesInThisBatch: recoveredFileNames,
        completedFiles: recoveredFileNames,
        remainingFiles: missingFromPlan,
        currentBatch: 1,
        totalBatches: Math.ceil(filePlan.total / 5),
        isComplete: false,
      };

      return {
        action: 'continuation',
        recoveredFiles: extraction.completeFiles,
        generationMeta: genMeta,
        recoveredCount: completeCount,
        message: `Generating... ${completeCount}/${filePlan.total} files`,
      };
    }
  }

  // Check if all plan files are recovered
  if (filePlan && partialCount === 0) {
    const planFileNames = filePlan.create.map((f) => f.split('/').pop());
    const recoveredNames = recoveredFileNames.map((f) => f.split('/').pop());
    const allPlanFilesRecovered = planFileNames.every((name) => recoveredNames.includes(name));

    if (allPlanFilesRecovered) {
      return {
        action: 'success',
        recoveredFiles: extraction.completeFiles,
        recoveredCount: completeCount,
        message: `Generated ${completeCount} files!`,
      };
    }
  }

  // Check for suspicious truncation
  const suspiciousTruncation = checkSuspiciousTruncation(
    extraction.completeFiles,
    partialCount,
    filePlan,
    recoveredFileNames
  );

  if (suspiciousTruncation && filePlan && filePlan.create.length > 0) {
    const { truncatedFiles, goodFiles } = identifyTruncatedFiles(
      extraction.completeFiles,
      filePlan
    );

    return {
      action: 'continuation',
      recoveredFiles: extraction.completeFiles,
      filesToRegenerate: truncatedFiles,
      goodFiles,
      recoveredCount: Object.keys(goodFiles).length,
      message: `Generating... ${Object.keys(goodFiles).length}/${filePlan.total} files`,
    };
  }

  // All files look complete
  if (completeCount > 0) {
    return {
      action: 'success',
      recoveredFiles: extraction.completeFiles,
      recoveredCount: completeCount,
      message: `Generated ${completeCount} files!`,
    };
  }

  // Try to use partial files
  if (partialCount > 0) {
    const fixedPartialFiles = fixPartialFiles(extraction.partialFiles);

    if (Object.keys(fixedPartialFiles).length > 0) {
      return {
        action: 'partial',
        recoveredFiles: fixedPartialFiles,
        recoveredCount: Object.keys(fixedPartialFiles).length,
        message: `Recovered ${Object.keys(fixedPartialFiles).length} partial files`,
      };
    }
  }

  return { action: 'none' };
}

/**
 * Emergency extraction from code blocks when JSON parsing fails
 * Handles multiple patterns:
 * 1. Standard markdown code blocks: ```tsx ... ```
 * 2. File path comments followed by code without backticks: // src/path.tsx\nimport...
 *
 * @param fullText - The full AI response text
 * @param forceExtract - If true, skip length check (used for format fallback)
 */
export function emergencyCodeBlockExtraction(
  fullText: string,
  forceExtract: boolean = false
): Record<string, string> | null {
  // Skip length check if forced (for format fallback scenarios)
  if (!forceExtract && fullText.length < 5000) return null;

  const emergencyFiles: Record<string, string> = {};
  let fileIndex = 1;

  // PATTERN 1: Standard markdown code blocks with optional file path before
  // Matches: `// src/path.tsx\n```tsx` or just ```tsx with path as first comment
  const codeBlockRegex = /(?:\/\/\s*(src\/[\w./-]+\.[a-zA-Z]+)\s*\n)?```(?:tsx?|jsx?|typescript|javascript|js|ts)\s*\n([\s\S]*?)\n```/g;

  const matches = [...fullText.matchAll(codeBlockRegex)];

  for (const match of matches) {
    const filePathBefore = match[1]; // Path from comment before code block
    const codeContent = match[2]?.trim() || '';
    const matchPosition = match.index || 0;

    if (codeContent.length < 50) continue;

    // Try to detect file path from multiple sources
    let detectedPath: string | null = filePathBefore || null;

    if (!detectedPath) {
      // Check first line for file path comment: // src/components/Header.tsx
      const firstLineMatch = codeContent.match(/^\/\/\s*(src\/[\w./-]+\.[a-zA-Z]+)/);
      if (firstLineMatch?.[1]) {
        detectedPath = firstLineMatch[1];
      }
    }

    if (!detectedPath) {
      // Look for file path pattern in surrounding context (100 chars before code block)
      const contextBefore = fullText.slice(Math.max(0, matchPosition - 100), matchPosition);
      const contextMatch = contextBefore.match(/(src\/[\w./-]+\.[a-zA-Z]+)\s*$/);
      if (contextMatch?.[1]) {
        detectedPath = contextMatch[1];
      }
    }

    // Use detected path or generate one based on code content
    const filePath = detectedPath || guessFilePathFromContent(codeContent, fileIndex);

    // Remove file path comment from start of code if present
    let cleanedContent = codeContent;
    if (cleanedContent.match(/^\/\/\s*src\/[\w./-]+\.[a-zA-Z]+\s*\n/)) {
      cleanedContent = cleanedContent.replace(/^\/\/\s*src\/[\w./-]+\.[a-zA-Z]+\s*\n/, '');
    }

    emergencyFiles[filePath] = cleanedContent.trim();
    fileIndex++;
  }

  // PATTERN 2: File path comment followed directly by code (NO backticks)
  // Example: "// src/components/Header.tsx\nimport { useState } from 'react'"
  // Also handles: "// App.tsx", "// components/Header.tsx"
  // This handles AI responses that do not use markdown code blocks
  if (Object.keys(emergencyFiles).length === 0) {
    console.log('[EmergencyExtraction] No code blocks found, trying file path comment extraction...');

    // Find all file path comments and extract code until next file path or end
    // More flexible regex: // path.ext or // folder/path.ext (optionally with src/)
    const filePathRegex = /\/\/\s*((?:src\/)?[\w./-]+\.(?:tsx?|jsx?|css|json|md))\s*\n/g;
    const filePathMatches = [...fullText.matchAll(filePathRegex)];

    for (let i = 0; i < filePathMatches.length; i++) {
      const match = filePathMatches[i];
      if (!match) continue;
      let filePath = match[1];
      if (!filePath) continue;

      // Normalize path - add src/ prefix if not present
      if (!filePath.startsWith('src/')) {
        filePath = 'src/' + filePath;
      }

      const startPos = (match.index || 0) + match[0].length;

      // End position is either next file path or end of text
      const nextMatch = filePathMatches[i + 1];
      const endPos = nextMatch?.index ?? fullText.length;

      // Also check for end-of-code patterns (explanation text, etc.)
      const codeSection = fullText.slice(startPos, endPos);
      const endPatterns = [
        /\n\n[A-Z][^{}[\]()]*:\s*$/m,        // "Section Name:" at end of line
        /\n\n[-*•]\s+[A-Z]/m,                  // "- Bullet point"
        /\n\n\d+\.\s+[A-Z]/m,                  // "1. Numbered list"
        /\n\n(?:Created|Updated|Added|Fixed|Implemented)\s/m,  // Common intro words
      ];

      let codeContent = codeSection;
      for (const pattern of endPatterns) {
        const endMatch = codeSection.match(pattern);
        if (endMatch && endMatch.index !== undefined && endMatch.index > 50) {
          codeContent = codeSection.slice(0, endMatch.index);
          break;
        }
      }

      codeContent = codeContent.trim();

      // Validate it looks like actual code (has common code patterns)
      const looksLikeCode = codeContent.length > 50 &&
        /^(?:import|export|const|let|var|function|interface|type|class|\/\*|'use|"use)/m.test(codeContent);

      if (looksLikeCode) {
        emergencyFiles[filePath] = codeContent;
        fileIndex++;
        console.log(`[EmergencyExtraction] Extracted: ${filePath} (${codeContent.length} chars)`);
      }
    }
  }

  if (Object.keys(emergencyFiles).length > 0) {
    console.log('[EmergencyExtraction] Total files recovered:', Object.keys(emergencyFiles));
  }

  return Object.keys(emergencyFiles).length > 0 ? emergencyFiles : null;
}

/**
 * Guess file path based on code content analysis
 */
function guessFilePathFromContent(code: string, index: number): string {
  // Check for export default function ComponentName
  const componentMatch = code.match(/export\s+(?:default\s+)?function\s+(\w+)/);
  if (componentMatch?.[1]) {
    const name = componentMatch[1];
    // PascalCase = component
    if (/^[A-Z]/.test(name)) {
      return `src/components/${name}.tsx`;
    }
    // camelCase = hook
    if (/^use[A-Z]/.test(name)) {
      return `src/hooks/${name}.ts`;
    }
  }

  // Check for interface/type definitions
  if (code.match(/^(?:export\s+)?(?:interface|type)\s+\w+/m)) {
    return `src/types/index.ts`;
  }

  // Check for App component specifically
  if (code.match(/function\s+App\s*\(/)) {
    return 'src/App.tsx';
  }

  // Default fallback
  return `src/recovered${index}.tsx`;
}

/**
 * Check if files have suspicious truncation patterns
 */
function checkSuspiciousTruncation(
  completeFiles: Record<string, string>,
  partialCount: number,
  filePlan: FilePlan | null,
  recoveredFileNames: string[]
): boolean {
  const shouldCheck =
    partialCount > 0 ||
    (filePlan && filePlan.create.some((f) => !recoveredFileNames.includes(f)));

  if (!shouldCheck) return false;

  return Object.entries(completeFiles).some(([path, content]) => {
    const openBraces = (content.match(/\{/g) || []).length;
    const closeBraces = (content.match(/\}/g) || []).length;
    const openParens = (content.match(/\(/g) || []).length;
    const closeParens = (content.match(/\)/g) || []).length;
    const hasIncompleteEscape = /\\$/.test(content.trim());
    const isJSXFile = path.endsWith('.tsx') || path.endsWith('.jsx');
    const hasIncompleteJSX = isJSXFile && !content.trim().endsWith('}');

    return (
      openBraces - closeBraces > 1 ||
      openParens - closeParens > 2 ||
      hasIncompleteEscape ||
      hasIncompleteJSX
    );
  });
}

/**
 * Identify which files are truncated and which are good
 */
function identifyTruncatedFiles(
  completeFiles: Record<string, string>,
  filePlan: FilePlan
): { truncatedFiles: string[]; goodFiles: Record<string, string> } {
  const truncatedFiles = Object.entries(completeFiles)
    .filter(([path, content]) => {
      const openBraces = (content.match(/\{/g) || []).length;
      const closeBraces = (content.match(/\}/g) || []).length;
      const isJSXFile = path.endsWith('.tsx') || path.endsWith('.jsx');
      const hasIncompleteJSX = isJSXFile && !content.trim().endsWith('}');
      return openBraces - closeBraces > 1 || hasIncompleteJSX || /\\$/.test(content.trim());
    })
    .map(([path]) => path);

  const lastCreate = filePlan.create[filePlan.create.length - 1];
  const filesToRegenerate =
    truncatedFiles.length > 0
      ? truncatedFiles
      : lastCreate
      ? [lastCreate]
      : [];

  const goodFiles = Object.fromEntries(
    Object.entries(completeFiles).filter(
      ([path]) => !filesToRegenerate.includes(path)
    )
  );

  return { truncatedFiles: filesToRegenerate, goodFiles };
}

/**
 * Attempt to fix partial files
 */
function fixPartialFiles(
  partialFiles: Record<string, string | { content: string; truncatedAt?: number }>
): Record<string, string> {
  const fixedFiles: Record<string, string> = {};

  for (const [filePath, fileData] of Object.entries(partialFiles)) {
    const content = typeof fileData === 'string' ? fileData : fileData.content;

    if (!content || content.length <= 100) continue;

    let cleaned = content
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\'/g, "'")
      .trim();

    cleaned = cleaned
      .replace(/,\s*$/, '')
      .replace(/[^\\]"$/, '"')
      .replace(/\{[^}]*$/, (match) => match + '\n}');

    if (cleaned.length > 100) {
      fixedFiles[filePath] = cleaned;
    }
  }

  return fixedFiles;
}
