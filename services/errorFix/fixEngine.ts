/**
 * Fix Engine
 *
 * Multi-strategy error fixing pipeline.
 * Uses local fixes first, then AI as fallback.
 */

import { FileSystem } from '../../types';
import { FixResult, FixStrategy, FixEngineOptions, ErrorCategory } from './types';
import { errorAnalyzer } from './analyzer';
import { tryLocalFix, tryFixBareSpecifierMultiFile } from './localFixes';
import { isCodeValid } from './validation';
import { fixState } from './state';
import { fixAnalytics } from './analytics';
import { autoFixLogger } from './debugLogger';
import { buildPromptForStrategy } from './prompts';
import { cleanGeneratedCode, isValidCode } from '../../utils/cleanCode';
import { getRelatedFiles } from '../../utils/errorContext';
import { getProviderManager } from '../ai';

// ============================================================================
// Configuration
// ============================================================================

const CONFIG = {
  LOCAL_FIX_TIMEOUT: 2000,
  AI_QUICK_TIMEOUT: 15000,
  AI_FULL_TIMEOUT: 30000,
  AI_ITERATIVE_TIMEOUT: 60000,
  TOTAL_TIMEOUT: 90000,
  MAX_AI_ATTEMPTS: 3,
  MAX_ITERATIVE_ROUNDS: 3,
};

const STRATEGY_ORDER: FixStrategy[] = [
  'local-simple',
  'local-multifile',
  'local-proactive',
  'ai-quick',
  'ai-full',
  'ai-iterative',
  'ai-regenerate',
];

// ============================================================================
// Fix Engine Class
// ============================================================================

export class FixEngine {
  private options: Required<FixEngineOptions>;
  private startTime = 0;
  private attempts = 0;
  private currentStrategy: FixStrategy = 'local-simple';
  private abortController: AbortController | null = null;

  constructor(options: FixEngineOptions) {
    this.options = {
      files: options.files,
      errorMessage: options.errorMessage,
      errorStack: options.errorStack || '',
      targetFile: options.targetFile || this.detectTargetFile(options.errorMessage, options.files),
      appCode: options.appCode || options.files['src/App.tsx'] || '',
      logs: options.logs || [],
      systemInstruction: options.systemInstruction || '',
      onProgress: options.onProgress || (() => {}),
      onStrategyChange: options.onStrategyChange || (() => {}),
      maxAttempts: options.maxAttempts || 10,
      timeout: options.timeout || CONFIG.TOTAL_TIMEOUT,
      skipStrategies: options.skipStrategies || [],
    };
  }

