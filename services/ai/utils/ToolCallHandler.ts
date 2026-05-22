/**
 * Tool Call Handler - Unified Tool Calling Utility
 *
 * Provides consistent tool call accumulation and execution for streaming responses.
 * Used by all OpenAI-compatible providers (ZAI, OpenAI, Cerebras, MiniMax, etc.)
 */

import type { ToolExecutor } from '../types';
import { parseToolArguments, formatToolError } from './toolUtils';

// ============================================================================
// Type Definitions
// ============================================================================

export interface AccumulatedToolCall {
  id: string;
  name: string;
  arguments: string;
  argumentsParsed?: Record<string, unknown>;
}

export interface ToolExecutionResult {
  messages: ChatMessage[];
  filesWritten: string[];
  toolCallsExecuted: number;
  errors: Array<{ toolName: string; error: string }>;
}

export interface ToolCallAccumulator {
  toolCalls: AccumulatedToolCall[];
  finishReason: string | undefined;
  hasAllContent: boolean;
}

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_call_id?: string;
  name?: string;
  tool_calls?: unknown[];
}

interface StreamChunk {
  choices?: Array<{
    delta?: {
      content?: string;
      tool_calls?: Array<{
        id?: string;
        function?: { name?: string; arguments?: string };
        name?: string;
        arguments?: string;
      }>;
    };
    finish_reason?: string;
  }>;
}

// ============================================================================
// ToolCallHandler Class
// ============================================================================

export class ToolCallHandler {
  private accumulatedToolCalls: Map<string, AccumulatedToolCall> = new Map();
  private finishReason: string | undefined;
  private debugEnabled: boolean;

  constructor(debugEnabled = true) {
    this.debugEnabled = debugEnabled;
  }

  /**
   * Process a streaming chunk and accumulate tool calls.
   * Handles partial JSON arguments by merging chunks.
   */
  accumulate(chunk: StreamChunk): ToolCallAccumulator {
    const delta = chunk.choices?.[0]?.delta;
    const chunkFinishReason = chunk.choices?.[0]?.finish_reason;

    if (chunkFinishReason) {
      this.finishReason = chunkFinishReason;
    }

    // Process tool calls from delta
    if (delta?.tool_calls && Array.isArray(delta.tool_calls)) {
      for (const tc of delta.tool_calls) {
        const id = tc.id || '';
        const name = tc.function?.name || tc.name || '';

        if (!id) continue;

        const existing = this.accumulatedToolCalls.get(id);
        const argumentsDelta = tc.function?.arguments || tc.arguments || '';

        if (existing) {
          // Merge partial arguments (streaming JSON)
          existing.arguments += argumentsDelta;
        } else {
          // New tool call
          this.accumulatedToolCalls.set(id, {
            id,
            name,
            arguments: argumentsDelta,
          });
        }
      }
    }

    const toolCalls = Array.from(this.accumulatedToolCalls.values());
    const hasAllContent = this.finishReason === 'tool_calls' && toolCalls.length > 0;

    if (this.debugEnabled && toolCalls.length > 0) {
      console.log(`[ToolCallHandler] Accumulated: ${toolCalls.length} tool calls, finishReason: ${this.finishReason}, hasAllContent: ${hasAllContent}`);
    }

    return { toolCalls, finishReason: this.finishReason, hasAllContent };
  }

  /**
   * Get currently accumulated tool calls.
   */
  getAccumulatedToolCalls(): AccumulatedToolCall[] {
    return Array.from(this.accumulatedToolCalls.values());
  }

  /**
   * Check if we have complete tool calls ready for execution.
   */
  isReadyForExecution(): boolean {
    return this.finishReason === 'tool_calls' && this.accumulatedToolCalls.size > 0;
  }

  /**
   * Get the current finish reason.
   */
  getFinishReason(): string | undefined {
    return this.finishReason;
  }

  /**
   * Reset the handler for a new streaming session.
   */
  reset(): void {
    this.accumulatedToolCalls.clear();
    this.finishReason = undefined;
  }

