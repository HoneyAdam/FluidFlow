/**
 * Tool Call Adapter Interface
 *
 * Each AI provider has different streaming formats and tool call mechanisms.
 * This adapter provides a unified interface for tool calling in streaming mode.
 */

import type { AIToolDefinition, ToolResult } from '../types';

// ============================================================================
// Adapter Types
// ============================================================================

export interface ToolCallChunk {
  id: string;
  name: string;
  arguments: string;
  /** Whether this is a partial argument (streaming JSON) */
  isPartial?: boolean;
}

export interface ToolCallResult {
  toolName: string;
  success: boolean;
  result?: unknown;
  error?: string;
  filesWritten?: string[];
}

/**
 * Streaming tool call adapter for a specific provider format.
 * Each provider implements this to handle its unique SSE format for tool calls.
 */
export interface ToolCallAdapter {
  /**
   * Provider type identifier
   */
  readonly providerType: string;

  /**
   * Check if this adapter supports the given format
   */
  supportsFormat(format: string): boolean;

  /**
   * Parse a raw SSE chunk and extract tool calls if present.
   * Returns null if no tool calls in this chunk.
   */
  extractToolCalls(chunk: unknown): ToolCallChunk[] | null;

  /**
   * Check if the stream indicates tool calls are complete.
   * Some providers use finish_reason, others use specific event types.
   */
  isToolCallsComplete(chunk: unknown): boolean;

  /**
   * Get the finish reason from a chunk (if present)
   */
  getFinishReason(chunk: unknown): string | undefined;

  /**
   * Format tool definitions for this provider's API format.
   */
  formatTools(tools: AIToolDefinition[]): unknown;

  /**
   * Format a tool result for the provider's message format.
   */
  formatToolResult(result: ToolResult, toolCallId: string): unknown;

  /**
   * Format a follow-up request with tool results.
   * Returns the messages array with tool role messages appended.
   */
  buildFollowUpMessages(
    existingMessages: unknown[],
    assistantMessage: unknown,
    toolResults: unknown[]
  ): unknown[];
}

// ============================================================================
// OpenAI-compatible Tool Call Adapter
// ============================================================================

export class OpenAIToolCallAdapter implements ToolCallAdapter {
  readonly providerType = 'openai-compatible';

  supportsFormat(format: string): boolean {
    return format === 'openai' || format === 'openrouter' || format === 'custom';
  }

  extractToolCalls(chunk: unknown): ToolCallChunk[] | null {
    if (!chunk || typeof chunk !== 'object') return null;

    const data = chunk as Record<string, unknown>;
    const choices = data.choices as Array<{
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

    if (!choices?.[0]?.delta?.tool_calls) return null;

    const toolCalls = choices[0].delta.tool_calls;
    return toolCalls.map(tc => ({
      id: tc.id || '',
      name: tc.function?.name || tc.name || '',
      arguments: tc.function?.arguments || tc.arguments || '',
      isPartial: tc.function?.arguments === undefined && tc.arguments === undefined,
    }));
  }

  isToolCallsComplete(chunk: unknown): boolean {
    if (!chunk || typeof chunk !== 'object') return false;

    const data = chunk as Record<string, unknown>;
    const choices = data.choices as Array<{ finish_reason?: string }>;
    return choices?.[0]?.finish_reason === 'tool_calls';
  }

  getFinishReason(chunk: unknown): string | undefined {
    if (!chunk || typeof chunk !== 'object') return undefined;

    const data = chunk as Record<string, unknown>;
    const choices = data.choices as Array<{ finish_reason?: string }>;
    return choices?.[0]?.finish_reason;
  }

  formatTools(tools: AIToolDefinition[]): unknown {
    return tools.map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description || '',
        parameters: t.parameters || { type: 'object', properties: {} },
      },
    }));
  }

  formatToolResult(result: ToolResult, toolCallId: string): unknown {
    return {
      role: 'tool' as const,
      tool_call_id: toolCallId,
      content: result.success
        ? typeof result.result === 'string'
          ? result.result
          : JSON.stringify(result.result || { success: true })
        : `Error: ${result.error || 'Unknown error'}`,
    };
  }

  buildFollowUpMessages(
    existingMessages: unknown[],
    assistantMessage: unknown,
    toolResults: unknown[]
  ): unknown[] {
    return [...(existingMessages as unknown[]), assistantMessage, ...(toolResults as unknown[])];
  }
}

// ============================================================================
// Anthropic Tool Call Adapter
// ============================================================================

export class AnthropicToolCallAdapter implements ToolCallAdapter {
  readonly providerType = 'anthropic';

  supportsFormat(format: string): boolean {
    return format === 'anthropic';
  }

  extractToolCalls(chunk: unknown): ToolCallChunk[] | null {
    if (!chunk || typeof chunk !== 'object') return null;

    const data = chunk as Record<string, unknown>;

    // Anthropic uses content_block_delta with subtype 'input_json_delta'
    // for streaming tool arguments, and content_block_start with type 'tool_use'
    // for tool call start

    // Check for content_block_start with tool_use
    if (data.type === 'content_block_start') {
      const content = data.content as Array<{ type?: string; name?: string; input?: string }>;
      const toolUse = content?.find(c => c.type === 'tool_use');
      if (toolUse) {
        return [{
          id: toolUse.name || '', // Anthropic uses name as identifier
          name: toolUse.name || '',
          arguments: toolUse.input || '',
        }];
      }
    }

    // Check for content_block_delta with input_json_delta
    if (data.type === 'content_block_delta') {
      const delta = data.delta as { type?: string; partial_json?: string };
      if (delta?.type === 'input_json_delta') {
        // This is a partial argument update
        return [{
          id: '', // Will be matched with the tool_use from start event
          name: '', // Will be matched with the tool_use from start event
          arguments: delta.partial_json || '',
          isPartial: true,
        }];
      }
    }

    return null;
  }