  /**
   * Run the fix pipeline
   */
  async fix(): Promise<FixResult> {
    this.startTime = Date.now();
    this.abortController = new AbortController();

    // Start logging session
    autoFixLogger.startSession(this.options.errorMessage, this.options.targetFile);

    // Check if we should skip this error
    const skipCheck = fixState.shouldSkip(this.options.errorMessage);
    if (skipCheck.skip) {
      autoFixLogger.log('info', 'analyze', 'Skipping Error', {
        message: skipCheck.reason || 'Previously failed',
      });
      return this.noFix(`Skipped: ${skipCheck.reason}`);
    }

    // Analyze error
    const parsed = errorAnalyzer.analyze(
      this.options.errorMessage,
      this.options.errorStack,
      this.options.files
    );

    // Log analysis results
    autoFixLogger.logAnalysis({
      type: parsed.type,
      category: parsed.category,
      confidence: parsed.confidence,
      isAutoFixable: parsed.isAutoFixable,
      suggestedFix: parsed.suggestedFix,
    });

    if (parsed.isIgnorable) {
      autoFixLogger.log('info', 'analyze', 'Ignorable Error', {
        message: 'This error type is transient/ignorable',
      });
      return this.noFix('Ignorable error');
    }

    const category = parsed.category;
    const strategies = this.selectStrategies(category);

    autoFixLogger.log('info', 'strategy', 'Strategy Plan', {
      message: `Will try: ${strategies.join(' → ')}`,
      details: { strategies, category },
    });

    // Try each strategy
    for (const strategy of strategies) {
      if (this.isTimedOut()) {
        autoFixLogger.log('warn', 'timing', 'Timeout', {
          message: `Exceeded ${this.options.timeout}ms timeout`,
        });
        break;
      }
      if (this.options.skipStrategies.includes(strategy)) continue;

      this.currentStrategy = strategy;
      this.options.onStrategyChange(strategy);
      this.options.onProgress(this.getLabel(strategy), this.getProgress());

      autoFixLogger.logStrategy(strategy, 'start', `Attempting ${this.getLabel(strategy)}`);

      try {
        const result = await this.runStrategy(strategy, parsed);

        if (result.success && Object.keys(result.fixedFiles).length > 0) {
          const timeMs = Date.now() - this.startTime;

          // Record success
          fixState.recordAttempt(this.options.errorMessage, strategy, true);
          fixAnalytics.record(this.options.errorMessage, category, strategy, true, timeMs);

          autoFixLogger.logStrategy(strategy, 'success', result.description);
          autoFixLogger.logApply(Object.keys(result.fixedFiles), result.description);
          autoFixLogger.endSession(true, `Fixed with ${strategy} in ${(timeMs / 1000).toFixed(2)}s`);

          return {
            ...result,
            strategy,
            attempts: this.attempts,
            timeMs,
          };
        } else {
          autoFixLogger.logStrategy(strategy, 'fail', result.error || 'No fix found');
        }
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        autoFixLogger.log('error', 'strategy', `${strategy} Exception`, {
          message: errorMsg,
        });
      }
    }

    // All strategies failed
    const timeMs = Date.now() - this.startTime;
    fixState.recordAttempt(this.options.errorMessage, null, false);
    fixAnalytics.record(this.options.errorMessage, category, 'local-simple', false, timeMs);

    autoFixLogger.endSession(false, `All ${strategies.length} strategies exhausted`);

    return this.noFix('All strategies exhausted');
  }

  /**
   * Abort the fix operation
   */
  abort(): void {
    this.abortController?.abort();
  }

  // ============================================================================
  // Strategy Selection
  // ============================================================================

  private selectStrategies(category: ErrorCategory): FixStrategy[] {
    const strategies: FixStrategy[] = ['local-simple'];

    if (category === 'import') {
      strategies.push('local-multifile');
    }

    strategies.push('local-proactive');

    if (category !== 'transient' && category !== 'network') {
      strategies.push('ai-quick', 'ai-full', 'ai-iterative', 'ai-regenerate');
    }

    return strategies;
  }

  // ============================================================================
  // Strategy Runners
  // ============================================================================

  private async runStrategy(strategy: FixStrategy, parsed?: import('./types').ParsedError): Promise<FixResult> {
    this.attempts++;

    switch (strategy) {
      case 'local-simple':
        return this.runLocalSimple();
      case 'local-multifile':
        return this.runLocalMultifile();
      case 'local-proactive':
        return this.runLocalProactive();
      case 'ai-quick':
        return this.runAIQuick(parsed);
      case 'ai-full':
        return this.runAIFull(parsed);
      case 'ai-iterative':
        return this.runAIIterative(parsed);
      case 'ai-regenerate':
        return this.runAIRegenerate(parsed);
      default:
        return this.noFix('Unknown strategy');
    }
  }

