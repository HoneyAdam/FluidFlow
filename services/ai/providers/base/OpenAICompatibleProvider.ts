/**
 * OpenAI-Compatible Provider Base Class
 *
 * Abstract base class for providers using OpenAI-compatible API:
 * - openai, openrouter, custom (use OpenAI SDK or REST)
 * - cerebras, minimax, lmstudio (REST, OpenAI-compatible)
 *
 * Handles:
 * - Message building with conversation history
 * - JSON output handling via prepareJsonRequest
 * - SSE stream parsing via processSSEStream
 * - Tool calling (for providers that support it)
 * - Request/response typing
 */

import type {
  AIProvider,
  ProviderConfig,
  GenerationRequest,
  GenerationResponse,
  StreamChunk,
  ModelOption,
  AIToolDefinition,
  ToolExecutor,
} from '../../types';
import { fetchWithTimeout, TIMEOUT_TEST_CONNECTION, TIMEOUT_GENERATE, TIMEOUT_LIST_MODELS } from '../../utils/fetchWithTimeout';
import { prepareJsonRequest } from '../../utils/jsonOutput';
import { throwIfNotOk } from '../../utils/errorHandling';
import { processSSEStream, createEstimatedUsage } from '../../utils/streamParser';
import { parseToolArguments, formatToolError } from '../../utils/toolUtils';

// ============================================================================
// Types (duplicated here to avoid circular imports)
// ============================================================================

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
   
  tool_call_id?: string;
   
  name?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tool_calls?: any[];
}

interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  max_tokens?: number;
  temperature?: number;
  stream?: boolean;
  stream_options?: { include_usage: boolean };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  response_format?: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tools?: any[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  tool_choice?: any;
}

// ============================================================================
// Abstract Base Class
// ============================================================================

export abstract class OpenAICompatibleProvider implements AIProvider {
  readonly config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  // ========================================================================
  // Abstract Methods (subclasses must implement)
  // ========================================================================

  /**
   * Get the API endpoint for chat completions
   */
  protected abstract getApiEndpoint(): string;

  /**
   * Get the models endpoint
   */
  protected abstract getModelsEndpoint(): string;

  /**
   * Get authorization header value
   */
  protected abstract getAuthHeader(): string;

  // ========================================================================
  // Default Implementations (can be overridden)
  // ========================================================================

  /**
   * Get additional headers for requests
   */
  protected getAdditionalHeaders(): Record<string, string> {
    return this.config.headers || {};
  }

  /**
   * Get default max tokens
   */
  protected getDefaultMaxTokens(): number {
    return 16384;
  }

