/**
 * Multi-File Parser
 *
 * Parses AI responses containing multiple files in JSON format.
 * Includes enhanced repair for truncated responses.
 */

import { isIgnoredPath } from './filePathUtils';
import { cleanGeneratedCode } from './codeCleaner';
import { repairTruncatedJson } from './jsonParser';

// ============================================================================
// Types
// ============================================================================

/**
 * Generation metadata for smart continuation
 */
export interface GenerationMeta {
  totalFilesPlanned: number;
  filesInThisBatch: string[];
  completedFiles: string[];
  remainingFiles: string[];
  currentBatch: number;
  totalBatches: number;
  isComplete: boolean;
}

export interface MultiFileParseResult {
  files: Record<string, string>;
  explanation?: string;
  truncated?: boolean;
  deletedFiles?: string[];
  fileChanges?: Record<string, string>;
  generationMeta?: GenerationMeta;
  continuation?: {
    prompt: string;
    remainingFiles: string[];
    currentBatch: number;
    totalBatches: number;
  };
}

// ============================================================================
// Main Parser
// ============================================================================

/**
 * Parses AI response that might contain multiple files in JSON format.
 * Includes enhanced repair for truncated responses.
 * Supports generationMeta for smart continuation.
 */
export function parseMultiFileResponse(
  response: string,
  noThrow: boolean = false
): MultiFileParseResult | null {
  try {
    // Prevent recursion by limiting response size
    if (response.length > 100000) {
      console.warn('[parseMultiFileResponse] Response too large, potential recursion:', response.length);
      if (noThrow) return null;
      throw new Error(`Response too large (${Math.round(response.length/1000)}KB). This may indicate infinite recursion.`);
    }

    // First, try to extract JSON from markdown code blocks
    const codeBlockMatch = response.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    let jsonString = codeBlockMatch ? codeBlockMatch[1] : response;

    // Trim leading whitespace/newlines
    jsonString = jsonString.trimStart();
    jsonString = jsonString.replace(/^[\uFEFF\u200B-\u200D\u00A0]+/, '');

    // Remove PLAN comment if present
    jsonString = removePlanComment(jsonString);

    // Try to find JSON object in the string
    const jsonMatch = jsonString.match(/\{[\s\S]*$/);
    if (jsonMatch) {
      let jsonToParse = jsonMatch[0];

      // Repair missing closing braces
      jsonToParse = repairMissingBraces(jsonToParse);
      let wasTruncated = false;

      // Try to parse
      let parsed;
      try {
        parsed = JSON.parse(jsonToParse);
      } catch {
        console.log('[parseMultiFileResponse] Direct parse failed, attempting repair...');
        wasTruncated = true;

        try {
          const repaired = repairTruncatedJson(jsonToParse);
          parsed = JSON.parse(repaired);
          console.log('[parseMultiFileResponse] Repair successful');
        } catch {
          // Try fallback recovery methods
          parsed = tryFallbackRecovery(jsonString, jsonToParse, noThrow);
          if (!parsed) return null;
        }
      }

      // Validate that parsed is an object
      if (typeof parsed !== 'object' || parsed === null) {
        return null;
      }

      // Extract and clean files
      const result = extractAndCleanFiles(parsed, wasTruncated);
      if (!result) return null;

      return result;
    }

    // No JSON found in response
    throw new Error('No valid JSON found in response. The model may not support structured code generation.');
  } catch (e) {
    if (e instanceof Error) {
      throw e;
    }
    throw new Error('Failed to parse model response. Try a different model.', { cause: e });
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Remove PLAN comment from JSON string
 */
function removePlanComment(jsonString: string): string {
  const planIndex = jsonString.indexOf('// PLAN:');
  const hasPlanComment = planIndex !== -1 && (planIndex === 0 || /^[\s]*$/.test(jsonString.slice(0, planIndex)));

  if (hasPlanComment) {
    const planStart = planIndex;
    const firstBrace = jsonString.indexOf('{', planStart);

    if (firstBrace !== -1 && firstBrace > planStart) {
      let braceCount = 0;
      let planEnd = firstBrace;

      for (let i = firstBrace; i < jsonString.length; i++) {
        const char = jsonString[i];
        if (char === '{') braceCount++;
        else if (char === '}') {
          braceCount--;
          if (braceCount === 0) {
            planEnd = i + 1;
            break;
          }
        }
      }

      const afterPlan = jsonString.substring(planEnd).trimStart();
      console.log('[parseMultiFileResponse] Removed PLAN comment');
      return afterPlan;
    }
  }

  return jsonString;
}

/**
 * Repair missing closing braces
 */
function repairMissingBraces(jsonToParse: string): string {
  const trimmed = jsonToParse.trim();
  let openBraces = 0;
  let closeBraces = 0;
  let inString = false;
  let escapeNext = false;

  for (let i = 0; i < trimmed.length; i++) {
    const char = trimmed[i];
    if (escapeNext) {
      escapeNext = false;
      continue;
    }
    if (char === '\\' && inString) {
      escapeNext = true;
      continue;
    }
    if (char === '"' && !escapeNext) {
      inString = !inString;
      continue;
    }
    if (!inString) {
      if (char === '{') openBraces++;
      else if (char === '}') closeBraces++;
    }
  }

  if (openBraces > closeBraces) {
    const missingBraces = openBraces - closeBraces;
    for (let i = 0; i < missingBraces; i++) {
      jsonToParse += '}';
    }
    console.log(`[parseMultiFileResponse] Added ${missingBraces} closing brace(s)`);
  }

  return jsonToParse;
}

/**
 * Try fallback recovery methods for severely truncated responses
 */
function tryFallbackRecovery(
  jsonString: string,
  jsonToParse: string,
  noThrow: boolean
): Record<string, unknown> | null {
  // Try to extract just the files object
  const filesMatch = jsonString.match(/"files"\s*:\s*\{([\s\S]*)/);
  if (filesMatch) {
    try {
      const filesJson = '{' + filesMatch[1];
      const repairedFiles = repairTruncatedJson(filesJson);
      const filesObj = JSON.parse(repairedFiles);
      console.log('[parseMultiFileResponse] Extracted partial files object');
      return { files: filesObj, explanation: 'Response was truncated - showing partial results.' };
    } catch {
      // Continue to next fallback
    }
  }

  // Try regex-based file extraction
  const recovered = tryRegexRecovery(jsonToParse);
  if (recovered) return recovered;

  if (!noThrow) {
    throw new Error('Response was truncated and could not be repaired. Try a shorter prompt or different model.');
  }
  return null;
}

/**
 * Try to recover files using regex patterns
 */
function tryRegexRecovery(jsonToParse: string): Record<string, unknown> | null {
  // Look for file entries with backtick content
  const fileMatches = jsonToParse.match(/"([^"]+\.(?:tsx?|jsx?|css|json))":\s*`([^`]*)`/gs);
  if (fileMatches && fileMatches.length > 0) {
    const partialFiles: Record<string, string> = {};
    fileMatches.forEach(match => {
      const fileMatch = match.match(/"([^"]+\.(?:tsx?|jsx?|css|json))":\s*`([^`]*)`/);
      if (fileMatch) {
        partialFiles[fileMatch[1]] = fileMatch[2];
      }
    });
    if (Object.keys(partialFiles).length > 0) {
      console.log('[parseMultiFileResponse] Recovered partial files using regex');
      return {
        files: partialFiles,
        explanation: 'Response was severely truncated - recovered ' + Object.keys(partialFiles).length + ' files.'
      };
    }
  }

  // Try simple pattern matching for quoted content
  const simplePattern = /"([^"]+\.(?:tsx?|jsx?|css|json))":\s*"([^"]*(?:\\.[^"]*)*?)"/g;
  const matches = [...jsonToParse.matchAll(simplePattern)];

  if (matches && matches.length > 0) {
    const partialFiles: Record<string, string> = {};
    matches.forEach(([, filePath, fileContent]) => {
      const cleanedContent = fileContent
        .replace(/\\'/g, "'")
        .replace(/\\"/g, '"')
        .replace(/\\n/g, '\n')
        .trim();
      partialFiles[filePath] = cleanedContent;
    });

    if (Object.keys(partialFiles).length > 0) {
      console.log('[parseMultiFileResponse] Recovered files with pattern matching');
      return {
        files: partialFiles,
        explanation: 'Response was severely truncated - recovered ' + Object.keys(partialFiles).length + ' files.'
      };
    }
  }

  return null;
}

/**
 * Extract and clean files from parsed response
 */
function extractAndCleanFiles(
  parsed: Record<string, unknown>,
  wasTruncated: boolean
): MultiFileParseResult | null {
  // Extract explanation if present
  const explanation = (parsed.explanation || parsed.description) as string | undefined;

  // Get the files - could be in various keys
  let filesObj = (parsed.files || parsed.fileChanges || parsed.Changes || parsed.changes || parsed) as Record<string, unknown>;
  if ('explanation' in filesObj) delete filesObj.explanation;
  if ('description' in filesObj) delete filesObj.description;

  // Check for file-like keys
  const hasFileKeys = Object.keys(filesObj).some(k => k.includes('.') || k.includes('/'));

  // If filesObj doesn't look like files but parsed does, use parsed
  if (!hasFileKeys && typeof parsed === 'object') {
    const rootFileKeys = Object.keys(parsed).filter(k => k.includes('.') || k.includes('/'));
    if (rootFileKeys.length > 0) {
      filesObj = parsed;
    }
  }

  const fileKeys = Object.keys(filesObj).filter(k => k.includes('.') || k.includes('/'));

  if (fileKeys.length === 0) {
    throw new Error('Model returned no code files. Try a model better suited for code generation.');
  }

  // Clean each file's content
  const cleaned: Record<string, string> = {};
  const skippedFiles: { path: string; reason: string }[] = [];

  for (const [path, content] of Object.entries(filesObj)) {
    // Skip non-file keys
    if (!path.includes('.') && !path.includes('/')) {
      continue;
    }

    // Skip malformed file paths
    if (path.includes('/.') || path.endsWith('/') || !path.match(/\.[a-z]+$/i)) {
      console.warn('[parseMultiFileResponse] Malformed file path:', path);
      skippedFiles.push({ path, reason: 'malformed path' });
      continue;
    }

    // Skip ignored paths
    if (isIgnoredPath(path)) {
      console.log('[parseMultiFileResponse] Skipping ignored path:', path);
      continue;
    }

    // Extract content string
    const contentStr = extractContentString(path, content as unknown, skippedFiles);
    if (!contentStr) continue;

    // Clean the content
    const cleanedContent = cleanGeneratedCode(contentStr, path);

    // Validate cleaned content
    if (!cleanedContent || cleanedContent.length < 10) {
      console.warn('[parseMultiFileResponse] Empty/too short content for:', path);
      skippedFiles.push({ path, reason: `empty content (${cleanedContent.length} chars)` });
      continue;
    }

    // Check for obviously invalid content
    if (/^(tsx|jsx|ts|js|css|json|md|html);?$/i.test(cleanedContent.trim())) {
      console.warn('[parseMultiFileResponse] Invalid content (just extension):', path);
      skippedFiles.push({ path, reason: 'content is just file extension' });
      continue;
    }

    cleaned[path] = cleanedContent;
  }

  // Log results
  if (skippedFiles.length > 0) {
    console.warn('[parseMultiFileResponse] Skipped files:', skippedFiles);
  }
  console.log('[parseMultiFileResponse] Valid files:', Object.keys(cleaned));

  // Return null if no valid files
  if (Object.keys(cleaned).length === 0) {
    return null;
  }

  // Extract generation metadata
  const generationMeta = extractGenerationMeta(parsed, cleaned);

  // Extract deleted files
  const plan = parsed.plan as { delete?: string[] } | undefined;
  const deletedFiles = plan?.delete || (parsed.deletedFiles as string[] | undefined);

  return {
    files: cleaned,
    explanation: typeof explanation === 'string' ? explanation : undefined,
    truncated: wasTruncated,
    deletedFiles,
    fileChanges: parsed.fileChanges as Record<string, string> | undefined,
    generationMeta,
    continuation: parsed.continuation as MultiFileParseResult['continuation'],
  };
}

/**
 * Extract content string from various formats
 */
function extractContentString(
  path: string,
  content: unknown,
  skippedFiles: { path: string; reason: string }[]
): string | null {
  if (typeof content === 'string') {
    return content;
  }

  if (typeof content === 'object' && content !== null) {
    const contentObj = content as Record<string, unknown>;

    if ('content' in contentObj && typeof contentObj.content === 'string') {
      console.log('[parseMultiFileResponse] Extracted content from object for:', path);
      return contentObj.content;
    }

    if ('code' in contentObj && typeof contentObj.code === 'string') {
      console.log('[parseMultiFileResponse] Extracted code from object for:', path);
      return contentObj.code;
    }

    if ('diff' in contentObj && typeof contentObj.diff === 'string') {
      console.log('[parseMultiFileResponse] Extracted diff from object for:', path);
      return contentObj.diff;
    }

    console.warn('[parseMultiFileResponse] Object without content for:', path);
    skippedFiles.push({ path, reason: `object without content (keys: ${Object.keys(content).join(', ')})` });
    return null;
  }

  console.warn('[parseMultiFileResponse] Invalid content type for:', path, typeof content);
  skippedFiles.push({ path, reason: `invalid content type (${typeof content})` });
  return null;
}

/**
 * Extract generation metadata from parsed response
 */
function extractGenerationMeta(
  parsed: Record<string, unknown>,
  cleaned: Record<string, string>
): GenerationMeta | undefined {
  // Format 1: JSON v2 with batch object
  if (parsed.batch) {
    const batch = parsed.batch as Record<string, unknown>;
    const plan = (parsed.plan || {}) as { create?: string[]; update?: string[] };

    const meta: GenerationMeta = {
      totalFilesPlanned: (plan.create?.length || 0) + (plan.update?.length || 0),
      filesInThisBatch: Object.keys(cleaned),
      completedFiles: (batch.completed as string[]) || Object.keys(cleaned),
      remainingFiles: (batch.remaining as string[]) || [],
      currentBatch: (batch.current as number) || 1,
      totalBatches: (batch.total as number) || 1,
      isComplete: (batch.isComplete as boolean) ?? true,
    };

    console.log('[parseMultiFileResponse] JSON v2 batch detected:', {
      batch: `${meta.currentBatch}/${meta.totalBatches}`,
      remaining: meta.remainingFiles.length,
    });

    return meta;
  }

  // Format 2: Legacy generationMeta object
  if (parsed.generationMeta) {
    const gm = parsed.generationMeta as Record<string, unknown>;

    return {
      totalFilesPlanned: (gm.totalFilesPlanned as number) || 0,
      filesInThisBatch: (gm.filesInThisBatch as string[]) || [],
      completedFiles: (gm.completedFiles as string[]) || [],
      remainingFiles: (gm.remainingFiles as string[]) || [],
      currentBatch: (gm.currentBatch as number) || 1,
      totalBatches: (gm.totalBatches as number) || 1,
      isComplete: (gm.isComplete as boolean) ?? true,
    };
  }

  // Format 3: Old continuation format
  if (parsed.continuation) {
    const cont = parsed.continuation as Record<string, unknown>;

    return {
      totalFilesPlanned: ((cont.remainingFiles as string[])?.length || 0) + Object.keys(cleaned).length,
      filesInThisBatch: Object.keys(cleaned),
      completedFiles: Object.keys(cleaned),
      remainingFiles: (cont.remainingFiles as string[]) || [],
      currentBatch: (cont.currentBatch as number) || 1,
      totalBatches: (cont.totalBatches as number) || 1,
      isComplete: !(cont.remainingFiles as string[])?.length,
    };
  }

  return undefined;
}
