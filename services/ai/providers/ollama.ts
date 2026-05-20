import { AIProvider, ProviderConfig, GenerationRequest, GenerationResponse, StreamChunk, ModelOption } from '../types';
import { fetchWithTimeout, TIMEOUT_TEST_CONNECTION, TIMEOUT_GENERATE, TIMEOUT_LIST_MODELS } from '../utils/fetchWithTimeout';
import { throwIfNotOk } from '../utils/errorHandling';
import { processSSEStream } from '../utils/streamParser';
import { parseToolArguments } from '../utils/toolUtils';

// Ollama API request interface for /api/generate
interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  stream: boolean;
  system?: string;
  images?: string[];
  options?: {
    temperature?: number;
    num_predict?: number;
  };
}

// Ollama API request interface for /api/chat (supports tool calling)
interface OllamaChatRequest {
  model: string;
  messages: OllamaChatMessage[];
  stream: boolean;
  tools?: OllamaTool[];
  options?: {
    temperature?: number;
    num_predict?: number;
  };
}

interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  images?: string[];
}

interface OllamaTool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
}

// Ollama model info
interface OllamaModel {
  name: string;
  size: number;
}

export class OllamaProvider implements AIProvider {
  readonly config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      // BUG-010 fix: Add timeout to prevent indefinite hanging
      const response = await fetchWithTimeout(`${this.config.baseUrl}/api/tags`, {
        timeout: TIMEOUT_TEST_CONNECTION,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Connection failed. Is Ollama running?'
      };
    }
  }

  async generate(
    request: GenerationRequest,
    model: string
  ): Promise<GenerationResponse> {
    // Check if tool calling is requested - use /api/chat for that
    const hasTools = request.tools && request.tools.length > 0 && request.toolExecutor;

    if (hasTools) {
      return this.generateWithTools(request, model);
    }

    // Use /api/generate for simple requests (no tools)
    let prompt = '';

    // Include conversation history in prompt
    if (request.conversationHistory && request.conversationHistory.length > 0) {
      const historyText = request.conversationHistory
        .map(msg => `${msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'Assistant' : 'System'}: ${msg.content}`)
        .join('\n\n');
      prompt = `${historyText}\n\nUser: ${request.prompt}`;
    } else {
      prompt = request.prompt;
    }

    const body: OllamaGenerateRequest = {
      model,
      prompt,
      stream: false,
      options: {
        temperature: request.temperature ?? 0.7,
        num_predict: request.maxTokens || 4096,
      }
    };

    // Build system instruction with optional JSON schema guidance
    let systemContent = request.systemInstruction || '';
    if (request.responseFormat === 'json' && request.responseSchema) {
      const schemaInstruction = `\n\nYou MUST respond with valid JSON that follows this exact schema:\n${JSON.stringify(request.responseSchema, null, 2)}\n\nDo not include any text outside the JSON object.`;
      systemContent = systemContent ? systemContent + schemaInstruction : schemaInstruction.trim();
    }

    if (systemContent) {
      body.system = systemContent;
    }

    if (request.images && request.images.length > 0) {
      body.images = request.images.map(img => img.data);
    }

    const response = await fetchWithTimeout(`${this.config.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      timeout: TIMEOUT_GENERATE,
    });

    await throwIfNotOk(response, 'ollama');

    const data = await response.json();

    return {
      text: data.response || '',
      usage: {
        inputTokens: data.prompt_eval_count,
        outputTokens: data.eval_count,
      }
    };
  }

  /**
   * Generate with tool calling support using /api/chat endpoint
   */
  private async generateWithTools(
    request: GenerationRequest,
    model: string
  ): Promise<GenerationResponse> {
    const messages: OllamaChatMessage[] = [];

    // Add system instruction
    if (request.systemInstruction) {
      messages.push({ role: 'system', content: request.systemInstruction });
    }

    // Add conversation history
    if (request.conversationHistory && request.conversationHistory.length > 0) {
      for (const msg of request.conversationHistory) {
        if (msg.role === 'system') continue;
        messages.push({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        });
      }
    }

    // Add current prompt
    messages.push({ role: 'user', content: request.prompt });

    // Format tools for Ollama
    const tools = request.tools?.map(t => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description || '',
        parameters: t.parameters || { type: 'object', properties: {} },
      },
    })) || [];

    const body: OllamaChatRequest = {
      model,
      messages,
      stream: false,
      tools,
      options: {
        temperature: request.temperature ?? 0.7,
        num_predict: request.maxTokens || 4096,
      },
    };

    const response = await fetchWithTimeout(`${this.config.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      timeout: TIMEOUT_GENERATE,
    });

    await throwIfNotOk(response, 'ollama');

    const data = await response.json();

    // Check for tool calls — agentic loop
    const initialToolCalls = data.message?.tool_calls;
    if (initialToolCalls && initialToolCalls.length > 0 && request.toolExecutor) {
      console.log('[OllamaProvider] Tool calls detected:', initialToolCalls.length);

      const MAX_TOOL_ITERATIONS = 8;
      const filesWritten: string[] = [];
      let currentToolCalls = initialToolCalls;
      let lastAssistantMessage = data.message;
      let lastData = data;

      for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
        const toolResults: OllamaChatMessage[] = [];

        for (const tc of currentToolCalls) {
          try {
            const rawArgs = tc.function?.arguments;
            const args = typeof rawArgs === 'string' ? parseToolArguments(rawArgs) : (rawArgs ?? {});
            const result = await request.toolExecutor(tc.function?.name || tc.name || '', args);

            if (result.success && result.filesWritten) {
              filesWritten.push(...result.filesWritten);
            }

            toolResults.push({
              role: 'tool',
              content: result.success
                ? typeof result.result === 'string'
                  ? result.result
                  : JSON.stringify(result.result || { success: true })
                : `Error: ${result.error || 'Unknown error'}`,
            });
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('[OllamaProvider] Tool execution threw:', tc.function?.name, errorMessage);
            toolResults.push({
              role: 'tool',
              content: `Error: ${errorMessage}`,
            });
          }
        }

        messages.push(lastAssistantMessage);
        messages.push(...toolResults);

        // Follow-up — keep tools so model can continue calling them
        const followUpBody: OllamaChatRequest = {
          model,
          messages,
          stream: false,
          tools,
          options: {
            temperature: request.temperature ?? 0.7,
            num_predict: request.maxTokens || 4096,
          },
        };

        const followUpResponse = await fetchWithTimeout(`${this.config.baseUrl}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(followUpBody),
          timeout: TIMEOUT_GENERATE,
        });

        await throwIfNotOk(followUpResponse, 'ollama');
        lastData = await followUpResponse.json();
        lastAssistantMessage = lastData.message;

        const nextCalls = lastData.message?.tool_calls;
        if (!nextCalls || nextCalls.length === 0) break;
        currentToolCalls = nextCalls;

        if (iter === MAX_TOOL_ITERATIONS - 1) {
          console.warn(`[OllamaProvider] Tool-call loop hit MAX_TOOL_ITERATIONS=${MAX_TOOL_ITERATIONS}, stopping.`);
        }
      }

      return {
        text: lastData.message?.content || '',
        usage: {
          inputTokens: lastData.prompt_eval_count || data.prompt_eval_count,
          outputTokens: lastData.eval_count || data.eval_count,
        },
        filesWritten: filesWritten.length > 0 ? filesWritten : undefined,
      };
    }

    return {
      text: data.message?.content || '',
      usage: {
        inputTokens: data.prompt_eval_count,
        outputTokens: data.eval_count,
      },
    };
  }

  async generateStream(
    request: GenerationRequest,
    model: string,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<GenerationResponse> {
    // Check if tool calling is requested - for streaming, we still use /api/chat
    // but with stream: true and handle tool calls inline
    const hasTools = request.tools && request.tools.length > 0 && request.toolExecutor;

    if (hasTools) {
      // Use /api/chat for tool calling (supports streaming)
      return this.generateStreamWithTools(request, model, onChunk);
    }

    // Use /api/generate for simple streaming (no tools)
    let prompt = '';

    if (request.conversationHistory && request.conversationHistory.length > 0) {
      const historyText = request.conversationHistory
        .map(msg => `${msg.role === 'user' ? 'User' : msg.role === 'assistant' ? 'Assistant' : 'System'}: ${msg.content}`)
        .join('\n\n');
      prompt = `${historyText}\n\nUser: ${request.prompt}`;
    } else {
      prompt = request.prompt;
    }

    const body: OllamaGenerateRequest = {
      model,
      prompt,
      stream: true,
      options: {
        temperature: request.temperature ?? 0.7,
        num_predict: request.maxTokens || 4096,
      }
    };

    let systemContent = request.systemInstruction || '';
    if (request.responseFormat === 'json' && request.responseSchema) {
      const schemaInstruction = `\n\nYou MUST respond with valid JSON that follows this exact schema:\n${JSON.stringify(request.responseSchema, null, 2)}\n\nDo not include any text outside the JSON object.`;
      systemContent = systemContent ? systemContent + schemaInstruction : schemaInstruction.trim();
    }

    if (systemContent) {
      body.system = systemContent;
    }

    if (request.images && request.images.length > 0) {
      body.images = request.images.map(img => img.data);
    }

    const response = await fetchWithTimeout(`${this.config.baseUrl}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      timeout: TIMEOUT_GENERATE,
    });

    await throwIfNotOk(response, 'ollama');

    const { fullText } = await processSSEStream(response, {
      format: 'ollama',
      onChunk,
    });

    return { text: fullText };
  }

  /**
   * Streaming with tool calling support using /api/chat endpoint
   */
  private async generateStreamWithTools(
    request: GenerationRequest,
    model: string,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<GenerationResponse> {
    const messages: OllamaChatMessage[] = [];

    if (request.systemInstruction) {
      messages.push({ role: 'system', content: request.systemInstruction });
    }

    if (request.conversationHistory && request.conversationHistory.length > 0) {
      for (const msg of request.conversationHistory) {
        if (msg.role === 'system') continue;
        messages.push({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        });
      }
    }

    messages.push({ role: 'user', content: request.prompt });

    const tools = request.tools?.map(t => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description || '',
        parameters: t.parameters || { type: 'object', properties: {} },
      },
    })) || [];

    const body: OllamaChatRequest = {
      model,
      messages,
      stream: true,
      tools,
      options: {
        temperature: request.temperature ?? 0.7,
        num_predict: request.maxTokens || 4096,
      },
    };

    const response = await fetchWithTimeout(`${this.config.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      timeout: TIMEOUT_GENERATE,
    });

    await throwIfNotOk(response, 'ollama');

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';
    let fullText = '';
    const accumulatedToolCalls: Array<{ name: string; arguments: string }> = [];
    let hasToolCalls = false;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data:')) continue;

          const data = trimmed.slice(5).trim();
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const content = parsed.message?.content || '';
            const toolCalls = parsed.message?.tool_calls;

            if (content) {
              fullText += content;
              onChunk({ text: content, done: false });
            }

            if (toolCalls && toolCalls.length > 0) {
              hasToolCalls = true;
              for (const tc of toolCalls) {
                accumulatedToolCalls.push({
                  name: tc.function?.name || tc.name || '',
                  arguments: tc.function?.arguments || '{}',
                });
              }
            }

            if (parsed.done) {
              onChunk({ text: '', done: true });
              break;
            }
          } catch {
            // Skip parse errors
          }
        }
      }

      // Final chunk
      onChunk({ text: '', done: true });

      // If tool calls were made, execute them with agentic loop
      if (hasToolCalls && accumulatedToolCalls.length > 0 && request.toolExecutor) {
        console.log('[OllamaProvider] Streaming tool calls detected:', accumulatedToolCalls.length);

        const MAX_TOOL_ITERATIONS = 8;
        const filesWritten: string[] = [];
        let currentToolCalls: Array<{ name: string; arguments: string }> = accumulatedToolCalls;
        let lastAssistantText = fullText;
        let lastData: { message?: { content?: string; tool_calls?: Array<{ function?: { name?: string; arguments?: string | Record<string, unknown> }; name?: string }> } } = {};

        for (let iter = 0; iter < MAX_TOOL_ITERATIONS; iter++) {
          const toolResults: OllamaChatMessage[] = [];

          for (const tc of currentToolCalls) {
            try {
              const args = parseToolArguments(tc.arguments);
              const result = await request.toolExecutor(tc.name, args);

              if (result.success && result.filesWritten) {
                filesWritten.push(...result.filesWritten);
              }

              toolResults.push({
                role: 'tool',
                content: result.success
                  ? typeof result.result === 'string'
                    ? result.result
                    : JSON.stringify(result.result || { success: true })
                  : `Error: ${result.error || 'Unknown error'}`,
              });
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : String(error);
              console.error('[OllamaProvider] Streaming tool execution threw:', tc.name, errorMessage);
              toolResults.push({
                role: 'tool',
                content: `Error: ${errorMessage}`,
              });
            }
          }

          messages.push({
            role: 'assistant',
            content: lastAssistantText,
            images: [],
          });
          messages.push(...toolResults);

          const followUpBody: OllamaChatRequest = {
            model,
            messages,
            stream: false,
            tools,
            options: {
              temperature: request.temperature ?? 0.7,
              num_predict: request.maxTokens || 4096,
            },
          };

          const followUpResponse = await fetchWithTimeout(`${this.config.baseUrl}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(followUpBody),
            timeout: TIMEOUT_GENERATE,
          });

          await throwIfNotOk(followUpResponse, 'ollama');
          lastData = await followUpResponse.json();
          lastAssistantText = lastData.message?.content || '';

          const nextCalls = lastData.message?.tool_calls;
          if (!nextCalls || nextCalls.length === 0) break;

          currentToolCalls = nextCalls.map(tc => ({
            name: tc.function?.name || tc.name || '',
            arguments: typeof tc.function?.arguments === 'string' ? tc.function.arguments : JSON.stringify(tc.function?.arguments ?? {}),
          }));

          if (iter === MAX_TOOL_ITERATIONS - 1) {
            console.warn(`[OllamaProvider] Tool-call loop hit MAX_TOOL_ITERATIONS=${MAX_TOOL_ITERATIONS}, stopping.`);
          }
        }

        return {
          text: lastAssistantText,
          filesWritten: filesWritten.length > 0 ? filesWritten : undefined,
        };
      }

      return { text: fullText };
    } finally {
      reader.releaseLock();
    }
  }

  async listModels(): Promise<ModelOption[]> {
    // BUG-010 fix: Add timeout to prevent indefinite hanging
    const response = await fetchWithTimeout(`${this.config.baseUrl}/api/tags`, {
      timeout: TIMEOUT_LIST_MODELS,
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    return (data.models || []).map((m: OllamaModel) => ({
      id: m.name,
      name: m.name,
      description: `${(m.size / 1e9).toFixed(1)}GB`,
      supportsVision: m.name.includes('vision') || m.name.includes('llava'),
      supportsStreaming: true,
    }));
  }
}
