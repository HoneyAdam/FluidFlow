import { AIProvider, ProviderConfig, GenerationRequest, GenerationResponse, StreamChunk, ModelOption } from '../types';
import { GoogleGenAI } from '@google/genai';
import { supportsNativeSchema } from '../utils/schemas';
import { parseToolArguments } from '../utils/toolUtils';

// Gemini content part types
type GeminiPart =
  | { text: string }
  | { inlineData: { mimeType: string; data: string } }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { name: string; response: Record<string, unknown> } };

export class GeminiProvider implements AIProvider {
  readonly config: ProviderConfig;
  private client: GoogleGenAI;

  constructor(config: ProviderConfig) {
    this.config = config;
    this.client = new GoogleGenAI({ apiKey: config.apiKey || '' });
  }

  async testConnection(): Promise<{ success: boolean; error?: string }> {
    try {
      // Simple test - try to list models or make a tiny request
      await this.client.models.generateContent({
        model: this.config.defaultModel,
        contents: [{ parts: [{ text: 'Hi' }] }],
        config: { maxOutputTokens: 10 }
      });
      return { success: true };
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : 'Connection failed' };
    }
  }

  async listModels(): Promise<ModelOption[]> {
    // Gemini doesn't have a public list endpoint - return config models or default
    if (this.config.models.length > 0) {
      return this.config.models;
    }
    return [{
      id: this.config.defaultModel,
      name: this.config.defaultModel,
      description: 'Google Gemini model',
      supportsVision: true,
      supportsStreaming: true,
      contextWindow: 1000000,
    }];
  }

  async generate(request: GenerationRequest, model: string): Promise<GenerationResponse> {
    // Build contents array with conversation history
    const contents: Array<{ role?: string; parts: GeminiPart[] }> = [];

    // Add conversation history if present
    if (request.conversationHistory && request.conversationHistory.length > 0) {
      console.log(`[GeminiProvider] Adding ${request.conversationHistory.length} history messages to request`);
      for (const msg of request.conversationHistory) {
        // Gemini uses 'model' for assistant role
        const role = msg.role === 'assistant' ? 'model' : msg.role === 'system' ? 'user' : msg.role;
        contents.push({
          role,
          parts: [{ text: msg.content }]
        });
        console.log(`[GeminiProvider] History msg role=${role}, content length=${msg.content.length}`);
      }
    } else {
      console.log(`[GeminiProvider] No conversation history provided`);
    }

    // Build current prompt parts
    const parts: GeminiPart[] = [];

    // Add images if present
    if (request.images) {
      for (const img of request.images) {
        parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
      }
    }

    // Add text prompt
    parts.push({ text: request.prompt });

    // Add current prompt to contents
    contents.push({ role: 'user', parts });

    // Check if native schema enforcement can be used (only for static schemas)
    const useNativeSchema = request.responseFormat === 'json' &&
      request.responseSchema &&
      supportsNativeSchema('gemini', request.responseSchema as Record<string, unknown>);

    // Build system instruction with optional JSON schema guidance for dynamic schemas
    let systemContent = request.systemInstruction || '';
    if (request.responseFormat === 'json' && request.responseSchema && !useNativeSchema) {
      // Dynamic key schemas need system prompt guidance (native schema won't work)
      const schemaInstruction = `\n\nYou MUST respond with valid JSON that follows this exact schema:\n${JSON.stringify(request.responseSchema, null, 2)}\n\nDo not include any text outside the JSON object.`;
      systemContent = systemContent ? systemContent + schemaInstruction : schemaInstruction.trim();
    }

    // Build config
    const config: Record<string, unknown> = {
      systemInstruction: systemContent || undefined,
      maxOutputTokens: request.maxTokens,
      temperature: request.temperature,
    };

    // Enable JSON mode
    if (request.responseFormat === 'json') {
      config.responseMimeType = 'application/json';
      // Use native schema enforcement for static schemas (ACCESSIBILITY_AUDIT_SCHEMA, etc.)
      if (useNativeSchema) {
        config.responseSchema = request.responseSchema;
      }
    }

    // Add tools if provided (for tool calling mode)
    if (request.tools && request.tools.length > 0) {
      config.tools = [{
        functionDeclarations: request.tools.map(t => ({
          name: t.name,
          description: t.description || '',
          parameters: t.parameters || { type: 'object', properties: {} },
        }))
      }];
    }

    const response = await this.client.models.generateContent({
      model,
      contents,
      config,
    });

    // Handle function call response (tool calling mode)
    const functionCalls = response.candidates?.[0]?.content?.parts?.filter(
      (p) => 'functionCall' in p
    );

    if (functionCalls && functionCalls.length > 0 && request.toolExecutor) {
      const results: Array<{ role: 'user'; parts: GeminiPart[] }> = [];
      const filesWritten: string[] = [];

      for (const fc of functionCalls) {
        if ('functionCall' in fc) {
          try {
            const args = parseToolArguments(JSON.stringify(fc.functionCall.args || {}));
            const result = await request.toolExecutor(fc.functionCall.name, args);

            if (result.success && result.filesWritten) {
              filesWritten.push(...result.filesWritten);
            }

            results.push({
              role: 'user',
              parts: [{
                functionResponse: {
                  name: fc.functionCall.name,
                  response: (result.success
                    ? (result.result || { success: true })
                    : { error: result.error || 'Unknown error' }) as Record<string, unknown>
                }
              }]
            });
          } catch (error) {
            console.error('[GeminiProvider] Tool execution threw:', fc.functionCall.name, error);
            results.push({
              role: 'user',
              parts: [{
                functionResponse: {
                  name: fc.functionCall.name,
                  response: { error: error instanceof Error ? error.message : String(error) }
                }
              }]
            });
          }
        }
      }

      // Continue conversation with function responses
      contents.push(...results);

      // Make follow-up request
      const followUpResponse = await this.client.models.generateContent({
        model,
        contents,
        config,
      });

      return {
        text: followUpResponse.text || '',
        usage: {
          inputTokens: followUpResponse.usageMetadata?.promptTokenCount,
          outputTokens: followUpResponse.usageMetadata?.candidatesTokenCount,
        },
        filesWritten: filesWritten.length > 0 ? filesWritten : undefined,
      };
    }

    return {
      text: response.text || '',
      usage: {
        inputTokens: response.usageMetadata?.promptTokenCount,
        outputTokens: response.usageMetadata?.candidatesTokenCount,
      }
    };
  }

  async generateStream(
    request: GenerationRequest,
    model: string,
    onChunk: (chunk: StreamChunk) => void
  ): Promise<GenerationResponse> {
    // Build contents array with conversation history
    const contents: Array<{ role?: string; parts: GeminiPart[] }> = [];

    // Add conversation history if present
    if (request.conversationHistory && request.conversationHistory.length > 0) {
      console.log(`[GeminiProvider:Stream] Adding ${request.conversationHistory.length} history messages to request`);
      for (const msg of request.conversationHistory) {
        // Gemini uses 'model' for assistant role
        const role = msg.role === 'assistant' ? 'model' : msg.role === 'system' ? 'user' : msg.role;
        contents.push({
          role,
          parts: [{ text: msg.content }]
        });
        console.log(`[GeminiProvider:Stream] History msg role=${role}, content length=${msg.content.length}`);
      }
    } else {
      console.log(`[GeminiProvider:Stream] No conversation history provided`);
    }

    // Build current prompt parts
    const parts: GeminiPart[] = [];

    if (request.images) {
      for (const img of request.images) {
        parts.push({ inlineData: { mimeType: img.mimeType, data: img.data } });
      }
    }

    parts.push({ text: request.prompt });

    // Add current prompt to contents
    contents.push({ role: 'user', parts });

    let fullText = '';

    // Check if native schema enforcement can be used (only for static schemas)
    const useNativeSchema = request.responseFormat === 'json' &&
      request.responseSchema &&
      supportsNativeSchema('gemini', request.responseSchema as Record<string, unknown>);

    // Build system instruction with optional JSON schema guidance for dynamic schemas
    let systemContent = request.systemInstruction || '';
    if (request.responseFormat === 'json' && request.responseSchema && !useNativeSchema) {
      // Dynamic key schemas need system prompt guidance (native schema won't work)
      const schemaInstruction = `\n\nYou MUST respond with valid JSON that follows this exact schema:\n${JSON.stringify(request.responseSchema, null, 2)}\n\nDo not include any text outside the JSON object.`;
      systemContent = systemContent ? systemContent + schemaInstruction : schemaInstruction.trim();
    }

    // Build config
    const config: Record<string, unknown> = {
      systemInstruction: systemContent || undefined,
      maxOutputTokens: request.maxTokens,
      temperature: request.temperature,
    };

    // Enable JSON mode
    if (request.responseFormat === 'json') {
      config.responseMimeType = 'application/json';
      // Use native schema enforcement for static schemas (ACCESSIBILITY_AUDIT_SCHEMA, etc.)
      if (useNativeSchema) {
        config.responseSchema = request.responseSchema;
      }
    }

    // Add tools if provided (for tool calling mode)
    if (request.tools && request.tools.length > 0) {
      config.tools = [{
        functionDeclarations: request.tools.map(t => ({
          name: t.name,
          description: t.description || '',
          parameters: t.parameters || { type: 'object', properties: {} },
        }))
      }];
    }

    try {
      const stream = await this.client.models.generateContentStream({
        model,
        contents,
        config,
      });

      const functionCalls: Array<{ functionCall: { name: string; args: Record<string, unknown> } }> = [];

      for await (const chunk of stream) {
        // Check for function calls in the chunk
        const chunkFunctionCalls = chunk.candidates?.[0]?.content?.parts?.filter(
          (p) => 'functionCall' in p
        ) as typeof functionCalls;
        if (chunkFunctionCalls && chunkFunctionCalls.length > 0) {
          functionCalls.push(...chunkFunctionCalls);
        }

        const text = chunk.text || '';
        fullText += text;
        onChunk({ text, done: false });
      }

      // Handle function calls after streaming completes
      if (functionCalls.length > 0 && request.toolExecutor) {
        const results: Array<{ role: 'user'; parts: GeminiPart[] }> = [];
        const filesWritten: string[] = [];

        for (const fc of functionCalls) {
          try {
            const args = parseToolArguments(JSON.stringify(fc.functionCall.args || {}));
            const result = await request.toolExecutor(fc.functionCall.name, args);

            if (result.success && result.filesWritten) {
              filesWritten.push(...result.filesWritten);
            }

            results.push({
              role: 'user',
              parts: [{
                functionResponse: {
                  name: fc.functionCall.name,
                  response: (result.success
                    ? (result.result || { success: true })
                    : { error: result.error || 'Unknown error' }) as Record<string, unknown>
                }
              }]
            });
          } catch (error) {
            console.error('[GeminiProvider] Tool execution threw:', fc.functionCall.name, error);
            results.push({
              role: 'user',
              parts: [{
                functionResponse: {
                  name: fc.functionCall.name,
                  response: { error: error instanceof Error ? error.message : String(error) }
                }
              }]
            });
          }
        }

        // Send final chunk
        onChunk({ text: '', done: true });

        // Continue conversation with function responses
        contents.push(...results);

        // Make follow-up request (non-streaming)
        const followUpResponse = await this.client.models.generateContent({
          model,
          contents,
          config,
        });

        return {
          text: followUpResponse.text || '',
          usage: {
            inputTokens: followUpResponse.usageMetadata?.promptTokenCount,
            outputTokens: followUpResponse.usageMetadata?.candidatesTokenCount,
          },
          filesWritten: filesWritten.length > 0 ? filesWritten : undefined,
        };
      }
    } catch (error) {
      // Signal completion even on error, with partial text if available
      onChunk({ text: '', done: true });
      throw error;
    }

    onChunk({ text: '', done: true });

    // Gemini doesn't provide usage in streaming, so we'll estimate
    const estimatedInputTokens = Math.ceil(JSON.stringify(request).length / 4);
    const estimatedOutputTokens = Math.ceil(fullText.length / 4);

    return {
      text: fullText,
      usage: {
        inputTokens: estimatedInputTokens,
        outputTokens: estimatedOutputTokens,
        isEstimated: true, // Mark as estimated since streaming doesn't return real usage
      }
    };
  }
}