  private async runLocalSimple(): Promise<FixResult> {
    this.options.onProgress('Trying local fix...', 10);

    const code = this.options.files[this.options.targetFile] || this.options.appCode;
    if (!code) {
      autoFixLogger.logLocalFix('simple', false, 'No code found for target file');
      return this.noFix('No code found');
    }

    const result = tryLocalFix(this.options.errorMessage, code, this.options.files);

    if (result.success && result.fixedFiles['current']) {
      const fixedCode = result.fixedFiles['current'];
      if (isCodeValid(fixedCode)) {
        autoFixLogger.logLocalFix(result.fixType, true, result.description);
        autoFixLogger.logValidation('syntax', true, 'Fixed code passes syntax check');
        return this.success(
          { [this.options.targetFile]: fixedCode },
          result.description,
          'local-simple'
        );
      } else {
        autoFixLogger.logLocalFix(result.fixType, false, 'Fix generated invalid code');
        autoFixLogger.logValidation('syntax', false, 'Fixed code has syntax errors');
      }
    } else {
      autoFixLogger.logLocalFix('simple', false, 'No matching pattern found');
    }

    return this.noFix('Local fix failed');
  }

  private async runLocalMultifile(): Promise<FixResult> {
    this.options.onProgress('Scanning files...', 15);

    const result = tryFixBareSpecifierMultiFile(this.options.errorMessage, this.options.files);

    if (result.success && Object.keys(result.fixedFiles).length > 0) {
      // Validate all files
      for (const code of Object.values(result.fixedFiles)) {
        if (!isCodeValid(code)) {
          return this.noFix('Invalid fix generated');
        }
      }
      return this.success(result.fixedFiles, result.description, 'local-multifile');
    }

    return this.noFix('Multi-file fix failed');
  }

  private async runLocalProactive(): Promise<FixResult> {
    this.options.onProgress('Analyzing code...', 20);
    // Proactive analysis is now done inline with local fixes
    return this.noFix('No proactive fixes found');
  }

  private async runAIQuick(parsed?: import('./types').ParsedError): Promise<FixResult> {
    this.options.onProgress('Quick AI fix...', 30);

    const code = this.options.files[this.options.targetFile] || this.options.appCode;
    if (!code) return this.noFix('No code found');

    const manager = getProviderManager();
    const config = manager.getActiveConfig();
    if (!config) return this.noFix('No AI provider');

    // Build prompt using new system
    const { systemInstruction, prompt } = buildPromptForStrategy('quick', {
      errorMessage: this.options.errorMessage,
      errorStack: this.options.errorStack,
      targetFile: this.options.targetFile,
      targetFileContent: code,
      parsedError: parsed,
      techStackContext: this.options.systemInstruction,
    });

    // Log AI request
    const requestId = autoFixLogger.logAIRequest({
      strategy: 'ai-quick',
      prompt,
      systemInstruction,
      model: config.defaultModel,
      targetFile: this.options.targetFile,
      errorMessage: this.options.errorMessage,
    });

    const startTime = Date.now();

    try {
      const response = await Promise.race([
        manager.generate({
          prompt,
          systemInstruction,
          responseFormat: 'text'
        }, config.defaultModel),
        this.createTimeout(CONFIG.AI_QUICK_TIMEOUT),
      ]);

      const duration = Date.now() - startTime;

      if (!response || typeof response === 'symbol') {
        autoFixLogger.logAIResponse(requestId, false, 'Request timed out', duration);
        return this.noFix('AI timeout');
      }

      autoFixLogger.logAIResponse(requestId, true, response.text || '', duration);

      const fixedCode = cleanGeneratedCode(response.text || '');

      if (fixedCode && isValidCode(fixedCode) && fixedCode !== code) {
        autoFixLogger.logValidation('syntax', true, 'AI response is valid code');
        return this.success(
          { [this.options.targetFile]: fixedCode },
          'Quick AI fix',
          'ai-quick'
        );
      } else {
        autoFixLogger.logValidation('syntax', false, fixedCode ? 'Code unchanged or invalid' : 'Empty response');
      }
    } catch (e) {
      const duration = Date.now() - startTime;
      autoFixLogger.logAIResponse(requestId, false, String(e), duration);
      return this.noFix(String(e));
    }

    return this.noFix('AI fix invalid');
  }

