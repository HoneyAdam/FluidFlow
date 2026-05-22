import OpenAI from 'openai';
import { AIProvider, ProviderConfig, GenerationRequest, GenerationResponse, StreamChunk, ModelOption } from '../types';
import { prepareJsonRequest } from '../utils/jsonOutput';
import { createToolCallHandler } from '../utils/ToolCallHandler';
import type { ChatMessage } from '../utils/ToolCallHandler';

// Z.AI Coding API endpoint (for GLM-4.7 coding plan)
const ZAI_CODING_BASE_URL = 'https://api.z.ai/api/coding/paas/v4';

// Default model
const DEFAULT_MODEL = 'glm-4.7';

// Max output tokens (128K supported)
const DEFAULT_MAX_TOKENS = 131072; // 128K for GLM-4.7

// Maximum agentic tool-call iterations after the initial call
const MAX_TOOL_ITERATIONS = 8;

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
    } catch (e) {
      console.debug('[ZaiProvider] listModels failed, falling back to config:', e instanceof Error ? e.message : e);
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
      // Force tool calling when tools are provided - use 'required' to demand tool calls
      tool_choice: request.tools && request.tools.length > 0 ? 'required' : undefined,
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
    }

    try {
      const completion = await this.client.chat.completions.create(requestParams);

      // Handle tool calls using ToolCallHandler with agentic loop
      const initialToolCalls = completion.choices[0]?.message?.tool_calls;
      if (initialToolCalls && initialToolCalls.length > 0 && request.toolExecutor) {
        const allFilesWritten: string[] = [];
        let currentMessages: ChatMessage[] = messages.map(m => ({
          role: m.role as 'system' | 'user' | 'assistant' | 'tool',
          content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        }));

        // Seed loop state from the initial response
        let pendingToolCalls = initialToolCalls;
        let lastUsage = completion.usage;
        let lastFinishReason: string | undefined = completion.choices[0]?.finish_reason || undefined;
        let lastContent = '';

        for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
          const toolCallHandler = createToolCallHandler();
          for (const tc of pendingToolCalls) {
            if ('function' in tc) {
              toolCallHandler.accumulate({
                choices: [{
                  delta: {
                    tool_calls: [{
                      id: tc.id,
                      function: {
                        name: (tc as { function?: { name?: string } }).function?.name || '',
                        arguments: (tc as { function?: { arguments?: string } }).function?.arguments || '{}',
                      },
                    }],
                  },
                  finish_reason: 'tool_calls',
                }],
              });
            }
          }

          const assistantMessage = toolCallHandler.buildAssistantMessage();
          if (!assistantMessage) {
            throw new Error('Failed to build assistant message for tool calls');
          }

          const execResult = await toolCallHandler.execute(request.toolExecutor, `zai-non-stream-iter-${iter}`);
          allFilesWritten.push(...execResult.filesWritten);

          currentMessages = toolCallHandler.buildFollowUpMessages(
            currentMessages,
            assistantMessage,
            execResult.messages
          );

          const followUpParams: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
            model: model || this.config.defaultModel || DEFAULT_MODEL,
            messages: currentMessages as OpenAI.Chat.ChatCompletionMessageParam[],
            max_tokens: request.maxTokens || DEFAULT_MAX_TOKENS,
            temperature: request.temperature ?? 0.7,
          };

          if (requestParams.tools && requestParams.tools.length > 0) {
            followUpParams.tools = requestParams.tools;
            followUpParams.tool_choice = 'auto';
          }

          const followUp = await this.client.chat.completions.create(followUpParams);
          lastUsage = followUp.usage || lastUsage;
          lastFinishReason = followUp.choices[0]?.finish_reason || lastFinishReason;
          lastContent = followUp.choices[0]?.message?.content || '';
          const nextToolCalls = followUp.choices[0]?.message?.tool_calls;

          if (!nextToolCalls || nextToolCalls.length === 0) {
            break;
          }

          pendingToolCalls = nextToolCalls;
          if (iter === MAX_TOOL_ITERATIONS - 1) {
            console.warn(`[ZAI] Tool-call loop hit MAX_TOOL_ITERATIONS=${MAX_TOOL_ITERATIONS}, stopping.`);
          }
        }

        return {
          text: lastContent,
          finishReason: lastFinishReason,
          usage: {
            inputTokens: lastUsage?.prompt_tokens || completion.usage?.prompt_tokens,
            outputTokens: lastUsage?.completion_tokens || completion.usage?.completion_tokens,
          },
          filesWritten: allFilesWritten.length > 0 ? allFilesWritten : undefined,
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
      throw new Error(`ZAI API error: ${message}`, { cause: error });
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
      // Force tool calling when tools are provided - use 'required' to demand tool calls
      tool_choice: request.tools && request.tools.length > 0 ? 'required' : undefined,
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
    }

    try {
      const stream = await this.client.chat.completions.create(requestParams);

      // Use unified tool call handler
      const toolCallHandler = createToolCallHandler();
      let fullText = '';
      let usage: GenerationResponse['usage'];

      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        const content = delta?.content || '';

        // Accumulate tool calls using unified handler
        toolCallHandler.accumulate(chunk as unknown as Parameters<typeof toolCallHandler.accumulate>[0]);

        if (content) {
          fullText += content;
          onChunk({ text: content, done: false });
        }

        // Capture usage if available
        if (chunk.usage) {
          usage = {
            inputTokens: chunk.usage.prompt_tokens,
            outputTokens: chunk.usage.completion_tokens,
          };
        }
      }

      // Final chunk
      onChunk({ text: '', done: true });

      // Handle tool calls with agentic loop
      if (toolCallHandler.isReadyForExecution() && request.toolExecutor) {
        const initialAssistantMessage = toolCallHandler.buildAssistantMessage();

        if (!initialAssistantMessage) {
          console.error('[ZAI] Failed to build assistant message for tool calls');
          throw new Error('Tool call handling failed: no assistant message');
        }

        // Execute first batch from the stream
        const initialExec = await toolCallHandler.execute(request.toolExecutor, 'zai-stream-iter-0');
        const allFilesWritten: string[] = [...initialExec.filesWritten];

        // Build initial follow-up messages
        let currentMessages: ChatMessage[] = messages.map(m => ({
          role: m.role as 'system' | 'user' | 'assistant' | 'tool',
          content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
        }));
        currentMessages = toolCallHandler.buildFollowUpMessages(
          currentMessages,
          initialAssistantMessage,
          initialExec.messages
        );

        let lastUsage = usage;
        let lastFinishReason: string | undefined = toolCallHandler.getFinishReason();
        let lastContent = '';

        for (let iter = 1; iter <= MAX_TOOL_ITERATIONS; iter++) {
          const followUpParams: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
            model: model || this.config.defaultModel || DEFAULT_MODEL,
            messages: currentMessages as OpenAI.Chat.ChatCompletionMessageParam[],
            max_tokens: request.maxTokens || DEFAULT_MAX_TOKENS,
            temperature: request.temperature ?? 0.7,
          };

          if (requestParams.tools && requestParams.tools.length > 0) {
            followUpParams.tools = requestParams.tools;
            followUpParams.tool_choice = 'auto';
          }

          const followUp = await this.client.chat.completions.create(followUpParams);
          lastUsage = {
            inputTokens: followUp.usage?.prompt_tokens || lastUsage?.inputTokens,
            outputTokens: followUp.usage?.completion_tokens || lastUsage?.outputTokens,
          };
          lastFinishReason = followUp.choices[0]?.finish_reason || lastFinishReason;
          lastContent = followUp.choices[0]?.message?.content || '';
          const nextToolCalls = followUp.choices[0]?.message?.tool_calls;

          if (!nextToolCalls || nextToolCalls.length === 0) {
            break;
          }

          // Build a handler for the next batch
          const nextHandler = createToolCallHandler();
          for (const tc of nextToolCalls) {
            if ('function' in tc) {
              nextHandler.accumulate({
                choices: [{
                  delta: {
                    tool_calls: [{
                      id: tc.id,
                      function: {
                        name: (tc as { function?: { name?: string } }).function?.name || '',
                        arguments: (tc as { function?: { arguments?: string } }).function?.arguments || '{}',
                      },
                    }],
                  },
                  finish_reason: 'tool_calls',
                }],
              });
            }
          }

          const nextAssistantMessage = nextHandler.buildAssistantMessage();
          if (!nextAssistantMessage) break;

          const nextExec = await nextHandler.execute(request.toolExecutor, `zai-stream-iter-${iter}`);
          allFilesWritten.push(...nextExec.filesWritten);

          currentMessages = nextHandler.buildFollowUpMessages(
            currentMessages,
            nextAssistantMessage,
            nextExec.messages
          );

          if (iter === MAX_TOOL_ITERATIONS) {
            console.warn(`[ZAI] Tool-call loop hit MAX_TOOL_ITERATIONS=${MAX_TOOL_ITERATIONS}, stopping.`);
          }
        }

        if (!lastContent && allFilesWritten.length === 0) {
          console.warn('[ZAI] Tool calling completed but no follow-up content and no files written.');
        }

        return {
          text: lastContent,
          finishReason: lastFinishReason,
          usage: lastUsage,
          filesWritten: allFilesWritten.length > 0 ? allFilesWritten : undefined,
        };
      }

      // No tool calls - return normal response
      return { text: fullText, finishReason: toolCallHandler.getFinishReason(), usage };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[ZAI] Stream failed:', message);
      throw new Error(`ZAI API error: ${message}`, { cause: error });
    }
  }
}