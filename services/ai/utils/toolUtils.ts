/**
 * Shared Tool Utilities
 *
 * Common utilities for tool calling across providers.
 * Used by OpenAI-compatible providers (openai, openrouter, custom, cerebras, minimax, lmstudio).
 */

// ============================================================================
// Tool Call Types (mirroring OpenAI SDK structure)
// ============================================================================

export interface ParsedToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface PreparedTools {
  tools: Array<{
    type: 'function';
    function: {
      name: string;
      description?: string;
      parameters: Record<string, unknown>;
    };
  }>;
  toolMap: Map<string, string>; // Maps tool.name → tool.function.name
}

// ============================================================================
// Tool Argument Parsing
// ============================================================================

/**
 * Parse raw tool arguments string into an object.
 * Handles edge cases like escaped quotes, nested objects, etc.
 */
export function parseToolArguments(rawArguments: string): Record<string, unknown> {
  if (!rawArguments || typeof rawArguments !== 'string') {
    return {};
  }

  // Try direct JSON parse first
  try {
    return JSON.parse(rawArguments);
  } catch {
    // Fallback for malformed JSON
  }

  // Handle streaming format where arguments come as partial strings
  const trimmed = rawArguments.trim();
  if (trimmed.startsWith('{') && !trimmed.endsWith('}')) {
    // Likely incomplete JSON - try to fix common issues
    try {
      // Add closing brace if missing
      return JSON.parse(trimmed + '}');
    } catch {
      // Still failed
    }
  }

  // Last resort: return empty object
  return {};
}

/**
 * Serialize a payload to JSON string safely.
 */
export function serializeToolPayload(payload: unknown): string {
  if (payload === undefined || payload === null) {
    return '{}';
  }

  try {
    return JSON.stringify(payload);
  } catch {
    return '{}';
  }
}

// ============================================================================
// Tool Deduplication
// ============================================================================

/**
 * Deduplicate tools by name, keeping the first occurrence.
 * Used when multiple providers define the same tool.
 */
export function deduplicateTools<T extends { function: { name: string } }>(tools: T[]): T[] {
  const seen = new Set<string>();
  return tools.filter((tool) => {
    const name = tool.function.name;
    if (seen.has(name)) {
      return false;
    }
    seen.add(name);
    return true;
  });
}

// ============================================================================
// Tool Formatting
// ============================================================================

/**
 * Format a tool for display in error messages or logs.
 */
export function formatToolName(toolCall: { name?: string; function?: { name?: string } }): string {
  return toolCall.name || toolCall.function?.name || 'unknown-tool';
}

// ============================================================================
// Message Building Helpers
// ============================================================================

export interface BuildMessagesOptions {
  systemInstruction?: string;
  conversationHistory?: Array<{ role: string; content: string }>;
  currentPrompt: string;
  includeSystemFirst?: boolean;
}

/**
 * Build the messages array for OpenAI-compatible API requests.
 * Handles system instruction, conversation history, and current prompt.
 */
export function buildMessages(options: BuildMessagesOptions): Array<{ role: string; content: string }> {
  const { systemInstruction, conversationHistory, currentPrompt, includeSystemFirst = true } = options;
  const messages: Array<{ role: string; content: string }> = [];

  // Add system message first if present
  if (systemInstruction && includeSystemFirst) {
    messages.push({ role: 'system', content: systemInstruction });
  }

  // Add conversation history
  if (conversationHistory && conversationHistory.length > 0) {
    for (const msg of conversationHistory) {
      // Skip system messages in conversation history (they go at the top)
      if (msg.role === 'system' && includeSystemFirst) continue;
      messages.push({
        role: msg.role,
        content: msg.content,
      });
    }
  }

  // Add user message
  messages.push({ role: 'user', content: currentPrompt });

  return messages;
}

// ============================================================================
// Response Parsing Helpers
// ============================================================================

/**
 * Extract text content from an OpenAI-compatible message.
 */
export function extractMessageText(message: { content?: string | null; role?: string }): string {
  if (typeof message.content === 'string') {
    return message.content;
  }
  return '';
}

/**
 * Check if a response indicates tool calls were made.
 */
export function hasToolCalls(message: unknown): boolean {
  if (!message || typeof message !== 'object') return false;
  const m = message as { tool_calls?: unknown };
  return Array.isArray(m.tool_calls) && m.tool_calls.length > 0;
}

// ============================================================================
// Error Helpers
// ============================================================================

/**
 * Format an error message for tool execution errors.
 */
export function formatToolError(toolName: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `Tool "${toolName}" failed: ${message}`;
}

// ============================================================================
// Request Building Helpers
// ============================================================================

/**
 * Build the base request body for OpenAI-compatible providers.
 * Handles common fields like model, messages, max_tokens, temperature.
 */
export function buildBaseRequestBody(
  model: string,
  messages: Array<{ role: string; content: string }>,
  options: {
    maxTokens?: number;
    temperature?: number;
    stream?: boolean;
  }
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model,
    messages,
  };

  if (options.maxTokens !== undefined) {
    body.max_tokens = options.maxTokens;
  }

  if (options.temperature !== undefined) {
    body.temperature = options.temperature;
  }

  if (options.stream !== undefined) {
    body.stream = options.stream;
  }

  return body;
}