  private async runAIFull(parsed?: import('./types').ParsedError): Promise<FixResult> {
    this.options.onProgress('Full AI analysis...', 50);

    const code = this.options.files[this.options.targetFile] || this.options.appCode;
    if (!code) return this.noFix('No code found');

    const manager = getProviderManager();
    const config = manager.getActiveConfig();
    if (!config) return this.noFix('No AI provider');

    // Get related files for context
    const relatedFiles = getRelatedFiles(this.options.errorMessage, code, this.options.files);
    const contextFiles = Object.keys(relatedFiles);

    // Build prompt using new system
    const { systemInstruction, prompt } = buildPromptForStrategy('full', {
      errorMessage: this.options.errorMessage,
      errorStack: this.options.errorStack,
      targetFile: this.options.targetFile,
      targetFileContent: code,
      parsedError: parsed,
      relatedFiles,
      logs: this.options.logs,
      techStackContext: this.options.systemInstruction,
    });

    // Log AI request
    const requestId = autoFixLogger.logAIRequest({
      strategy: 'ai-full',
      prompt,
      systemInstruction,
      model: config.defaultModel,
      targetFile: this.options.targetFile,
      errorMessage: this.options.errorMessage,
      contextFiles,
    });

    const startTime = Date.now();

    try {
      const response = await Promise.race([
        manager.generate({
          prompt,
          systemInstruction,
          responseFormat: 'text'
        }, config.defaultModel),
        this.createTimeout(CONFIG.AI_FULL_TIMEOUT),
      ]);

      const duration = Date.now() - startTime;

      if (!response || typeof response === 'symbol') {
        autoFixLogger.logAIResponse(requestId, false, 'Request timed out', duration);
        return this.noFix('AI timeout');
      }

      autoFixLogger.logAIResponse(requestId, true, response.text || '', duration);

      const fixedCode = cleanGeneratedCode(response.text || '');

      if (fixedCode && isValidCode(fixedCode) && fixedCode !== code) {
        autoFixLogger.logValidation('syntax', true, 'AI response is valid code');
        return this.success(
          { [this.options.targetFile]: fixedCode },
          'AI fix with full context',
          'ai-full'
        );
      } else {
        autoFixLogger.logValidation('syntax', false, fixedCode ? 'Code unchanged or invalid' : 'Empty response');
      }
    } catch (e) {
      const duration = Date.now() - startTime;
      autoFixLogger.logAIResponse(requestId, false, String(e), duration);
      return this.noFix(String(e));
    }

    return this.noFix('AI fix invalid');
  }

