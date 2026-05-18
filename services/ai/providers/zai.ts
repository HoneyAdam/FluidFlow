import OpenAI from 'openai';
import { AIProvider, ProviderConfig, GenerationRequest, GenerationResponse, StreamChunk, ModelOption } from '../types';
import { prepareJsonRequest } from '../utils/jsonOutput';
import { parseToolArguments } from '../utils/toolUtils';

// Z.AI Coding API endpoint (for GLM-4.7 coding plan)
const ZAI_CODING_BASE_URL = 'https://api.z.ai/api/coding/paas/v4';

// Default model
const DEFAULT_MODEL = 'glm-4.7';

// Max output tokens (128K supported)
const DEFAULT_MAX_TOKENS = 131072; // 128K for GLM-4.7

export class ZAIProvider implements AIProvider {
  readonly config: ProviderConfig;
  private client: OpenAI;

  constructor(config: ProviderConfig) {
    this.config = config;

    // Use coding endpoint for GLM-4.7
    const baseURL = config.baseUrl || ZAI_CODING_BASE_URL;

    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL,
      dangerouslyAllowBrowser: true, // Required for browser environment
    });
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const completion = await this.client.chat.completions.create({
        model: this.config.defaultModel || DEFAULT_MODEL,
        messages: [{ role: 'user', content: 'Test' }],
        max_tokens: 10,
      });

      return completion.choices[0] ? { success: true } : { success: false, error: 'No response' };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[ZAI] Connection test failed:', message);
      return { success: false, error: message };
    }
  }

  async listModels(): Promise<ModelOption[]> {
    try {
      const models = await this.client.models.list();
      return models.data.map(m => ({
        id: m.id,
        name: m.id,
        supportsStreaming: true,
      }));
    } catch {
      // Fallback to config models if API fails
      return this.config.models.length > 0 ? this.config.models : [{
        id: DEFAULT_MODEL,
        name: 'GLM-4.7',
        description: 'Latest flagship',
        supportsVision: true,
        supportsStreaming: true,
        contextWindow: 200000,
      }];
    }
  }

  async generate(request: GenerationRequest, model: string): Promise<GenerationResponse> {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    // Use unified JSON output handling
    const jsonRequest = request.responseFormat === 'json'
      ? prepareJsonRequest('zai', request.systemInstruction || '', request.responseSchema)
      : null;

    const systemContent = jsonRequest?.systemInstruction ?? request.systemInstruction ?? '';

    if (systemContent) {
      messages.push({ role: 'system', content: systemContent });
    }

    // Add conversation history if present
    if (request.conversationHistory && request.conversationHistory.length > 0) {
      for (const msg of request.conversationHistory) {
        messages.push({
          role: msg.role,
          content: msg.content
        });
      }
    }

    messages.push({ role: 'user', content: request.prompt });

    const requestParams: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
      model: model || this.config.defaultModel || DEFAULT_MODEL,
      messages,
      max_tokens: request.maxTokens || DEFAULT_MAX_TOKENS,
      temperature: request.temperature ?? 0.7,
    };

    // Z.AI supports json_object mode
    if (request.responseFormat === 'json' && jsonRequest?.useJsonObject) {
      requestParams.response_format = { type: 'json_object' };
    }

    // Add tools if provided
    if (request.tools && request.tools.length > 0) {
      requestParams.tools = request.tools.map(t => ({
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.description || '',
          parameters: t.parameters || { type: 'object', properties: {} },
        },
      }));
      // Note: tool_choice is set automatically by the SDK when tools are provided
    }

    try {
      const completion = await this.client.chat.completions.create(requestParams);

      // Handle tool calls
      const toolCalls = completion.choices[0]?.message?.tool_calls;
      if (toolCalls && toolCalls.length > 0 && request.toolExecutor) {
        const results: Array<{ role: 'tool'; tool_call_id: string; content: string }> = [];
        const filesWritten: string[] = [];

        for (const toolCall of toolCalls) {
          // Only handle function tool calls
          if (!('function' in toolCall)) continue;

          try {
            const args = parseToolArguments(toolCall.function.arguments);
            const result = await request.toolExecutor(toolCall.function.name, args);

            if (result.success && result.filesWritten) {
              filesWritten.push(...result.filesWritten);
            }

            results.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: result.success
                ? JSON.stringify(result.result || { success: true })
                : `Tool "${toolCall.function.name}" failed: ${result.error || 'Unknown error'}`,
            });
          } catch (error) {
            results.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: `Tool "${toolCall.function.name}" failed: ${error instanceof Error ? error.message : String(error)}`,
            });
          }
        }

        // Continue conversation with tool results
        const assistantMessage = completion.choices[0]?.message;
        messages.push(assistantMessage);
        messages.push(...results);

        // Make follow-up request
        const followUp = await this.client.chat.completions.create({
          model: model || this.config.defaultModel || DEFAULT_MODEL,
          messages,
          max_tokens: request.maxTokens || DEFAULT_MAX_TOKENS,
          temperature: request.temperature ?? 0.7,
        });

        return {
          text: followUp.choices[0]?.message?.content || '',
          finishReason: followUp.choices[0]?.finish_reason || undefined,
          usage: {
            inputTokens: followUp.usage?.prompt_tokens || completion.usage?.prompt_tokens,
            outputTokens: followUp.usage?.completion_tokens || completion.usage?.completion_tokens,
          },
          filesWritten: filesWritten.length > 0 ? filesWritten : undefined,
        };
      }

      return {
        text: completion.choices[0]?.message?.content || '',
        finishReason: completion.choices[0]?.finish_reason || undefined,
        usage: {
          inputTokens: completion.usage?.prompt_tokens,
          outputTokens: completion.usage?.completion_tokens,
        }
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[ZAI] Generate failed:', message);
      throw new Error(`ZAI API error: ${message}`);
    }
  }

  async generateStream(
    request: GenerationRequest,
    model: string,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<GenerationResponse> {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    // Use unified JSON output handling
    const jsonRequest = request.responseFormat === 'json'
      ? prepareJsonRequest('zai', request.systemInstruction || '', request.responseSchema)
      : null;

    const systemContent = jsonRequest?.systemInstruction ?? request.systemInstruction ?? '';

    if (systemContent) {
      messages.push({ role: 'system', content: systemContent });
    }

    // Add conversation history if present
    if (request.conversationHistory && request.conversationHistory.length > 0) {
      for (const msg of request.conversationHistory) {
        messages.push({
          role: msg.role,
          content: msg.content
        });
      }
    }

    messages.push({ role: 'user', content: request.prompt });

    const requestParams: OpenAI.Chat.ChatCompletionCreateParamsStreaming = {
      model: model || this.config.defaultModel || DEFAULT_MODEL,
      messages,
      max_tokens: request.maxTokens || DEFAULT_MAX_TOKENS,
      temperature: request.temperature ?? 0.7,
      stream: true,
    };

    // Z.AI supports json_object mode
    if (request.responseFormat === 'json' && jsonRequest?.useJsonObject) {
      requestParams.response_format = { type: 'json_object' };
    }

    // Add tools if provided (for streaming, tool calls come at the end)
    if (request.tools && request.tools.length > 0) {
      requestParams.tools = request.tools.map(t => ({
        type: 'function' as const,
        function: {
          name: t.name,
          description: t.description || '',
          parameters: t.parameters || { type: 'object', properties: {} },
        },
      }));
      // Note: tool_choice is set automatically by the SDK when tools are provided
    }

    try {
      const stream = await this.client.chat.completions.create(requestParams);

      let fullText = '';
      let finishReason: string | undefined;
      let usage: GenerationResponse['usage'];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const toolCalls: any[] = [];
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let assistantMessage: any = null;

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        const content = delta?.content || '';

        // Collect tool calls if present
        if (delta?.tool_calls && delta.tool_calls.length > 0) {
          toolCalls.push(...delta.tool_calls);
        }

        // Capture assistant message reference
        if (chunk.choices[0]?.finish_reason === 'tool_calls' && !assistantMessage) {
          // Build full assistant message from accumulated data
          assistantMessage = {
            role: 'assistant',
            content: null,
            tool_calls: toolCalls,
          };
        }

        if (content) {
          fullText += content;
          onChunk({ text: content, done: false });
        }

        // Capture finish reason
        if (chunk.choices[0]?.finish_reason) {
          finishReason = chunk.choices[0].finish_reason;
        }

        // Capture usage if available
        if (chunk.usage) {
          usage = {
            inputTokens: chunk.usage.prompt_tokens,
            outputTokens: chunk.usage.completion_tokens,
          };
        }
      }

      // Handle tool calls
      if (toolCalls.length > 0 && request.toolExecutor && assistantMessage) {
        const results: Array<{ role: 'tool'; tool_call_id: string; content: string }> = [];
        const filesWritten: string[] = [];

        for (const toolCall of toolCalls) {
          // Only handle function tool calls
          if (!('function' in toolCall)) continue;

          try {
            const args = parseToolArguments(toolCall.function.arguments);
            const result = await request.toolExecutor(toolCall.function.name, args);

            if (result.success && result.filesWritten) {
              filesWritten.push(...result.filesWritten);
            }

            results.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: result.success
                ? JSON.stringify(result.result || { success: true })
                : `Tool "${toolCall.function.name}" failed: ${result.error || 'Unknown error'}`,
            });
          } catch (error) {
            results.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: `Tool "${toolCall.function.name}" failed: ${error instanceof Error ? error.message : String(error)}`,
            });
          }
        }

        // Add assistant message and tool results to messages
        messages.push(assistantMessage);
        messages.push(...results);

        // Send final chunk with done: true
        onChunk({ text: '', done: true });

        // Make follow-up request for final response (non-streaming)
        const followUp = await this.client.chat.completions.create({
          model: model || this.config.defaultModel || DEFAULT_MODEL,
          messages,
          max_tokens: request.maxTokens || DEFAULT_MAX_TOKENS,
          temperature: request.temperature ?? 0.7,
        });

        const followUpText = followUp.choices[0]?.message?.content || '';

        onChunk({ text: '', done: true });

        return {
          text: followUpText,
          finishReason: followUp.choices[0]?.finish_reason || undefined,
          usage: {
            inputTokens: followUp.usage?.prompt_tokens || usage?.inputTokens,
            outputTokens: followUp.usage?.completion_tokens || usage?.outputTokens,
          },
          filesWritten: filesWritten.length > 0 ? filesWritten : undefined,
        };
      }

      // Check if response appears to be incomplete (ZAI truncation detection)
      const trimmed = fullText.trim();
      const isIncomplete =
        (trimmed.endsWith('```') && !trimmed.includes('```tsx') && !trimmed.includes('```jsx')) ||
        (trimmed.endsWith('"') && !trimmed.endsWith('"}') && !trimmed.endsWith('"}\n')) ||
        (trimmed.includes('className=\\') && !trimmed.endsWith('}')) ||
        (trimmed.startsWith('{') && trimmed.split('{').length > trimmed.split('}').length);

      if (isIncomplete) {
        console.warn('[ZAI] Response appears to be truncated');
      }

      // Send final chunk with done: true
      onChunk({ text: '', done: true });

      return { text: fullText, finishReason, usage };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[ZAI] Stream failed:', message);
      throw new Error(`ZAI API error: ${message}`);
    }
  }
}
