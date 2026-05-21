/**
 * usePreviewAI Hook
 *
 * Handles AI-powered preview features like accessibility auditing,
 * responsiveness fixes, and error fixes.
 * Extracted from PreviewPanel to reduce complexity.
 */

import { useState, useCallback } from 'react';
import { FileSystem, AccessibilityReport } from '../types';
import { cleanGeneratedCode } from '../utils/cleanCode';
import { debugLog } from './useDebugStore';
import { getProviderManager } from '../services/ai';
import { ACCESSIBILITY_AUDIT_SCHEMA } from '../services/ai/utils/schemas';

// Type for raw accessibility issue from AI JSON response
interface RawAccessibilityIssue {
  type?: string;
  message?: string;
}

export interface UsePreviewAIOptions {
  files: FileSystem;
  appCode: string | undefined;
  selectedModel: string;
  setFiles: (files: FileSystem) => void;
  reviewChange: (label: string, newFiles: FileSystem) => void;
}

export interface UsePreviewAIReturn {
  // Accessibility
  accessibilityReport: AccessibilityReport | null;
  isAuditing: boolean;
  isFixingAccessibility: boolean;
  showAccessReport: boolean;
  setShowAccessReport: (show: boolean) => void;
  runAccessibilityAudit: () => Promise<void>;
  fixAccessibilityIssues: () => Promise<void>;

  // Responsiveness
  isFixingResponsiveness: boolean;
  fixResponsiveness: () => Promise<void>;

  // Database
  isGeneratingDB: boolean;
  generateDatabaseSchema: () => Promise<void>;
}