  /**
   * Execute accumulated tool calls using the provided executor.
   */
  async execute(
    toolExecutor: ToolExecutor,
    _requestId?: string
  ): Promise<ToolExecutionResult> {
    const toolCalls = this.getAccumulatedToolCalls();
    const filesWritten: string[] = [];
    const messages: ChatMessage[] = [];
    const errors: Array<{ toolName: string; error: string }> = [];

    if (toolCalls.length === 0) {
      return { messages, filesWritten, toolCallsExecuted: 0, errors };
    }

    console.log(`[ToolCallHandler] Executing ${toolCalls.length} tool calls`);

    for (const tc of toolCalls) {
      const startTime = Date.now();

      try {
        // Parse arguments lazily
        const args = tc.argumentsParsed ?? parseToolArguments(tc.arguments);
        tc.argumentsParsed = args;

        // Execute tool
        const result = await toolExecutor(tc.name, args);
        const duration = Date.now() - startTime;

        // Log tool result
        if (this.debugEnabled) {
          console.log(`[ToolCallHandler] Tool executed: ${tc.name} (${duration}ms) success=${result.success} filesWritten=${result.filesWritten?.length ?? 0}`);
        }

        // Collect files written
        if (result.filesWritten && result.filesWritten.length > 0) {
          filesWritten.push(...result.filesWritten);
        }

        // Build tool result message
        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: result.success
            ? typeof result.result === 'string'
              ? result.result
              : JSON.stringify(result.result || { success: true })
            : `Error: ${result.error || 'Unknown error'}`,
        });

        if (!result.success) {
          errors.push({ toolName: tc.name, error: result.error || 'Unknown error' });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        console.error(`[ToolCallHandler] Tool execution threw: ${tc.name}`, errorMessage);

        messages.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: `Error: ${errorMessage}`,
        });

        errors.push({ toolName: tc.name, error: errorMessage });
      }
    }

    console.log(`[ToolCallHandler] Execution complete: ${messages.length} results, ${filesWritten.length} files written`);

    return { messages, filesWritten, toolCallsExecuted: toolCalls.length, errors };
  }

  /**
   * Build the assistant message from accumulated tool calls.
   */
  buildAssistantMessage(): ChatMessage | null {
    const toolCalls = this.getAccumulatedToolCalls();

    if (toolCalls.length === 0) {
      return null;
    }

    return {
      role: 'assistant',
      content: '',
      tool_calls: toolCalls.map((tc) => ({
        id: tc.id,
        type: 'function' as const,
        function: {
          name: tc.name,
          arguments: tc.arguments,
        },
      })),
    };
  }

  /**
   * Build the complete messages array for follow-up request.
   */
  buildFollowUpMessages(
    existingMessages: ChatMessage[],
    assistantMessage: ChatMessage,
    toolResults: ChatMessage[]
  ): ChatMessage[] {
    const messages = [...existingMessages];
    messages.push(assistantMessage);
    messages.push(...toolResults);
    return messages;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Create a pre-configured ToolCallHandler instance.
 */
export function createToolCallHandler(): ToolCallHandler {
  return new ToolCallHandler(true);
}

/**
 * Check if a streaming chunk indicates tool calls are present.
 */
export function hasToolCallsInChunk(chunk: StreamChunk): boolean {
  const delta = chunk.choices?.[0]?.delta;
  const hasToolCalls = Array.isArray(delta?.tool_calls) && delta.tool_calls.length > 0;
  const finishReason = chunk.choices?.[0]?.finish_reason;

  return hasToolCalls || finishReason === 'tool_calls';
}

/**
 * Extract tool calls from a non-streaming response.
 */
export function extractToolCallsFromResponse(
  response: { choices?: Array<{ message?: { tool_calls?: unknown } }> }
): AccumulatedToolCall[] {
  const toolCalls = response.choices?.[0]?.message?.tool_calls;

  if (!Array.isArray(toolCalls)) {
    return [];
  }

  return toolCalls.map((tc: unknown) => {
    const toolCall = tc as {
      id?: string;
      function?: { name?: string; arguments?: string };
      name?: string;
      arguments?: string;
    };

    return {
      id: toolCall.id || `call_${Date.now()}`,
      name: toolCall.function?.name || toolCall.name || '',
      arguments: toolCall.function?.arguments || toolCall.arguments || '{}',
    };
  });
}

/**
 * Execute a single tool call (non-streaming).
 */
export async function executeSingleToolCall(
  toolExecutor: ToolExecutor,
  toolCall: AccumulatedToolCall
): Promise<{ message: ChatMessage; filesWritten: string[]; success: boolean; error?: string }> {
  const filesWritten: string[] = [];

  try {
    const args = parseToolArguments(toolCall.arguments);
    const result = await toolExecutor(toolCall.name, args);

    if (result.filesWritten && result.filesWritten.length > 0) {
      filesWritten.push(...result.filesWritten);
    }

    return {
      message: {
        role: 'tool',
        tool_call_id: toolCall.id,
        name: toolCall.name,
        content: result.success
          ? typeof result.result === 'string'
            ? result.result
            : JSON.stringify(result.result || { success: true })
          : `Error: ${result.error || 'Unknown error'}`,
      },
      filesWritten,
      success: result.success,
      error: result.success ? undefined : result.error,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return {
      message: {
        role: 'tool',
        tool_call_id: toolCall.id,
        name: toolCall.name,
        content: `Error: ${formatToolError(toolCall.name, error)}`,
      },
      filesWritten,
      success: false,
      error: errorMessage,
    };
  }
}