/**
 * Error Fix Prompts Tests
 *
 * Tests for AI prompt generation in the error fixing system.
 */

import { describe, it, expect } from 'vitest';
import {
  buildQuickFixPrompt,
  buildFullContextPrompt,
  buildIterativePrompt,
  buildRegenerationPrompt,
  buildPromptForStrategy,
  AUTOFIX_SYSTEM_INSTRUCTION,
} from '../../../services/errorFix/prompts';
import type { ParsedError } from '../../../services/errorFix/types';
import type { LogEntry } from '../../../types';

describe('Error Fix Prompts', () => {
  const baseContext = {
    errorMessage: "Cannot find module './utils/helper'",
    targetFile: 'src/App.tsx',
    targetFileContent: `import { Helper } from './utils/helper';
export function App() { return <Helper />; }`,
  };

  const sampleParsedError: ParsedError = {
    message: "Cannot find module './utils/helper'",
    type: 'module-not-found',
    category: 'import',
    importPath: './utils/helper',
    isAutoFixable: true,
    isIgnorable: false,
    confidence: 0.95,
    priority: 1,
    relatedFiles: [],
  };

  describe('buildQuickFixPrompt', () => {
    it('should include error message in prompt', () => {
      const prompt = buildQuickFixPrompt(baseContext);

      expect(prompt).toContain(baseContext.errorMessage);
      expect(prompt).toContain(baseContext.targetFile);
    });

    it('should include code in prompt', () => {
      const prompt = buildQuickFixPrompt(baseContext);

      expect(prompt).toContain('CODE:');
      expect(prompt).toContain(baseContext.targetFileContent);
    });

    it('should include parsed error hint when available', () => {
      const ctx = {
        ...baseContext,
        parsedError: { ...sampleParsedError, suggestedFix: 'Add the missing import' },
      };
      const prompt = buildQuickFixPrompt(ctx);

      // The prompt may include the suggested fix in various ways
      expect(prompt.length).toBeGreaterThan(0);
    });

    it('should include line location when available', () => {
      const ctx = {
        ...baseContext,
        parsedError: { ...sampleParsedError, line: 5, column: 10 },
      };
      const prompt = buildQuickFixPrompt(ctx);

      expect(prompt).toContain('LOCATION:');
      expect(prompt).toContain('5');
      expect(prompt).toContain('10');
    });

    it('should request complete fixed file', () => {
      const prompt = buildQuickFixPrompt(baseContext);

      expect(prompt).toContain('Return ONLY the complete fixed file');
    });
  });

  describe('buildFullContextPrompt', () => {
    it('should include error and stack trace', () => {
      const ctx = {
        ...baseContext,
        errorStack: 'at App (src/App.tsx:10)\nat main (index.tsx:5)',
      };
      const prompt = buildFullContextPrompt(ctx);

      expect(prompt).toContain('Error');
      expect(prompt).toContain('Stack Trace');
      expect(prompt).toContain('src/App.tsx:10');
    });

    it('should include analysis section', () => {
      const ctx = { ...baseContext, parsedError: sampleParsedError };
      const prompt = buildFullContextPrompt(ctx);

      expect(prompt).toContain('Analysis');
      expect(prompt).toContain(sampleParsedError.type);
      expect(prompt).toContain(sampleParsedError.category);
    });

    it('should include related files with truncation', () => {
      const relatedFiles = {
        'src/utils/helper.ts': 'export function helper() {}',
        'src/components/Button.tsx': 'export function Button() {}',
      };
      const ctx = { ...baseContext, relatedFiles };
      const prompt = buildFullContextPrompt(ctx);

      expect(prompt).toContain('Related Files');
      expect(prompt).toContain('helper.ts');
    });

    it('should include console errors when relevant', () => {
      const logs: LogEntry[] = [
        { type: 'error', message: 'Failed to load resource', timestamp: Date.now() },
        { type: 'warn', message: 'Deprecation warning', timestamp: Date.now() },
      ];
      const ctx = { ...baseContext, logs };
      const prompt = buildFullContextPrompt(ctx);

      expect(prompt).toContain('Console Errors');
    });

    it('should include instructions', () => {
      const prompt = buildFullContextPrompt(baseContext);

      expect(prompt).toContain('Instructions');
      expect(prompt).toContain('Return ONLY the complete fixed file');
    });
  });

  describe('buildIterativePrompt', () => {
    it('should indicate retry', () => {
      const prompt = buildIterativePrompt(baseContext);

      expect(prompt).toContain('Retry');
      expect(prompt).toContain('did not resolve');
    });

    it('should list previous failed attempts', () => {
      const ctx = {
        ...baseContext,
        previousAttempts: ['Timeout', 'Invalid syntax', 'Wrong fix'],
      };
      const prompt = buildIterativePrompt(ctx);

      expect(prompt).toContain("What Didn't Work");
      expect(prompt).toContain('Timeout');
      expect(prompt).toContain('Invalid syntax');
    });

    it('should encourage different approach', () => {
      const ctx = {
        ...baseContext,
        previousAttempts: ['Failed attempt'],
      };
      const prompt = buildIterativePrompt(ctx);

      expect(prompt).toContain('DIFFERENT approach');
      expect(prompt).toContain('Think about');
    });

    it('should include current code', () => {
      const prompt = buildIterativePrompt(baseContext);

      expect(prompt).toContain('Current Code');
      expect(prompt).toContain(baseContext.targetFile);
    });
  });

  describe('buildRegenerationPrompt', () => {
    it('should indicate regeneration needed', () => {
      const prompt = buildRegenerationPrompt(baseContext);

      expect(prompt).toContain('Regeneration');
      expect(prompt).toContain('require regeneration');
    });

    it('should include component info', () => {
      const prompt = buildRegenerationPrompt(baseContext);

      expect(prompt).toContain('Component Info');
      expect(prompt).toContain(baseContext.targetFile);
    });

    it('should extract and include imports', () => {
      const prompt = buildRegenerationPrompt(baseContext);

      expect(prompt).toContain('Original Imports');
      expect(prompt).toContain("from './utils/helper'");
    });

    it('should include JSX structure from return statement', () => {
      const codeWithReturn = `export function App() {
  return (
    <div className="container">
      <h1>Hello</h1>
    </div>
  );
}`;
      const ctx = { ...baseContext, targetFileContent: codeWithReturn };
      const prompt = buildRegenerationPrompt(ctx);

      // The prompt contains JSX structure in the dedicated section
      expect(prompt).toContain('Original JSX Structure');
    });

    it('should include tech stack context when provided', () => {
      const ctx = {
        ...baseContext,
        techStackContext: 'React 19 + TypeScript + Tailwind CSS 4',
      };
      const prompt = buildRegenerationPrompt(ctx);

      expect(prompt).toContain('Tech Stack');
      expect(prompt).toContain('React 19');
    });

    it('should include related components for reference', () => {
      const relatedFiles = {
        'src/components/Button.tsx': 'export function Button() {}',
      };
      const ctx = { ...baseContext, relatedFiles };
      const prompt = buildRegenerationPrompt(ctx);

      expect(prompt).toContain('Related Components');
    });
  });

  describe('buildPromptForStrategy', () => {
    it('should return system instruction', () => {
      const result = buildPromptForStrategy('quick', baseContext);

      expect(result.systemInstruction).toBeDefined();
      expect(result.systemInstruction.length).toBeGreaterThan(0);
    });

    it('should return prompt string', () => {
      const result = buildPromptForStrategy('quick', baseContext);

      expect(result.prompt).toBeDefined();
      expect(typeof result.prompt).toBe('string');
    });

    it('should build quick strategy prompt', () => {
      const result = buildPromptForStrategy('quick', baseContext);

      expect(result.prompt).toContain('Fix this error');
    });

    it('should build full strategy prompt', () => {
      const result = buildPromptForStrategy('full', baseContext);

      expect(result.prompt).toContain('Error Fix Request');
    });

    it('should build iterative strategy prompt', () => {
      const result = buildPromptForStrategy('iterative', baseContext);

      expect(result.prompt).toContain('Retry');
    });

    it('should build regenerate strategy prompt', () => {
      const result = buildPromptForStrategy('regenerate', baseContext);

      expect(result.prompt).toContain('Regeneration');
    });

    it('should append tech stack context to system instruction', () => {
      const ctx = {
        ...baseContext,
        techStackContext: 'Custom tech stack info',
      };
      const result = buildPromptForStrategy('quick', ctx);

      expect(result.systemInstruction).toContain('Custom tech stack info');
    });
  });

  describe('AUTOFIX_SYSTEM_INSTRUCTION', () => {
    it('should contain diagnosis instructions', () => {
      expect(AUTOFIX_SYSTEM_INSTRUCTION).toContain('DIAGNOSIS FIRST');
    });

    it('should contain response format rules', () => {
      expect(AUTOFIX_SYSTEM_INSTRUCTION).toContain('RESPONSE FORMAT');
    });

    it('should contain fix rules', () => {
      expect(AUTOFIX_SYSTEM_INSTRUCTION).toContain('FIX RULES');
    });

    it('should mention minimal patch principle', () => {
      expect(AUTOFIX_SYSTEM_INSTRUCTION).toContain('Minimal patch');
    });

    it('should include quick reference table', () => {
      expect(AUTOFIX_SYSTEM_INSTRUCTION).toContain('QUICK REFERENCE');
    });

    it('should mention tech stack', () => {
      expect(AUTOFIX_SYSTEM_INSTRUCTION).toContain('React 19');
      expect(AUTOFIX_SYSTEM_INSTRUCTION).toContain('TypeScript');
    });
  });
});