export function usePreviewAI(options: UsePreviewAIOptions): UsePreviewAIReturn {
  const { files, appCode, selectedModel, setFiles, reviewChange } = options;

  // Accessibility state
  const [accessibilityReport, setAccessibilityReport] = useState<AccessibilityReport | null>(null);
  const [isAuditing, setIsAuditing] = useState(false);
  const [isFixingAccessibility, setIsFixingAccessibility] = useState(false);
  const [showAccessReport, setShowAccessReport] = useState(false);

  // Responsiveness state
  const [isFixingResponsiveness, setIsFixingResponsiveness] = useState(false);

  // Database state
  const [isGeneratingDB, setIsGeneratingDB] = useState(false);

  /**
   * Run accessibility audit on the current app code
   */
  const runAccessibilityAudit = useCallback(async () => {
    if (!appCode) return;
    setIsAuditing(true);
    setShowAccessReport(true);

    const manager = getProviderManager();
    const activeConfig = manager.getActiveConfig();
    const currentModel = activeConfig?.defaultModel || selectedModel;

    const systemInstruction = `You are a WCAG 2.1 AA Accessibility Auditor. Analyze the provided React code statically and report concrete issues a developer can fix.

## Output format (STRICT — parsed with JSON.parse)
{
  "score": <number 0-100>,
  "issues": [
    { "type": "error" | "warning", "message": "<concrete issue + WHERE it appears>" }
  ]
}

Return ONLY this JSON object. No markdown fence, no prose, no trailing commas.

## Scoring rubric
- 100: No issues detected
- 80-99: Minor issues only (warnings)
- 50-79: Moderate issues (a few errors)
- 0-49: Critical accessibility problems

## Severity: "error" vs "warning"
- "error" — keyboard or screen-reader users will be BLOCKED (missing aria-label on icon-only button, unlabeled form field, onClick on a <div> with no role/tabIndex, missing alt on a content image).
- "warning" — degrades experience but not blocking (low contrast on decorative text, missing focus-visible style on a button, heading-level skip from h1→h3).

## WCAG 2.1 checks to perform
1. **Images** — every <img> has descriptive alt; decorative images use alt="".
2. **Form controls** — every <input>/<select>/<textarea> paired with <label htmlFor> or wrapped in <label>; placeholder is NOT a label.
3. **Icon-only buttons** — <button> with only an icon child has aria-label.
4. **Semantic landmarks** — page uses <header>, <nav>, <main>, <footer>; not just <div>s.
5. **Headings** — exactly one <h1>; no skipped levels (h1→h3 without h2).
6. **Color-only signaling** — status/state never conveyed by color alone.
7. **Focus styles** — interactive elements have focus-visible utilities (focus:ring-*, focus:outline-*); hover-only is not enough.
8. **Keyboard reachability** — onClick handlers on non-button elements (<div>, <span>) WITHOUT role + tabIndex + onKeyDown.
9. **ARIA correctness** — aria-* attributes are valid and used correctly; no aria-label on hidden elements.
10. **Modal/dialog** — dialogs have role="dialog" + aria-modal="true" + an accessible name (aria-label or aria-labelledby).
11. **Lang attribute** — <html lang="…"> set when generating index.html.
12. **Touch targets** — primary tappable areas ≥ 44×44px on mobile.

Each issue's "message" must name WHERE it occurs (component name or selector) and WHAT to do, e.g. "Header.tsx menu button has only a <Menu /> icon and no aria-label — add aria-label=\\"Open menu\\".".`;

    const requestId = debugLog.request('accessibility', {
      model: currentModel,
      prompt: 'WCAG 2.1 Accessibility Audit',
      systemInstruction,
    });
    const startTime = Date.now();

    try {
      const response = await manager.generate(
        {
          prompt: `Audit this React code for accessibility issues:\n\n${appCode}`,
          systemInstruction,
          responseFormat: 'json',
          responseSchema: ACCESSIBILITY_AUDIT_SCHEMA,
          debugCategory: 'accessibility',
        },
        currentModel
      );

      let report: AccessibilityReport;
      try {
        const parsed = JSON.parse(response.text || '{}');
        // Normalize the response to match our expected format
        report = {
          score: typeof parsed.score === 'number' ? parsed.score : 0,
          issues: Array.isArray(parsed.issues)
            ? parsed.issues.map((issue: RawAccessibilityIssue | string) => ({
                type:
                  typeof issue === 'object' && (issue.type === 'error' || issue.type === 'warning')
                    ? issue.type
                    : 'warning',
                message:
                  typeof issue === 'object' && typeof issue.message === 'string'
                    ? issue.message
                    : typeof issue === 'string'
                      ? issue
                      : JSON.stringify(issue),
              }))
            : [],
        };
      } catch {
        report = { score: 0, issues: [{ type: 'error', message: 'Failed to parse audit response.' }] };
      }

      setAccessibilityReport(report);

      debugLog.response('accessibility', {
        id: requestId,
        model: currentModel,
        duration: Date.now() - startTime,
        response: JSON.stringify(report),
        metadata: { score: report.score, issueCount: report.issues?.length },
      });
    } catch (e) {
      setAccessibilityReport({
        score: 0,
        issues: [
          {
            type: 'error',
            message: 'Failed to run audit: ' + (e instanceof Error ? e.message : 'Unknown error'),
          },
        ],
      });
      debugLog.error('accessibility', e instanceof Error ? e.message : 'Audit failed', {
        id: requestId,
        duration: Date.now() - startTime,
      });
    } finally {
      setIsAuditing(false);
    }
  }, [appCode, selectedModel]);

  /**
   * Fix accessibility issues using AI
   */
  const fixAccessibilityIssues = useCallback(async () => {
    if (!appCode || !accessibilityReport) return;
    setIsFixingAccessibility(true);
    try {
      const manager = getProviderManager();
      const activeConfig = manager.getActiveConfig();
      const currentModel = activeConfig?.defaultModel || selectedModel;

      const response = await manager.generate(
        {
          prompt: `Fix the following accessibility issues in this React code.

Issues to fix:
${accessibilityReport.issues.map((issue, i) => `${i + 1}. [${issue.type.toUpperCase()}] ${issue.message}`).join('\n')}

Original Code:
${appCode}`,
          systemInstruction:
            'You are a WCAG 2.1 AA accessibility expert. Apply the smallest correct fix for EACH listed issue: add aria-label to icon-only buttons, pair every form field with a <label htmlFor>, ensure focus-visible rings, semantic landmarks (<header>/<nav>/<main>/<footer>), and 4.5:1 body contrast. Preserve every data-ff-* attribute and the existing component shape. Return ONLY the complete fixed file content — no markdown fence, no explanation, no leading whitespace.',
        },
        currentModel
      );

      const fixedCode = cleanGeneratedCode(response.text || '');
      reviewChange('Fixed Accessibility Issues', { ...files, 'src/App.tsx': fixedCode });
      setAccessibilityReport({ score: 100, issues: [] });
      setTimeout(() => setShowAccessReport(false), 2000);
    } catch (e) {
      console.error('[usePreviewAI] Accessibility fix failed:', e);
    } finally {
      setIsFixingAccessibility(false);
    }
  }, [appCode, accessibilityReport, files, selectedModel, reviewChange]);

  /**
   * Fix responsiveness issues using AI
   */
  const fixResponsiveness = useCallback(async () => {
    if (!appCode) return;
    setIsFixingResponsiveness(true);
    try {
      const manager = getProviderManager();
      const activeConfig = manager.getActiveConfig();
      const currentModel = activeConfig?.defaultModel || selectedModel;

      const response = await manager.generate(
        {
          prompt: `Optimize this React component for mobile devices.\n\nCode: ${appCode}\n\nOutput ONLY the full updated code.`,
          systemInstruction:
            'You are a senior React/TypeScript engineer. Make this component responsive using Tailwind mobile-first prefixes (sm: 640, md: 768, lg: 1024). Stack columns on mobile, collapse navigation to a hamburger or top-sheet, switch hover-only affordances to touch-friendly equivalents, and keep touch targets ≥ 44px. FORBIDDEN: negative absolute positioning like bottom-[-20%]. Preserve every data-ff-* attribute and the existing imports. Return ONLY valid React/TypeScript code — no markdown fence, no explanation.',
        },
        currentModel
      );
      const fixedCode = cleanGeneratedCode(response.text || '');
      reviewChange('Fixed Responsiveness', { ...files, 'src/App.tsx': fixedCode });
    } catch (e) {
      console.error('[usePreviewAI] Responsiveness fix failed:', e);
    } finally {
      setIsFixingResponsiveness(false);
    }
  }, [appCode, files, selectedModel, reviewChange]);

  /**
   * Generate database schema from app code
   */
  const generateDatabaseSchema = useCallback(async () => {
    if (!appCode) return;
    setIsGeneratingDB(true);
    try {
      const manager = getProviderManager();
      const activeConfig = manager.getActiveConfig();
      const currentModel = activeConfig?.defaultModel || selectedModel;

      const response = await manager.generate(
        {
          prompt: `Based on this React App, generate a SQL schema for SQLite.\nCode: ${appCode}\nOutput ONLY SQL.`,
          systemInstruction:
            'You are a database expert. Infer entities and relations from the React component (forms, lists, mock data) and emit a SQLite schema: CREATE TABLE statements with INTEGER PRIMARY KEY AUTOINCREMENT for ids, TEXT/INTEGER/REAL/BOOLEAN columns, NOT NULL where appropriate, FOREIGN KEY REFERENCES for relations, and CREATE INDEX on foreign keys and frequently queried columns. Use snake_case for table and column names. Return ONLY valid SQL — no markdown fence, no explanation, no comments unless they document a non-obvious choice.',
        },
        currentModel
      );
      const sql = cleanGeneratedCode(response.text || '');
      setFiles({ ...files, 'db/schema.sql': sql });
    } catch (e) {
      console.error('[usePreviewAI] Database schema generation failed:', e);
    } finally {
      setIsGeneratingDB(false);
    }
  }, [appCode, files, selectedModel, setFiles]);

  return {
    // Accessibility
    accessibilityReport,
    isAuditing,
    isFixingAccessibility,
    showAccessReport,
    setShowAccessReport,
    runAccessibilityAudit,
    fixAccessibilityIssues,

    // Responsiveness
    isFixingResponsiveness,
    fixResponsiveness,

    // Database
    isGeneratingDB,
    generateDatabaseSchema,
  };
}
