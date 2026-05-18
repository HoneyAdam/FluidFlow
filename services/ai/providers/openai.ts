import { AIProvider, ProviderConfig, GenerationRequest, GenerationResponse, StreamChunk, ModelOption } from '../types';
import { fetchWithTimeout, TIMEOUT_TEST_CONNECTION, TIMEOUT_GENERATE, TIMEOUT_LIST_MODELS } from '../utils/fetchWithTimeout';
import { throwIfNotOk } from '../utils/errorHandling';
import { processSSEStream, createEstimatedUsage } from '../utils/streamParser';
import { OpenAICompatibleProvider } from './base/OpenAICompatibleProvider';

type ContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

type ChatMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string | ContentPart[];
};

interface OpenAIModel {
  id: string;
  name?: string;
  description?: string;
  context_length?: number;
  architecture?: { modality?: string };
}

export class OpenAIProvider extends OpenAICompatibleProvider implements AIProvider {
  constructor(config: ProviderConfig) {
    super(config);
  }

  protected getApiEndpoint(): string {
    return `${this.config.baseUrl}/chat/completions`;
  }

  protected getModelsEndpoint(): string {
    return `${this.config.baseUrl}/models`;
  }

  protected getAuthHeader(): string {
    return `Bearer ${this.config.apiKey}`;
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      const response = await fetchWithTimeout(`${this.config.baseUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
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
    const messages: ChatMessage[] = [];

    const systemContent = request.systemInstruction || '';

    if (systemContent) {
      messages.push({ role: 'system', content: systemContent });
    }

    if (request.conversationHistory && request.conversationHistory.length > 0) {
      for (const msg of request.conversationHistory) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    const content: ContentPart[] = [];

    if (request.images) {
      for (const img of request.images) {
        content.push({
          type: 'image_url',
          image_url: { url: `data:${img.mimeType};base64,${img.data}` }
        });
      }
    }

    content.push({ type: 'text', text: request.prompt });
    messages.push({ role: 'user', content });

    const body: Record<string, unknown> = {
      model,
      messages,
      max_tokens: request.maxTokens || 16384,
      temperature: request.temperature ?? 0.7,
    };

    // Add response_format for JSON mode
    if (request.responseFormat === 'json') {
      if (request.responseSchema) {
        body.response_format = {
          type: 'json_schema',
          json_schema: {
            name: 'response',
            strict: true,
            schema: request.responseSchema,
          },
        };
      } else {
        body.response_format = { type: 'json_object' };
      }
    }

    const response = await fetchWithTimeout(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
        ...this.config.headers,
      },
      body: JSON.stringify(body),
      timeout: TIMEOUT_GENERATE,
    });

    await throwIfNotOk(response, 'openai');

    const data = await response.json();

    return {
      text: data.choices[0]?.message?.content || '',
      finishReason: data.choices[0]?.finish_reason,
      usage: {
        inputTokens: data.usage?.prompt_tokens,
        outputTokens: data.usage?.completion_tokens,
      }
    };
  }

  async generateStream(
    request: GenerationRequest,
    model: string,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<GenerationResponse> {
    const messages: ChatMessage[] = [];

    const systemContent = request.systemInstruction || '';

    if (systemContent) {
      messages.push({ role: 'system', content: systemContent });
    }

    if (request.conversationHistory && request.conversationHistory.length > 0) {
      for (const msg of request.conversationHistory) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    const content: ContentPart[] = [];

    if (request.images) {
      for (const img of request.images) {
        content.push({
          type: 'image_url',
          image_url: { url: `data:${img.mimeType};base64,${img.data}` }
        });
      }
    }

    content.push({ type: 'text', text: request.prompt });
    messages.push({ role: 'user', content });

    const body = {
      model,
      messages,
      max_tokens: request.maxTokens || 16384,
      temperature: request.temperature ?? 0.7,
      stream: true,
      stream_options: { include_usage: true },
    };

    const response = await fetchWithTimeout(`${this.config.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
        ...this.config.headers,
      },
      body: JSON.stringify(body),
      timeout: TIMEOUT_GENERATE,
    });

    await throwIfNotOk(response, 'openai');

    const { fullText, usage } = await processSSEStream(response, {
      format: 'openai',
      onChunk,
    });

    if (!usage) {
      const estimated = createEstimatedUsage(JSON.stringify(messages), fullText);
      return { text: fullText, usage: estimated };
    }

    return { text: fullText, usage };
  }

  async listModels(): Promise<ModelOption[]> {
    const response = await fetchWithTimeout(`${this.config.baseUrl}/models`, {
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      timeout: TIMEOUT_LIST_MODELS,
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();

    // OpenRouter returns different structure
    if (this.config.type === 'openrouter') {
      return (data.data || [])
        .filter((m: OpenAIModel) => m.id && !m.id.includes(':free')) // Filter out free tier duplicates
        .slice(0, 100) // Limit to top 100 models
        .map((m: OpenAIModel) => ({
          id: m.id,
          name: m.name || m.id.split('/').pop() || m.id,
          description: m.description?.slice(0, 50) || `Context: ${m.context_length || 'unknown'}`,
          contextWindow: m.context_length,
          supportsVision: m.architecture?.modality?.includes('image') || false,
          supportsStreaming: true,
        }));
    }

    // OpenAI models
    return data.data
      .filter((m: OpenAIModel) => m.id.includes('gpt') || m.id.includes('o1'))
      .map((m: OpenAIModel) => ({
        id: m.id,
        name: m.id,
        supportsStreaming: !m.id.includes('o1'),
      }));
  }
}