/**
 * usePreviewAI Hook
 *
 * Handles AI-powered preview features like accessibility auditing,
 * responsiveness fixes, and error fixes.
 * Delegates to services/prompts/previewPrompts for prompt templates and parsing.
 */

import { useState, useCallback } from 'react';
import { FileSystem, AccessibilityReport } from '../types';
import { cleanGeneratedCode } from '../utils/cleanCode';
import { debugLog } from './useDebugStore';
import { getProviderManager } from '../services/ai';
import { ACCESSIBILITY_AUDIT_SCHEMA } from '../services/ai/utils/schemas';
import {
  ACCESSIBILITY_AUDIT_SYSTEM_INSTRUCTION,
  parseAccessibilityReport,
} from '../services/prompts/previewPrompts';

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

    const requestId = debugLog.request('accessibility', {
      model: currentModel,
      prompt: 'WCAG 2.1 Accessibility Audit',
      systemInstruction: ACCESSIBILITY_AUDIT_SYSTEM_INSTRUCTION,
    });
    const startTime = Date.now();

    try {
      const response = await manager.generate(
        {
          prompt: `Audit this React code for accessibility issues:\n\n${appCode}`,
          systemInstruction: ACCESSIBILITY_AUDIT_SYSTEM_INSTRUCTION,
          responseFormat: 'json',
          responseSchema: ACCESSIBILITY_AUDIT_SCHEMA,
          debugCategory: 'accessibility',
        },
        currentModel
      );

      const report = parseAccessibilityReport(response.text || '{}');
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
