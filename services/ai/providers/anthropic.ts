import { AIProvider, ProviderConfig, GenerationRequest, GenerationResponse, StreamChunk, ModelOption } from '../types';
import { fetchWithTimeout, TIMEOUT_TEST_CONNECTION, TIMEOUT_GENERATE } from '../utils/fetchWithTimeout';
import { prepareJsonRequest } from '../utils/jsonOutput';
import { throwIfNotOk } from '../utils/errorHandling';
import { processSSEStream } from '../utils/streamParser';
import { parseToolArguments } from '../utils/toolUtils';

// Anthropic API content types for multimodal messages
type AnthropicContentPart =
  | { type: 'text'; text: string }
  | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } }
  | { type: 'tool_result'; tool_use_id: string; content: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown };

// Anthropic API message interface (only user/assistant, system is separate parameter)
interface AnthropicMessage {
  role: 'user' | 'assistant';
  content: string | AnthropicContentPart[];
}

// Anthropic API request body
interface AnthropicRequestBody {
  model: string;
  messages: AnthropicMessage[];
  max_tokens: number;
  temperature: number;
  stream?: boolean;
  system?: string;
  output_format?: {
    type: 'json_schema';
    schema: Record<string, unknown>;
  };
  tools?: Array<{
    name: string;
    description?: string;
    input_schema: Record<string, unknown>;
  }>;
}