  private async runAIIterative(parsed?: import('./types').ParsedError): Promise<FixResult> {
    this.options.onProgress('Iterative AI...', 70);

    const code = this.options.files[this.options.targetFile] || this.options.appCode;
    if (!code) return this.noFix('No code found');

    const manager = getProviderManager();
    const config = manager.getActiveConfig();
    if (!config) return this.noFix('No AI provider');

    const previousAttempts: string[] = [];

    for (let round = 0; round < CONFIG.MAX_ITERATIVE_ROUNDS; round++) {
      if (this.isTimedOut()) break;

      this.options.onProgress(`AI attempt ${round + 1}/${CONFIG.MAX_ITERATIVE_ROUNDS}...`, 70 + round * 10);

      autoFixLogger.log('info', 'strategy', `Iterative Round ${round + 1}`, {
        message: previousAttempts.length > 0 ? `Previous issues: ${previousAttempts.join(', ')}` : 'First attempt',
        details: { round: round + 1, previousAttempts },
      });

      // Build prompt with feedback
      const { systemInstruction, prompt } = buildPromptForStrategy('iterative', {
        errorMessage: this.options.errorMessage,
        errorStack: this.options.errorStack,
        targetFile: this.options.targetFile,
        targetFileContent: code,
        parsedError: parsed,
        previousAttempts,
        techStackContext: this.options.systemInstruction,
      });

      const requestId = autoFixLogger.logAIRequest({
        strategy: `ai-iterative-${round + 1}`,
        prompt,
        systemInstruction,
        model: config.defaultModel,
        targetFile: this.options.targetFile,
        errorMessage: this.options.errorMessage,
      });

      const startTime = Date.now();

      try {
        const response = await Promise.race([
          manager.generate({
            prompt,
            systemInstruction,
            responseFormat: 'text'
          }, config.defaultModel),
          this.createTimeout(CONFIG.AI_FULL_TIMEOUT),
        ]);

        const duration = Date.now() - startTime;

        if (!response || typeof response === 'symbol') {
          autoFixLogger.logAIResponse(requestId, false, 'Request timed out', duration);
          previousAttempts.push('Timeout');
          continue;
        }

        autoFixLogger.logAIResponse(requestId, true, response.text || '', duration);

        const fixedCode = cleanGeneratedCode(response.text || '');

        if (!fixedCode) {
          previousAttempts.push('Empty response');
          continue;
        }

        if (!isValidCode(fixedCode)) {
          autoFixLogger.logValidation('syntax', false, 'Generated code has syntax errors');
          previousAttempts.push('Invalid syntax');
          continue;
        }

        if (fixedCode === code) {
          previousAttempts.push('No changes made');
          continue;
        }

        autoFixLogger.logValidation('syntax', true, 'Valid code after iteration');
        return this.success(
          { [this.options.targetFile]: fixedCode },
          `Fixed after ${round + 1} iterations`,
          'ai-iterative'
        );
      } catch (e) {
        const duration = Date.now() - startTime;
        autoFixLogger.logAIResponse(requestId, false, String(e), duration);
        previousAttempts.push(String(e));
      }
    }

    return this.noFix(`Failed after ${CONFIG.MAX_ITERATIVE_ROUNDS} rounds`);
  }

  private async runAIRegenerate(parsed?: import('./types').ParsedError): Promise<FixResult> {
    this.options.onProgress('Regenerating...', 90);

    const code = this.options.files[this.options.targetFile] || this.options.appCode;
    if (!code) return this.noFix('No code found');

    const manager = getProviderManager();
    const config = manager.getActiveConfig();
    if (!config) return this.noFix('No AI provider');

    const componentName = this.extractComponentName(code);
    const relatedFiles = getRelatedFiles(this.options.errorMessage, code, this.options.files);
    const contextFiles = Object.keys(relatedFiles);

    autoFixLogger.log('info', 'strategy', 'Regeneration Mode', {
      message: `Regenerating ${componentName || 'component'} from scratch`,
      details: { componentName, contextFiles },
    });

    // Build prompt using new system
    const { systemInstruction, prompt } = buildPromptForStrategy('regenerate', {
      errorMessage: this.options.errorMessage,
      errorStack: this.options.errorStack,
      targetFile: this.options.targetFile,
      targetFileContent: code,
      parsedError: parsed,
      relatedFiles,
      techStackContext: this.options.systemInstruction,
    });

    // Log AI request
    const requestId = autoFixLogger.logAIRequest({
      strategy: 'ai-regenerate',
      prompt,
      systemInstruction,
      model: config.defaultModel,
      targetFile: this.options.targetFile,
      errorMessage: this.options.errorMessage,
      contextFiles,
    });

    const startTime = Date.now();

    try {
      const response = await Promise.race([
        manager.generate({
          prompt,
          systemInstruction,
          responseFormat: 'text'
        }, config.defaultModel),
        this.createTimeout(CONFIG.AI_ITERATIVE_TIMEOUT),
      ]);

      const duration = Date.now() - startTime;

      if (!response || typeof response === 'symbol') {
        autoFixLogger.logAIResponse(requestId, false, 'Request timed out', duration);
        return this.noFix('AI timeout');
      }

      autoFixLogger.logAIResponse(requestId, true, response.text || '', duration);

      const fixedCode = cleanGeneratedCode(response.text || '');

      if (fixedCode && isValidCode(fixedCode)) {
        autoFixLogger.logValidation('syntax', true, 'Regenerated code is valid');
        return this.success(
          { [this.options.targetFile]: fixedCode },
          `Regenerated ${componentName || 'component'}`,
          'ai-regenerate'
        );
      } else {
        autoFixLogger.logValidation('syntax', false, fixedCode ? 'Invalid regenerated code' : 'Empty response');
      }
    } catch (e) {
      const duration = Date.now() - startTime;
      autoFixLogger.logAIResponse(requestId, false, String(e), duration);
      return this.noFix(String(e));
    }

    return this.noFix('Regeneration failed');
  }

