/**
 * Prompt Builder Service
 *
 * Builds continuation and missing-file prompts for multi-batch generation.
 * Extracted from useContinuationGeneration for testability.
 *
 * @module services/generation/promptBuilder
 */

import type { FileSystem } from '../../types';

/**
 * Build a continuation prompt for remaining files in a multi-batch generation.
 */
export function buildContinuationPrompt(opts: {
  completedFiles: string[];
  remainingFiles: string[];
  originalPrompt: string;
}): string {
  const { completedFiles, remainingFiles, originalPrompt } = opts;

  return `Continue generating the remaining files for the project.

## GENERATION CONTEXT
Already completed: ${completedFiles.length} files
Remaining: ${remainingFiles.length} files

### ALREADY COMPLETED FILES:
${completedFiles.map((f) => `- ${f}`).join('\n')}

### REMAINING FILES TO GENERATE:
${remainingFiles.map((f) => `- ${f}`).join('\n')}

### ORIGINAL REQUEST:
${originalPrompt}

Generate the remaining files. Each file must be COMPLETE and FUNCTIONAL.`;
}

/**
 * Build a targeted prompt requesting specific missing files.
 */
export function buildMissingFilesPrompt(opts: {
  missingFiles: string[];
  accumulatedFiles: FileSystem;
}): string {
  const { missingFiles, accumulatedFiles } = opts;
  const existingFileNames = Object.keys(accumulatedFiles);

  return `Generate ONLY the following specific files. These files are missing from the project.

## REQUIRED FILES (generate ALL of these):
${missingFiles.map((f, i) => `${i + 1}. ${f}`).join('\n')}

## CONTEXT
These files should integrate with the existing project structure. Use the same patterns and styles.

## EXISTING FILES FOR REFERENCE:
${existingFileNames.slice(0, 5).map((f) => `- ${f}`).join('\n')}
${existingFileNames.length > 5 ? `... and ${existingFileNames.length - 5} more files` : ''}

## CRITICAL INSTRUCTIONS:
1. Generate EXACTLY the ${missingFiles.length} files listed above
2. Use relative imports (./component, ../utils)
3. Return complete file contents - no truncation
4. Use Tailwind CSS for styling
5. Include data-ff-group and data-ff-id attributes on interactive elements

Return ONLY a JSON object with the files:
{
  "files": {
    "${missingFiles[0]}": "// complete file content...",
    ${missingFiles.length > 1 ? `"${missingFiles[1]}": "// complete file content..."` : ''}
  },
  "explanation": "Generated ${missingFiles.length} missing files"
}`;
}

/**
 * Build a truncation recovery prompt that asks the AI to continue from where it was cut off.
 */
export function buildTruncationRecoveryPrompt(opts: {
  rawResponse: string;
  originalPrompt: string;
  previewStart: number;
  previewEnd: number;
}): string {
  const { rawResponse, originalPrompt, previewStart = 2000, previewEnd = 500 } = opts;

  return `Continue generating from where you left off. Your previous response was truncated:

**Previous incomplete response (first ${previewStart} chars):**
${rawResponse.slice(0, previewStart)}

**Last ${previewEnd} chars of incomplete response:**
${rawResponse.slice(-previewEnd)}

Please continue from exactly where you stopped and complete the response. Make sure to:
1. Complete any incomplete JSON structure
2. Finish any cut-off file content
3. Provide all remaining files
4. Ensure the response is properly formatted JSON

Original prompt: ${originalPrompt}`;
}

/**
 * Calculate remaining files by checking against accumulated files.
 * Uses both exact match and filename match to handle path variations.
 */
export function calculateRemainingFiles(
  plannedFiles: string[],
  accumulatedFiles: FileSystem
): string[] {
  const allAccumulatedFileNames = Object.keys(accumulatedFiles).map((f) => f.split('/').pop());

  return plannedFiles.filter((f) => {
    const fileName = f.split('/').pop();
    const exactMatch = accumulatedFiles[f];
    const nameMatch = allAccumulatedFileNames.includes(fileName);
    return !exactMatch && !nameMatch;
  });
}

/**
 * Check if generation is complete based on multiple signals.
 */
export function isGenerationComplete(opts: {
  remainingFiles: string[];
  totalAccumulated: number;
  totalPlanned: number;
  aiMarkedComplete?: boolean;
  aiSaysNoRemaining?: boolean;
}): boolean {
  const { remainingFiles, totalAccumulated, totalPlanned, aiMarkedComplete, aiSaysNoRemaining } = opts;

  const noRemainingFiles = remainingFiles.length === 0;
  const allPlannedFilesReceived = totalAccumulated >= totalPlanned;

  return noRemainingFiles || aiMarkedComplete === true || allPlannedFilesReceived || aiSaysNoRemaining === true;
}