export class AnthropicProvider implements AIProvider {
  readonly config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      // BUG-010 fix: Add timeout to prevent indefinite hanging
      const response = await fetchWithTimeout(`${this.config.baseUrl}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.config.apiKey || '',
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify({
          model: this.config.defaultModel,
          max_tokens: 10,
          messages: [{ role: 'user', content: 'Hi' }]
        }),
        timeout: TIMEOUT_TEST_CONNECTION,
      });
      // Use centralized error handling
      await throwIfNotOk(response, 'anthropic');
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Connection failed' };
    }
  }

  async listModels(): Promise<ModelOption[]> {
    // Anthropic doesn't have a public list endpoint - return config models or default
    if (this.config.models.length > 0) {
      return this.config.models;
    }
    return [{
      id: this.config.defaultModel,
      name: this.config.defaultModel,
      description: 'Anthropic model',
      supportsVision: true,
      supportsStreaming: true,
      contextWindow: 200000,
    }];
  }

  async generate(request: GenerationRequest, model: string): Promise<GenerationResponse> {
    const messages: AnthropicMessage[] = [];

    // Use unified JSON output handling
    // Checks schema compatibility (dynamic keys require fallback to prompt guidance)
    const jsonRequest = request.responseFormat === 'json'
      ? prepareJsonRequest('anthropic', request.systemInstruction || '', request.responseSchema)
      : null;

    // Add conversation history if present
    if (request.conversationHistory && request.conversationHistory.length > 0) {
      for (const msg of request.conversationHistory) {
        // Anthropic doesn't support 'system' role in messages array (it uses 'system' param)
        if (msg.role === 'system') continue;
        messages.push({
          role: msg.role,
          content: msg.content
        });
      }
    }

    // Build user message content
    const content: AnthropicContentPart[] = [];

    if (request.images) {
      for (const img of request.images) {
        content.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: img.mimeType,
            data: img.data,
          }
        });
      }
    }

    content.push({ type: 'text', text: request.prompt });
    messages.push({ role: 'user', content });

    const body: AnthropicRequestBody = {
      model,
      messages,
      max_tokens: request.maxTokens || 4096,
      temperature: request.temperature ?? 0.7,
    };

    // System instruction (may include schema guidance for fallback)
    const systemContent = jsonRequest?.systemInstruction ?? request.systemInstruction;
    if (systemContent) {
      body.system = systemContent;
    }

    // Use native structured output only for compatible schemas (no dynamic keys)
    if (jsonRequest?.useNativeSchema && request.responseSchema) {
      body.output_format = {
        type: 'json_schema',
        schema: request.responseSchema
      };
    }

    // Add tools if provided
    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools.map(t => ({
        name: t.name,
        description: t.description || '',
        input_schema: t.parameters || { type: 'object', properties: {} },
      }));
    }

    // BUG-010 fix: Add timeout to prevent indefinite hanging
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': this.config.apiKey || '',
      'anthropic-version': '2023-06-01',
      ...this.config.headers,
    };

    // Add beta header for structured outputs
    if (jsonRequest?.useNativeSchema) {
      headers['anthropic-beta'] = 'structured-outputs-2025-11-13';
    }

    const response = await fetchWithTimeout(`${this.config.baseUrl}/v1/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      timeout: TIMEOUT_GENERATE,
    });

    // Use centralized error handling
    await throwIfNotOk(response, 'anthropic');

    const data = await response.json();

    // Handle tool use content blocks with agentic loop
    const initialToolUseBlocks: Array<{ id: string; name: string; input: unknown }> =
      (data.content || []).filter((c: { type: string }) => c.type === 'tool_use') as Array<{ id: string; name: string; input: unknown }>;
    if (initialToolUseBlocks.length > 0 && request.toolExecutor) {
      const MAX_TOOL_ITERATIONS = 8;
      const filesWritten: string[] = [];
      let currentToolUseBlocks: Array<{ id: string; name: string; input: unknown }> = initialToolUseBlocks;
      let lastAssistantContent: AnthropicContentPart[] = (data.content || []) as AnthropicContentPart[];
      let lastFollowUpData: { content?: Array<{ type: string; text?: string }>; stop_reason?: string; usage?: { input_tokens?: number; output_tokens?: number } } = data;

      for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
        const toolResults: Array<{ type: 'tool_result'; tool_use_id: string; content: string }> = [];

        for (const toolBlock of currentToolUseBlocks) {
          try {
            const args = parseToolArguments(typeof toolBlock.input === 'string' ? toolBlock.input : JSON.stringify(toolBlock.input || {}));
            const result = await request.toolExecutor(toolBlock.name, args);

            if (result.success && result.filesWritten) {
              filesWritten.push(...result.filesWritten);
            }

            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolBlock.id,
              content: result.success
                ? JSON.stringify(result.result || { success: true })
                : `Tool "${toolBlock.name}" failed: ${result.error || 'Unknown error'}`,
            });
          } catch (error) {
            console.error('[AnthropicProvider] Tool execution threw:', toolBlock.name, error);
            toolResults.push({
              type: 'tool_result',
              tool_use_id: toolBlock.id,
              content: `Tool "${toolBlock.name}" failed: ${error instanceof Error ? error.message : String(error)}`,
            });
          }
        }

        // Append assistant turn (with tool_use blocks) and tool_result turn
        messages.push({ role: 'assistant', content: lastAssistantContent });
        messages.push({ role: 'user', content: toolResults });

        // Follow-up — keep tools so model can keep calling them
        const followUpBody: AnthropicRequestBody = {
          model,
          messages,
          max_tokens: request.maxTokens || 4096,
          temperature: request.temperature ?? 0.7,
        };
        if (systemContent) {
          followUpBody.system = systemContent;
        }
        if (request.tools && request.tools.length > 0) {
          followUpBody.tools = request.tools.map(t => ({
            name: t.name,
            description: t.description || '',
            input_schema: t.parameters || { type: 'object', properties: {} },
          }));
        }

        const followUpResponse = await fetchWithTimeout(`${this.config.baseUrl}/v1/messages`, {
          method: 'POST',
          headers,
          body: JSON.stringify(followUpBody),
          timeout: TIMEOUT_GENERATE,
        });

        await throwIfNotOk(followUpResponse, 'anthropic');
        lastFollowUpData = await followUpResponse.json();
        lastAssistantContent = (lastFollowUpData.content || []) as AnthropicContentPart[];

        const nextToolUseBlocks = (lastFollowUpData.content || []).filter((c: { type: string }) => c.type === 'tool_use') as unknown as Array<{ id: string; name: string; input: unknown }>;
        if (nextToolUseBlocks.length === 0) {
          break;
        }
        currentToolUseBlocks = nextToolUseBlocks;

        if (iter === MAX_TOOL_ITERATIONS - 1) {
          console.warn(`[AnthropicProvider] Tool-call loop hit MAX_TOOL_ITERATIONS=${MAX_TOOL_ITERATIONS}, stopping.`);
        }
      }

      const followUpTextContent = (lastFollowUpData.content || []).find((c: { type: string; text?: string }) => c.type === 'text');

      return {
        text: followUpTextContent?.text || '',
        finishReason: lastFollowUpData.stop_reason,
        usage: {
          inputTokens: lastFollowUpData.usage?.input_tokens || data.usage?.input_tokens,
          outputTokens: lastFollowUpData.usage?.output_tokens || data.usage?.output_tokens,
        },
        filesWritten: filesWritten.length > 0 ? filesWritten : undefined,
      };
    }

    const textContent = data.content?.find((c: { type: string; text?: string }) => c.type === 'text');

    return {
      text: textContent?.text || '',
      finishReason: data.stop_reason,
      usage: {
        inputTokens: data.usage?.input_tokens,
        outputTokens: data.usage?.output_tokens,
      }
    };
  }

  async generateStream(
    request: GenerationRequest,
    model: string,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<GenerationResponse> {
    const messages: AnthropicMessage[] = [];

    // Use unified JSON output handling
    // Checks schema compatibility (dynamic keys require fallback to prompt guidance)
    const jsonRequest = request.responseFormat === 'json'
      ? prepareJsonRequest('anthropic', request.systemInstruction || '', request.responseSchema)
      : null;

    // Add conversation history if present
    if (request.conversationHistory && request.conversationHistory.length > 0) {
      for (const msg of request.conversationHistory) {
        // Anthropic doesn't support 'system' role in messages array (it uses 'system' param)
        if (msg.role === 'system') continue;
        messages.push({
          role: msg.role,
          content: msg.content
        });
      }
    }

    const content: AnthropicContentPart[] = [];

    if (request.images) {
      for (const img of request.images) {
        content.push({
          type: 'image',
          source: {
            type: 'base64',
            media_type: img.mimeType,
            data: img.data,
          }
        });
      }
    }

    content.push({ type: 'text', text: request.prompt });
    messages.push({ role: 'user', content });

    const body: AnthropicRequestBody = {
      model,
      messages,
      max_tokens: request.maxTokens || 4096,
      temperature: request.temperature ?? 0.7,
      stream: true,
    };

    // System instruction (may include schema guidance for fallback)
    const systemContent = jsonRequest?.systemInstruction ?? request.systemInstruction;
    if (systemContent) {
      body.system = systemContent;
    }

    // Use native structured output only for compatible schemas (no dynamic keys)
    if (jsonRequest?.useNativeSchema && request.responseSchema) {
      body.output_format = {
        type: 'json_schema',
        schema: request.responseSchema
      };
    }

    // Add tools if provided
    if (request.tools && request.tools.length > 0) {
      body.tools = request.tools.map(t => ({
        name: t.name,
        description: t.description || '',
        input_schema: t.parameters || { type: 'object', properties: {} },
      }));
    }

    // BUG-010 fix: Add timeout to prevent indefinite hanging
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'x-api-key': this.config.apiKey || '',
      'anthropic-version': '2023-06-01',
      ...this.config.headers,
    };

    // Add beta header for structured outputs
    if (jsonRequest?.useNativeSchema) {
      headers['anthropic-beta'] = 'structured-outputs-2025-11-13';
    }

    const response = await fetchWithTimeout(`${this.config.baseUrl}/v1/messages`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      timeout: TIMEOUT_GENERATE,
    });

    // Use centralized error handling
    await throwIfNotOk(response, 'anthropic');

    // Check if tool calling is enabled
    const hasToolExecutor = request.toolExecutor && request.tools && request.tools.length > 0;

    if (hasToolExecutor) {
      // Process streaming with tool call detection for Anthropic
      return this.processStreamingWithTools(response, messages, model, body, request, onChunk);
    }

    // Use unified SSE stream parser (no tools)
    const { fullText } = await processSSEStream(response, {
      format: 'anthropic',
      onChunk,
    });

    return { text: fullText };
  }

  /**
   * Process streaming response with tool call detection and handling for Anthropic
   */
  private async processStreamingWithTools(
    response: Response,
    messages: AnthropicMessage[],
    model: string,
    baseBody: AnthropicRequestBody,
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
    let accumulatedToolCalls: Map<string, { name: string; arguments: string }> = new Map();
    let currentToolId: string | null = null;
    let currentToolName: string | null = null;
    let toolCallsComplete = false;

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

              // Handle text content
              if (parsed.type === 'content_block_delta') {
                const delta = parsed.delta as { type?: string; text?: string; partial_json?: string };
                if (delta.type === 'text_delta') {
                  const text = delta.text || '';
                  fullText += text;
                  onChunk({ text, done: false });
                } else if (delta.type === 'input_json_delta') {
                  // Partial JSON argument for tool call
                  if (currentToolId) {
                    const existing = accumulatedToolCalls.get(currentToolId);
                    if (existing) {
                      existing.arguments += delta.partial_json || '';
                    }
                  }
                }
              }

              // Handle tool use start
              if (parsed.type === 'content_block_start') {
                const content = parsed.content as Array<{ type?: string; name?: string; id?: string }>;
                const toolUse = content?.find(c => c.type === 'tool_use');
                if (toolUse) {
                  currentToolId = toolUse.id || `tool_${Date.now()}`;
                  currentToolName = toolUse.name || '';
                  accumulatedToolCalls.set(currentToolId, {
                    name: currentToolName,
                    arguments: '',
                  });
                }
              }

              // Handle message stop
              if (parsed.type === 'message_stop') {
                toolCallsComplete = true;
              }
            } catch {
              // Skip parse errors for partial data
            }
          }
        }
      }

      // Final chunk
      onChunk({ text: '', done: true });

      // Check if we have tool calls to execute — agentic loop
      if (accumulatedToolCalls.size > 0 && toolCallsComplete) {
        console.log('[AnthropicProvider] Tool calls detected:', accumulatedToolCalls.size);

        const MAX_TOOL_ITERATIONS = 8;
        const filesWritten: string[] = [];

        // Build initial assistant turn from streamed tool_use blocks
        let lastAssistantContent: AnthropicContentPart[] = Array.from(accumulatedToolCalls.entries()).map(([id, tc]) => ({
          type: 'tool_use' as const,
          id,
          name: tc.name,
          input: parseToolArguments(tc.arguments),
        }));
        let currentToolCalls: Array<[string, { name: string; arguments: string }]> = Array.from(accumulatedToolCalls.entries());
        let lastFollowUpData: { content?: Array<{ type: string; text?: string; id?: string; name?: string; input?: unknown }>; stop_reason?: string; usage?: { input_tokens?: number; output_tokens?: number } } = {};

        for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
          const toolResults: AnthropicContentPart[] = [];

          for (const [toolId, toolCall] of currentToolCalls) {
            try {
              const args = parseToolArguments(toolCall.arguments);
              const result = await toolExecutor(toolCall.name, args);

              if (result.success && result.filesWritten) {
                filesWritten.push(...result.filesWritten);
              }

              toolResults.push({
                type: 'tool_result',
                tool_use_id: toolId,
                content: result.success
                  ? JSON.stringify(result.result || { success: true })
                  : `Error: ${result.error || 'Unknown error'}`,
              });
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error);
              console.error('[AnthropicProvider] Tool execution threw:', toolCall.name, errorMessage);
              toolResults.push({
                type: 'tool_result',
                tool_use_id: toolId,
                content: `Error: ${errorMessage}`,
              });
            }
          }

          messages.push({ role: 'assistant', content: lastAssistantContent });
          messages.push({ role: 'user', content: toolResults });

          // Follow-up — keep tools so model can continue calling them
          const followUpBody: AnthropicRequestBody = {
            ...baseBody,
            model,
            messages,
            stream: false,
          };
          delete followUpBody.stream;

          const followUpResponse = await fetchWithTimeout(`${this.config.baseUrl}/v1/messages`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'x-api-key': this.config.apiKey || '',
              'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify(followUpBody),
            timeout: TIMEOUT_GENERATE,
          });

          await throwIfNotOk(followUpResponse, 'anthropic');
          lastFollowUpData = await followUpResponse.json();
          lastAssistantContent = (lastFollowUpData.content || []) as AnthropicContentPart[];

          const nextToolUse = (lastFollowUpData.content || []).filter((c: { type: string }) => c.type === 'tool_use') as Array<{ id: string; name: string; input: unknown }>;
          if (nextToolUse.length === 0) break;

          currentToolCalls = nextToolUse.map(t => [t.id, {
            name: t.name,
            arguments: typeof t.input === 'string' ? t.input : JSON.stringify(t.input ?? {}),
          }]);

          if (iter === MAX_TOOL_ITERATIONS - 1) {
            console.warn(`[AnthropicProvider] Tool-call loop hit MAX_TOOL_ITERATIONS=${MAX_TOOL_ITERATIONS}, stopping.`);
          }
        }

        const followUpTextContent = (lastFollowUpData.content || []).find((c: { type: string; text?: string }) => c.type === 'text');

        return {
          text: followUpTextContent?.text || '',
          finishReason: lastFollowUpData.stop_reason,
          usage: {
            inputTokens: lastFollowUpData.usage?.input_tokens,
            outputTokens: lastFollowUpData.usage?.output_tokens,
          },
          filesWritten: filesWritten.length > 0 ? filesWritten : undefined,
        };
      }

      // No tool calls, return accumulated text
      return { text: fullText };
    } finally {
      reader.releaseLock();
    }
  }
}
