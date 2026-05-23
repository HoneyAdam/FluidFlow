import { describe, it, expect } from 'vitest';
import {
  getJsonCapability,
  buildJsonSystemInstruction,
  parseJsonResponse,
  prepareJsonRequest,
  schemaHasDynamicKeys,
} from '../../../../services/ai/utils/jsonOutput';
import type { ProviderType } from '../../../../services/ai/types';

describe('getJsonCapability', () => {
  it.each([
    ['openai' as ProviderType],
    ['gemini' as ProviderType],
    ['anthropic' as ProviderType],
    ['zai' as ProviderType],
    ['minimax' as ProviderType],
    ['cerebras' as ProviderType],
    ['ollama' as ProviderType],
    ['lmstudio' as ProviderType],
    ['openrouter' as ProviderType],
    ['custom' as ProviderType],
  ])('returns capabilities for %s', (provider) => {
    const result = getJsonCapability(provider);
    expect(result).toHaveProperty('supportsNativeSchema');
    expect(result).toHaveProperty('supportsJsonObject');
    expect(result).toHaveProperty('needsPromptGuidance');
  });

  it('returns native schema for openai with compatible schema', () => {
    const result = getJsonCapability('openai', { type: 'object', properties: { a: { type: 'string' } }, required: ['a'] });
    expect(result.supportsNativeSchema).toBe(true);
  });

  it('returns false for native schema with dynamic keys', () => {
    const result = getJsonCapability('openai', {
      type: 'object',
      properties: { files: { type: 'object', additionalProperties: { type: 'string' } } },
    });
    expect(result.supportsNativeSchema).toBe(false);
  });

  it('returns default for unknown provider', () => {
    const result = getJsonCapability('unknown' as ProviderType);
    expect(result.supportsNativeSchema).toBe(false);
    expect(result.supportsJsonObject).toBe(false);
  });

  it('anthropic does not support json_object mode', () => {
    expect(getJsonCapability('anthropic').supportsJsonObject).toBe(false);
  });

  it('custom does not support json_object', () => {
    expect(getJsonCapability('custom').supportsJsonObject).toBe(false);
  });

  it('needsPromptGuidance when schema provided but not native', () => {
    const result = getJsonCapability('zai', { type: 'object', properties: {} });
    expect(result.needsPromptGuidance).toBe(true);
  });
});

describe('buildJsonSystemInstruction', () => {
  it('returns base instruction when native schema is supported', () => {
    const result = buildJsonSystemInstruction('base', { type: 'object' }, {
      supportsNativeSchema: true, supportsJsonObject: true, needsPromptGuidance: false,
    });
    expect(result).toBe('base');
  });

  it('returns base instruction when no schema', () => {
    const result = buildJsonSystemInstruction('base', undefined, {
      supportsNativeSchema: false, supportsJsonObject: true, needsPromptGuidance: false,
    });
    expect(result).toBe('base');
  });

  it('appends schema instruction when guidance needed', () => {
    const result = buildJsonSystemInstruction('base', { type: 'object' }, {
      supportsNativeSchema: false, supportsJsonObject: true, needsPromptGuidance: true,
    });
    expect(result).toContain('base');
    expect(result).toContain('JSON');
    expect(result).toContain('"type": "object"');
  });

  it('uses schema instruction alone when no base instruction', () => {
    const result = buildJsonSystemInstruction('', { type: 'object' }, {
      supportsNativeSchema: false, supportsJsonObject: true, needsPromptGuidance: true,
    });
    expect(result).toContain('JSON');
    expect(result[0]).not.toBe('\n');
  });
});

describe('parseJsonResponse', () => {
  it('parses clean JSON with nativeSchema', () => {
    const result = parseJsonResponse('{"key":"value"}', true);
    expect(result.data).toEqual({ key: 'value' });
    expect(result.usedNativeSchema).toBe(true);
    expect(result.neededCleanup).toBe(false);
  });

  it('handles native schema parse failure by falling back', () => {
    // When native schema is used but parsing fails, it should throw
    // because the cleanup path also can't recover from 'not json'
    expect(() => parseJsonResponse('not json', true)).toThrow('JSON parse failed');
  });

  it('removes markdown code blocks', () => {
    const result = parseJsonResponse('```json\n{"key":"value"}\n```', false);
    expect(result.data).toEqual({ key: 'value' });
    expect(result.neededCleanup).toBe(true);
  });

  it('handles partial markdown code blocks', () => {
    const result = parseJsonResponse('```\n{"key":"value"}\n```', false);
    expect(result.data).toEqual({ key: 'value' });
  });

  it('extracts JSON from surrounding text', () => {
    const result = parseJsonResponse('Some text {"key":"value"} more text', false);
    expect(result.data).toEqual({ key: 'value' });
    expect(result.neededCleanup).toBe(true);
  });

  it('extracts JSON array from surrounding text', () => {
    const result = parseJsonResponse('prefix [1,2,3] suffix', false);
    expect(result.data).toEqual([1, 2, 3]);
  });

  it('repairs truncated JSON', () => {
    const result = parseJsonResponse('{"key":"value"', false);
    expect(result.data).toEqual({ key: 'value' });
    expect(result.neededCleanup).toBe(true);
  });

  it('fixes trailing commas', () => {
    const result = parseJsonResponse('{"key":"value",}', false);
    expect(result.data).toEqual({ key: 'value' });
  });

  it('fixes unquoted keys', () => {
    const result = parseJsonResponse('{key:"value"}', false);
    expect(result.data).toEqual({ key: 'value' });
  });

  it('parses simple valid JSON', () => {
    const result = parseJsonResponse('{"a":1}', false);
    expect(result.data).toEqual({ a: 1 });
    expect(result.neededCleanup).toBe(false);
  });

  it('throws on completely unparseable text', () => {
    expect(() => parseJsonResponse('not json at all!!!', false)).toThrow('JSON parse failed');
  });

  it('preserves rawText', () => {
    const raw = '{"key":"value"}';
    const result = parseJsonResponse(raw, false);
    expect(result.rawText).toBe(raw);
  });
});

describe('prepareJsonRequest', () => {
  it('returns correct properties', () => {
    const result = prepareJsonRequest('openai', 'system', { type: 'object', properties: { a: { type: 'string' } }, required: ['a'] });
    expect(result).toHaveProperty('systemInstruction');
    expect(result).toHaveProperty('useNativeSchema', true);
    expect(result).toHaveProperty('useJsonObject', false);
    expect(result).toHaveProperty('parse');
    expect(result).toHaveProperty('capability');
  });

  it('uses json_object when no native schema', () => {
    const result = prepareJsonRequest('zai', 'system');
    expect(result.useJsonObject).toBe(true);
    expect(result.useNativeSchema).toBe(false);
  });
});

describe('schemaHasDynamicKeys', () => {
  it('detects top-level additionalProperties', () => {
    expect(schemaHasDynamicKeys({ additionalProperties: { type: 'string' } })).toBe(true);
  });

  it('detects nested additionalProperties in properties', () => {
    expect(schemaHasDynamicKeys({
      properties: { files: { type: 'object', additionalProperties: { type: 'string' } } },
    })).toBe(true);
  });

  it('returns false for static schemas', () => {
    expect(schemaHasDynamicKeys({ type: 'object', properties: { a: { type: 'string' } } })).toBe(false);
  });

  it('returns false for non-object properties', () => {
    expect(schemaHasDynamicKeys({ properties: { a: { type: 'string' } } })).toBe(false);
  });
});
