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
  | { type: 'tool_result'; tool_use_id: string; content: string };

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

    // Handle tool use content blocks
    const toolUseBlocks = data.content?.filter((c: { type: string }) => c.type === 'tool_use') || [];
    if (toolUseBlocks.length > 0 && request.toolExecutor) {
      const results: Array<{ role: 'user'; content: Array<{ type: 'tool_result'; tool_use_id: string; content: string }> }> = [];
      const filesWritten: string[] = [];

      for (const toolBlock of toolUseBlocks) {
        try {
          const args = parseToolArguments(toolBlock.input || '{}');
          const result = await request.toolExecutor(toolBlock.name, args);

          if (result.success && result.filesWritten) {
            filesWritten.push(...result.filesWritten);
          }

          results.push({
            role: 'user',
            content: [{
              type: 'tool_result',
              tool_use_id: toolBlock.id,
              content: result.success
                ? JSON.stringify(result.result || { success: true })
                : `Tool "${toolBlock.name}" failed: ${result.error || 'Unknown error'}`,
            }]
          });
        } catch (error) {
          results.push({
            role: 'user',
            content: [{
              type: 'tool_result',
              tool_use_id: toolBlock.id,
              content: `Tool "${toolBlock.name}" failed: ${error instanceof Error ? error.message : String(error)}`,
            }]
          });
        }
      }

      // Continue conversation with tool results
      messages.push(...results);

      // Make follow-up request
      const followUpBody: AnthropicRequestBody = {
        model,
        messages,
        max_tokens: request.maxTokens || 4096,
        temperature: request.temperature ?? 0.7,
      };
      if (systemContent) {
        followUpBody.system = systemContent;
      }

      const followUpResponse = await fetchWithTimeout(`${this.config.baseUrl}/v1/messages`, {
        method: 'POST',
        headers,
        body: JSON.stringify(followUpBody),
        timeout: TIMEOUT_GENERATE,
      });

      await throwIfNotOk(followUpResponse, 'anthropic');
      const followUpData = await followUpResponse.json();
      const followUpTextContent = followUpData.content?.find((c: { type: string; text?: string }) => c.type === 'text');

      return {
        text: followUpTextContent?.text || '',
        finishReason: followUpData.stop_reason,
        usage: {
          inputTokens: followUpData.usage?.input_tokens || data.usage?.input_tokens,
          outputTokens: followUpData.usage?.output_tokens || data.usage?.output_tokens,
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

    // Use unified SSE stream parser
    const { fullText } = await processSSEStream(response, {
      format: 'anthropic',
      onChunk,
    });

    return { text: fullText };
  }
}