  /**
   * Map raw model data to ModelOption (can be overridden)
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected mapModel(m: any): ModelOption {
    return {
      id: m.id,
      name: m.id,
      supportsStreaming: true,
    };
  }

  // ========================================================================
  // Shared Implementation
  // ========================================================================

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetchWithTimeout(this.getModelsEndpoint(), {
        headers: {
          'Authorization': this.getAuthHeader(),
        },
        timeout: TIMEOUT_TEST_CONNECTION,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Connection failed' };
    }
  }

  async generate(request: GenerationRequest, model: string): Promise<GenerationResponse> {
    const messages = this.buildMessages(request);

    const body = this.buildRequestBody(model, messages, {
      maxTokens: request.maxTokens,
      temperature: request.temperature,
      tools: request.tools,
      toolChoice: request.toolChoice,
    });

    // Add JSON format handling
    this.applyJsonFormat(body, request);

    const response = await fetchWithTimeout(this.getApiEndpoint(), {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
      timeout: TIMEOUT_GENERATE,
    });

    await throwIfNotOk(response, this.config.type);

    const data = await response.json();

    // Handle tool calls if present
    if (data.choices?.[0]?.message?.tool_calls && request.toolExecutor) {
      const result = await this.handleToolCalls(data, request.toolExecutor);
      return {
        text: result.text,
        finishReason: result.finishReason,
        usage: {
          inputTokens: data.usage?.prompt_tokens,
          outputTokens: data.usage?.completion_tokens,
        },
      };
    }

    return {
      text: data.choices?.[0]?.message?.content || '',
      finishReason: data.choices?.[0]?.finish_reason,
      usage: {
        inputTokens: data.usage?.prompt_tokens,
        outputTokens: data.usage?.completion_tokens,
      },
    };
  }

  async generateStream(
    request: GenerationRequest,
    model: string,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<GenerationResponse> {
    const messages = this.buildMessages(request);

    const body = this.buildRequestBody(model, messages, {
      maxTokens: request.maxTokens,
      temperature: request.temperature,
      stream: true,
      tools: request.tools,
      toolChoice: request.toolChoice,
    });

    // Request usage stats in streaming
    body.stream_options = { include_usage: true };

    // Add JSON format handling
    this.applyJsonFormat(body, request);

    const response = await fetchWithTimeout(this.getApiEndpoint(), {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify(body),
      timeout: TIMEOUT_GENERATE,
    });

    await throwIfNotOk(response, this.config.type);

    // Check if tool calls are enabled
    const hasToolExecutor = request.toolExecutor && request.tools && request.tools.length > 0;

    if (hasToolExecutor) {
      // Process streaming with tool call detection
      return this.processStreamingWithTools(response, messages, model, body, request, onChunk);
    }

    // Use unified SSE stream parser (no tools)
    const { fullText, usage } = await processSSEStream(response, {
      format: 'openai',
      onChunk,
    });

    // If no usage from API, estimate tokens
    if (!usage) {
      const estimated = createEstimatedUsage(JSON.stringify(messages), fullText);
      return { text: fullText, usage: estimated };
    }

    return { text: fullText, usage };
  }

  /**
   * Process streaming response with tool call detection and handling
   */
  private async processStreamingWithTools(
    response: Response,
    messages: ChatMessage[],
    model: string,
    baseBody: ChatCompletionRequest,
    request: GenerationRequest,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<GenerationResponse> {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    const toolExecutor = request.toolExecutor!; // Safe: hasToolExecutor check above ensures this is set
    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';
    let finishReason: string | undefined;
    const accumulatedToolCalls: Array<{ id: string; name: string; arguments: string }> = [];

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        // Process complete lines
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed.startsWith(':')) continue;
          if (trimmed === 'data: [DONE]') continue;

          if (trimmed.startsWith('data:')) {
            const data = trimmed.slice(5).trim();
            try {
              const parsed = JSON.parse(data);
              const text = parsed.choices?.[0]?.delta?.content || '';
              if (text) {
                fullText += text;
                onChunk({ text, done: false });
              }

              // Accumulate tool calls
              const toolCalls = parsed.choices?.[0]?.delta?.tool_calls;
              if (Array.isArray(toolCalls)) {
                for (const tc of toolCalls) {
                  const existing = accumulatedToolCalls.find(t => t.id === tc.id);
                  if (existing) {
                    existing.arguments += tc.function?.arguments || '';
                  } else {
                    accumulatedToolCalls.push({
                      id: tc.id || '',
                      name: tc.function?.name || tc.name || '',
                      arguments: tc.function?.arguments || tc.arguments || '',
                    });
                  }
                }
              }

              finishReason = parsed.choices?.[0]?.finish_reason;
            } catch {
              // Skip parse errors for partial data
            }
          }
        }
      }

      // Final chunk
      onChunk({ text: '', done: true });

      // If tool calls were made, handle them
      if (accumulatedToolCalls.length > 0 && finishReason === 'tool_calls') {
        onChunk({ text: '', done: true });

        // Execute tool calls
        const toolResults = await this.executeToolCalls(accumulatedToolCalls, toolExecutor);

        // Add tool results to messages
        messages.push({
          role: 'assistant',
          content: '',
          tool_calls: accumulatedToolCalls.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: { name: tc.name, arguments: tc.arguments }
          })),
        });
        messages.push(...toolResults);

        // Make follow-up request (non-streaming for tool call handling)
        const followUpBody: ChatCompletionRequest = {
          ...baseBody,
          model,
          messages,
          stream: false,
        };
        delete followUpBody.stream_options;

        const followUpResponse = await fetchWithTimeout(this.getApiEndpoint(), {
          method: 'POST',
          headers: this.buildHeaders(),
          body: JSON.stringify(followUpBody),
          timeout: TIMEOUT_GENERATE,
        });

        await throwIfNotOk(followUpResponse, this.config.type);
        const followUpData = await followUpResponse.json();

        const followUpText = followUpData.choices?.[0]?.message?.content || '';
        return {
          text: followUpText,
          finishReason: followUpData.choices?.[0]?.finish_reason,
          usage: {
            inputTokens: followUpData.usage?.prompt_tokens,
            outputTokens: followUpData.usage?.completion_tokens,
          },
        };
      }

      // No tool calls, return accumulated text
      return {
        text: fullText,
        finishReason,
        usage: undefined, // Streaming doesn't provide usage
      };
    } finally {
      reader.releaseLock();
    }
  }

  async listModels(): Promise<ModelOption[]> {
    const response = await fetchWithTimeout(this.getModelsEndpoint(), {
      headers: {
        'Authorization': this.getAuthHeader(),
      },
      timeout: TIMEOUT_LIST_MODELS,
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();

    return (data.data || []).map((m: { id: string; name?: string }) => this.mapModel(m));
  }

  // ========================================================================
  // Protected Helpers
  // ========================================================================

  /**
   * Build messages array from request
   */
  protected buildMessages(request: GenerationRequest): ChatMessage[] {
    const messages: ChatMessage[] = [];

    // Use unified JSON output handling
    const jsonRequest = request.responseFormat === 'json'
      ? prepareJsonRequest(this.config.type, request.systemInstruction || '', request.responseSchema)
      : null;

    const systemContent = jsonRequest?.systemInstruction ?? request.systemInstruction ?? '';

    if (systemContent) {
      messages.push({ role: 'system', content: systemContent });
    }

    // Add conversation history if present
    if (request.conversationHistory && request.conversationHistory.length > 0) {
      for (const msg of request.conversationHistory) {
        messages.push({
          role: msg.role as ChatMessage['role'],
          content: msg.content,
        });
      }
    }

    // Add current prompt
    messages.push({ role: 'user', content: request.prompt });

    return messages;
  }

  /**
   * Build request body
   */
  protected buildRequestBody(
    model: string,
    messages: ChatMessage[],
    options: {
      maxTokens?: number;
      temperature?: number;
      stream?: boolean;
      tools?: AIToolDefinition[];
      toolChoice?: 'auto' | 'none' | { type: 'function'; name: string };
    }
  ): ChatCompletionRequest {
    const body: ChatCompletionRequest = {
      model,
      messages,
      max_tokens: options.maxTokens || this.getDefaultMaxTokens(),
      temperature: options.temperature ?? 0.7,
    };

    if (options.stream !== undefined) {
      body.stream = options.stream;
    }

    // Add tools if provided
    const preparedTools = this.prepareToolsForRequest(options.tools);
    if (preparedTools) {
      body.tools = preparedTools.tools;
      if (options.toolChoice) {
        body.tool_choice = options.toolChoice;
      }
    }

    return body;
  }

  /**
   * Apply JSON format to request body
   */
  protected applyJsonFormat(body: ChatCompletionRequest, request: GenerationRequest): void {
    if (request.responseFormat !== 'json') return;

    const jsonRequest = prepareJsonRequest(this.config.type, '', request.responseSchema);

    if (jsonRequest?.useNativeSchema && request.responseSchema) {
      // Use json_schema for strict structured output
      body.response_format = {
        type: 'json_schema',
        json_schema: {
          name: 'response_schema',
          strict: true,
          schema: request.responseSchema,
        },
      };
    } else if (jsonRequest?.useJsonObject) {
      body.response_format = { type: 'json_object' };
    }
  }

  /**
   * Build headers for request
   */
  protected buildHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      'Authorization': this.getAuthHeader(),
      ...this.getAdditionalHeaders(),
    };
  }

  // ========================================================================
  // Tool Calling Support
  // ========================================================================

  /**
   * Convert AIToolDefinition[] to OpenAI tools format
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected prepareToolsForRequest(tools?: AIToolDefinition[]): { tools: any[]; toolMap: Map<string, string> } | null {
    if (!tools || tools.length === 0) return null;

    const toolMap = new Map<string, string>();
    const openaiTools = tools.map((tool) => {
      const name = tool.name;
      toolMap.set(name, name);
      return {
        type: 'function',
        function: {
          name: tool.name,
          description: tool.description || '',
          parameters: tool.parameters || { type: 'object', properties: {} },
        },
      };
    });

    return { tools: openaiTools, toolMap };
  }

  /**
   * Extract tool calls from response message
   */
  protected extractToolCalls(message: { tool_calls?: unknown }): Array<{ id: string; name: string; arguments: string }> {
    if (!message.tool_calls || !Array.isArray(message.tool_calls)) {
      return [];
    }

    return message.tool_calls.map((tc: unknown) => {
      const toolCall = tc as { id?: string; function?: { name?: string; arguments?: string }; name?: string; arguments?: string };
      return {
        id: toolCall.id || `call_${Date.now()}`,
        name: toolCall.function?.name || toolCall.name || '',
        arguments: toolCall.function?.arguments || toolCall.arguments || '{}',
      };
    });
  }

  /**
   * Execute tool calls and return result messages
   */
  protected async executeToolCalls(
    toolCalls: Array<{ id: string; name: string; arguments: string }>,
    toolExecutor?: ToolExecutor
  ): Promise<ChatMessage[]> {
    if (!toolExecutor || toolCalls.length === 0) {
      return [];
    }

    const results = await Promise.all(
      toolCalls.map(async (tc) => {
        try {
          const args = parseToolArguments(tc.arguments);
          const result = await toolExecutor(tc.name, args);
          return {
            role: 'tool' as const,
            tool_call_id: tc.id,
            name: tc.name,
            content: result.success
              ? typeof result.result === 'string' ? result.result : JSON.stringify(result.result)
              : `Error: ${result.error}`,
          };
        } catch (error) {
          return {
            role: 'tool' as const,
            tool_call_id: tc.id,
            name: tc.name,
            content: `Error: ${formatToolError(tc.name, error)}`,
          };
        }
      })
    );

    return results;
  }

  /**
   * Handle tool calls in a response, execute them, and return updated messages
   */
  protected async handleToolCalls(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    responseData: any,
    toolExecutor?: ToolExecutor,
    maxIterations = 5
  ): Promise<{ messages: ChatMessage[]; text: string; finishReason?: string }> {
    const messages = [...(responseData.choices?.[0]?.message ? [responseData.choices[0].message] : [])];
    let text = responseData.choices?.[0]?.message?.content || '';
    let finishReason = responseData.choices?.[0]?.finish_reason;

    let iterations = 0;
    while (iterations < maxIterations) {
      const lastMessage = messages[messages.length - 1];
      const toolCalls = lastMessage ? this.extractToolCalls(lastMessage) : [];

      if (toolCalls.length === 0) break;

      // Execute tool calls
      const toolResults = await this.executeToolCalls(toolCalls, toolExecutor);

      // Add tool results to messages
      messages.push(...toolResults);

      // Make follow-up request with tool results
      const followUpResponse = await fetchWithTimeout(this.getApiEndpoint(), {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify({
          model: responseData.model || this.config.defaultModel,
          messages: messages.map((m) => ({
            role: m.role,
            content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
            ...('tool_call_id' in m ? { tool_call_id: m.tool_call_id, name: m.name } : {}),
          })),
        }),
        timeout: TIMEOUT_GENERATE,
      });

      await throwIfNotOk(followUpResponse, this.config.type);

      const followUpData = await followUpResponse.json();
      const followUpMessage = followUpData.choices?.[0]?.message;
      if (followUpMessage) {
        messages.push(followUpMessage);
        text = followUpMessage.content || text;
        finishReason = followUpData.choices?.[0]?.finish_reason;
      }

      iterations++;
    }

    return { messages, text, finishReason };
  }

  /**
   * Handle streaming tool calls
   */
  protected async handleStreamingToolCalls(
    chunks: Array<{ text: string; tool_calls?: unknown }>,
    _toolExecutor?: ToolExecutor,
    _maxIterations = 5
  ): Promise<{ text: string; toolCallsTriggered: boolean }> {
    const fullText = chunks.map((c) => c.text).join('');
    const toolCallsTriggered = false;

    // Reconstruct full response to check for tool calls
    // In a real implementation, you'd need to accumulate and parse the SSE stream
    // For now, we indicate that tool calls were in the response

    return { text: fullText, toolCallsTriggered };
  }
}