  isToolCallsComplete(chunk: unknown): boolean {
    if (!chunk || typeof chunk !== 'object') return false;

    const data = chunk as Record<string, unknown>;
    return data.type === 'message_stop';
  }

  getFinishReason(chunk: unknown): string | undefined {
    if (!chunk || typeof chunk !== 'object') return undefined;

    const data = chunk as Record<string, unknown>;

    if (data.type === 'message_stop') return 'stop';
    if (data.type === 'content_block_stop') return 'stop';

    // Check for tool_use in content blocks
    if (data.type === 'message' && data.content) {
      const content = data.content as Array<{ type?: string }>;
      const hasToolUse = content?.some(c => c.type === 'tool_use');
      if (hasToolUse) return 'tool_calls';
    }

    return undefined;
  }

  formatTools(tools: AIToolDefinition[]): unknown {
    return tools.map(t => ({
      name: t.name,
      description: t.description || '',
      input_schema: t.parameters || { type: 'object', properties: {} },
    }));
  }

  formatToolResult(result: ToolResult, toolCallId: string): unknown {
    return {
      role: 'user' as const,
      content: [{
        type: 'tool_result' as const,
        tool_use_id: toolCallId,
        content: result.success
          ? JSON.stringify(result.result || { success: true })
          : `Error: ${result.error || 'Unknown error'}`,
      }],
    };
  }

  buildFollowUpMessages(
    existingMessages: unknown[],
    assistantMessage: unknown,
    toolResults: unknown[]
  ): unknown[] {
    return [...(existingMessages as unknown[]), assistantMessage, ...(toolResults as unknown[])];
  }
}

// ============================================================================
// Gemini Tool Call Adapter
// ============================================================================

export class GeminiToolCallAdapter implements ToolCallAdapter {
  readonly providerType = 'gemini';

  supportsFormat(format: string): boolean {
    return format === 'gemini';
  }

  extractToolCalls(chunk: unknown): ToolCallChunk[] | null {
    if (!chunk || typeof chunk !== 'object') return null;

    const data = chunk as Record<string, unknown>;

    // Gemini streaming uses functionCall in parts
    const candidates = data.candidates as Array<{
      content?: {
        parts?: Array<{ functionCall?: { name?: string; args?: Record<string, unknown> } }>;
      };
    }>;

    const functionCalls: ToolCallChunk[] = [];

    candidates?.forEach(candidate => {
      candidate.content?.parts?.forEach(part => {
        if (part.functionCall) {
          functionCalls.push({
            id: part.functionCall.name || '', // Gemini doesn't have IDs, use name
            name: part.functionCall.name || '',
            arguments: JSON.stringify(part.functionCall.args || {}),
          });
        }
      });
    });

    return functionCalls.length > 0 ? functionCalls : null;
  }

  isToolCallsComplete(chunk: unknown): boolean {
    if (!chunk || typeof chunk !== 'object') return false;

    const data = chunk as Record<string, unknown>;

    // Gemini DONE is indicated by candidates[0].finishReason
    const candidates = data.candidates as Array<{ finishReason?: string }>;
    return candidates?.[0]?.finishReason === 'stop' ||
           candidates?.[0]?.finishReason === 'MAX_TOKENS';
  }

  getFinishReason(chunk: unknown): string | undefined {
    if (!chunk || typeof chunk !== 'object') return undefined;

    const data = chunk as Record<string, unknown>;
    const candidates = data.candidates as Array<{ finishReason?: string }>;
    return candidates?.[0]?.finishReason;
  }

  formatTools(tools: AIToolDefinition[]): unknown {
    return [{
      functionDeclarations: tools.map(t => ({
        name: t.name,
        description: t.description || '',
        parameters: t.parameters || { type: 'object', properties: {} },
      })),
    }];
  }

  formatToolResult(result: ToolResult, toolCallId: string): unknown {
    return {
      role: 'user' as const,
      parts: [{
        functionResponse: {
          name: toolCallId, // For Gemini, name is the identifier
          response: result.success
            ? (result.result || { success: true })
            : { error: result.error || 'Unknown error' },
        },
      }],
    };
  }

  buildFollowUpMessages(
    existingMessages: unknown[],
    assistantMessage: unknown,
    toolResults: unknown[]
  ): unknown[] {
    return [...(existingMessages as unknown[]), assistantMessage, ...(toolResults as unknown[])];
  }
}

// ============================================================================
// Adapter Registry
// ============================================================================

const adapters: ToolCallAdapter[] = [
  new OpenAIToolCallAdapter(),
  new AnthropicToolCallAdapter(),
  new GeminiToolCallAdapter(),
];

/**
 * Get the appropriate adapter for a provider type
 */
export function getToolCallAdapter(providerType: string): ToolCallAdapter {
  // Find adapter by provider type match
  const adapter = adapters.find(a => {
    if (providerType === 'openai' || providerType === 'openrouter' || providerType === 'custom' ||
        providerType === 'cerebras' || providerType === 'minimax' || providerType === 'lmstudio' ||
        providerType === 'ollama') {
      return a.providerType === 'openai-compatible';
    }
    return a.providerType === providerType;
  });

  return adapter || adapters[0]; // Default to OpenAI-compatible
}

/**
 * Get adapter by SSE format
 */
export function getAdapterByFormat(format: string): ToolCallAdapter {
  const adapter = adapters.find(a => a.supportsFormat(format));
  return adapter || adapters[0];
}