  // ============================================================================
  // Utilities
  // ============================================================================

  private detectTargetFile(error: string, files: FileSystem): string {
    // Try to extract file from error
    const match = error.match(/(?:at\s+)?([^:\s]+\.tsx?):?\d*/);
    if (match?.[1] && files[match[1] as string]) return match[1];

    // Check bare specifier
    const bare = error.match(/["']?(src\/[\w./-]+)["']?/i);
    if (bare?.[1]) {
      const bareStr = bare[1] as string;
      for (const [path, content] of Object.entries(files)) {
        if (content?.includes(bareStr)) return path;
      }
    }

    return 'src/App.tsx';
  }

  private extractComponentName(code: string): string | null {
    const match = code.match(/export\s+(?:default\s+)?(?:function|const)\s+(\w+)/);
    return match?.[1] ?? null;
  }

  private getLabel(strategy: FixStrategy): string {
    const labels: Record<FixStrategy, string> = {
      'local-simple': 'Quick fix',
      'local-multifile': 'Multi-file fix',
      'local-proactive': 'Code analysis',
      'ai-quick': 'Quick AI',
      'ai-full': 'AI analysis',
      'ai-iterative': 'Deep AI',
      'ai-regenerate': 'Regenerating',
    };
    return labels[strategy] || strategy;
  }

  private getProgress(): number {
    const index = STRATEGY_ORDER.indexOf(this.currentStrategy);
    return Math.round((index / STRATEGY_ORDER.length) * 100);
  }

  private isTimedOut(): boolean {
    return Date.now() - this.startTime > this.options.timeout;
  }

  private createTimeout(ms: number): Promise<symbol> {
    return new Promise(resolve => setTimeout(() => resolve(Symbol('timeout')), ms));
  }

  private success(files: Record<string, string>, desc: string, strategy: FixStrategy): FixResult {
    return {
      success: true,
      fixedFiles: files,
      description: desc,
      strategy,
      attempts: this.attempts,
      timeMs: Date.now() - this.startTime,
    };
  }

  private noFix(error?: string): FixResult {
    return {
      success: false,
      fixedFiles: {},
      description: error || 'No fix found',
      strategy: this.currentStrategy,
      attempts: this.attempts,
      timeMs: Date.now() - this.startTime,
      error,
    };
  }
}

// ============================================================================
// Convenience Functions
// ============================================================================

export async function quickFix(
  errorMessage: string,
  files: FileSystem,
  options?: Partial<FixEngineOptions>
): Promise<Record<string, string> | null> {
  const engine = new FixEngine({ errorMessage, files, ...options });
  const result = await engine.fix();
  return result.success ? result.fixedFiles : null;
}

export async function fixWithProgress(
  errorMessage: string,
  files: FileSystem,
  onProgress: (stage: string, progress: number) => void,
  options?: Partial<FixEngineOptions>
): Promise<FixResult> {
  const engine = new FixEngine({ errorMessage, files, onProgress, ...options });
  return engine.fix();
}

// Legacy export for backward compatibility
export { FixEngine as ErrorFixEngine };