// ============================================================================
// Concrete Implementations for Common Cases
// ============================================================================

/**
 * OpenAI Provider - uses Bearer token auth
 */
export class OpenAIProviderImpl extends OpenAICompatibleProvider {
  protected getApiEndpoint(): string {
    return `${this.config.baseUrl}/chat/completions`;
  }

  protected getModelsEndpoint(): string {
    return `${this.config.baseUrl}/models`;
  }

  protected getAuthHeader(): string {
    return `Bearer ${this.config.apiKey}`;
  }
}

/**
 * Cerebras Provider - uses Bearer token auth, different endpoint pattern
 */
export class CerebrasProviderImpl extends OpenAICompatibleProvider {
  protected getApiEndpoint(): string {
    return `${this.config.baseUrl}/chat/completions`;
  }

  protected getModelsEndpoint(): string {
    return `${this.config.baseUrl}/models`;
  }

  protected getAuthHeader(): string {
    return `Bearer ${this.config.apiKey}`;
  }

  protected getDefaultMaxTokens(): number {
    return 8192;
  }
}

/**
 * LMStudio Provider - no auth by default, local server
 */
export class LMStudioProviderImpl extends OpenAICompatibleProvider {
  protected getApiEndpoint(): string {
    return `${this.config.baseUrl}/chat/completions`;
  }

  protected getModelsEndpoint(): string {
    // LM Studio lists models via tags endpoint
    return `${this.config.baseUrl}/api/tags`;
  }

  protected getAuthHeader(): string {
    // LM Studio typically doesn't require auth
    return this.config.apiKey ? `Bearer ${this.config.apiKey}` : '';
  }

  protected mapModel(m: { name: string }): ModelOption {
    return {
      id: m.name,
      name: m.name,
      supportsStreaming: true,
    };
  }
}