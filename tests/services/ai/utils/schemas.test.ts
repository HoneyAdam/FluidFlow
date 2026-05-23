import { describe, it, expect } from 'vitest';
import {
  supportsAdditionalProperties,
  schemaHasDynamicKeys,
  supportsNativeSchema,
  getSchemaForProvider,
  FILE_GENERATION_SCHEMA,
  COMPONENT_ANALYSIS_SCHEMA,
  ACCESSIBILITY_AUDIT_SCHEMA,
  QUICK_EDIT_SCHEMA,
  ERROR_FIX_SCHEMA,
  COMMIT_MESSAGE_SCHEMA,
  SUGGESTIONS_SCHEMA,
  DATABASE_SCHEMA_SCHEMA,
} from '../../../../services/ai/utils/schemas';

describe('schemas constants', () => {
  it('exports FILE_GENERATION_SCHEMA with correct structure', () => {
    expect(FILE_GENERATION_SCHEMA.type).toBe('object');
    expect(FILE_GENERATION_SCHEMA.required).toContain('files');
  });

  it('exports COMPONENT_ANALYSIS_SCHEMA', () => {
    expect(COMPONENT_ANALYSIS_SCHEMA.type).toBe('object');
    expect(COMPONENT_ANALYSIS_SCHEMA.required).toContain('components');
  });

  it('exports ACCESSIBILITY_AUDIT_SCHEMA', () => {
    expect(ACCESSIBILITY_AUDIT_SCHEMA.type).toBe('object');
    expect(ACCESSIBILITY_AUDIT_SCHEMA.required).toContain('score');
    expect(ACCESSIBILITY_AUDIT_SCHEMA.required).toContain('issues');
  });

  it('exports QUICK_EDIT_SCHEMA', () => {
    expect(QUICK_EDIT_SCHEMA.type).toBe('object');
    expect(QUICK_EDIT_SCHEMA.required).toContain('file');
    expect(QUICK_EDIT_SCHEMA.required).toContain('content');
  });

  it('exports ERROR_FIX_SCHEMA', () => {
    expect(ERROR_FIX_SCHEMA.type).toBe('object');
    expect(ERROR_FIX_SCHEMA.required).toContain('diagnosis');
    expect(ERROR_FIX_SCHEMA.required).toContain('files');
  });

  it('exports COMMIT_MESSAGE_SCHEMA', () => {
    expect(COMMIT_MESSAGE_SCHEMA.type).toBe('object');
    expect(COMMIT_MESSAGE_SCHEMA.required).toContain('type');
    expect(COMMIT_MESSAGE_SCHEMA.required).toContain('subject');
  });

  it('exports SUGGESTIONS_SCHEMA as array type', () => {
    expect(SUGGESTIONS_SCHEMA.type).toBe('array');
  });

  it('exports DATABASE_SCHEMA_SCHEMA', () => {
    expect(DATABASE_SCHEMA_SCHEMA.type).toBe('object');
    expect(DATABASE_SCHEMA_SCHEMA.required).toContain('tables');
  });
});

describe('supportsAdditionalProperties', () => {
  it('always returns false for all providers', () => {
    expect(supportsAdditionalProperties('gemini')).toBe(false);
    expect(supportsAdditionalProperties('openai')).toBe(false);
    expect(supportsAdditionalProperties('anthropic')).toBe(false);
    expect(supportsAdditionalProperties('custom')).toBe(false);
  });
});

describe('schemaHasDynamicKeys', () => {
  it('detects top-level additionalProperties', () => {
    expect(schemaHasDynamicKeys({ additionalProperties: { type: 'string' } })).toBe(true);
  });

  it('detects nested additionalProperties', () => {
    expect(schemaHasDynamicKeys({
      properties: {
        files: { type: 'object', additionalProperties: { type: 'string' } },
      },
    })).toBe(true);
  });

  it('returns false for non-object additionalProperties', () => {
    expect(schemaHasDynamicKeys({ additionalProperties: true })).toBe(false);
  });

  it('returns false for static schemas', () => {
    expect(schemaHasDynamicKeys({
      type: 'object',
      properties: { name: { type: 'string' } },
      additionalProperties: false,
    })).toBe(false);
  });

  it('handles null property values', () => {
    expect(schemaHasDynamicKeys({
      properties: { a: null },
    })).toBe(false);
  });

  it('returns false when no properties', () => {
    expect(schemaHasDynamicKeys({ type: 'object' })).toBe(false);
  });
});

describe('supportsNativeSchema', () => {
  it('returns false when no schema', () => {
    expect(supportsNativeSchema('openai')).toBe(false);
  });

  it('returns false for dynamic key schemas', () => {
    expect(supportsNativeSchema('openai', {
      type: 'object',
      properties: { files: { type: 'object', additionalProperties: { type: 'string' } } },
    })).toBe(false);
  });

  it('returns true for static schemas on gemini', () => {
    expect(supportsNativeSchema('gemini', { type: 'object', properties: { a: { type: 'string' } } })).toBe(true);
  });

  it('returns true for static schemas on openai', () => {
    expect(supportsNativeSchema('openai', { type: 'object', properties: { a: { type: 'string' } } })).toBe(true);
  });

  it('returns true for static schemas on anthropic', () => {
    expect(supportsNativeSchema('anthropic', { type: 'object', properties: { a: { type: 'string' } } })).toBe(true);
  });

  it('returns true for static schemas on openrouter', () => {
    expect(supportsNativeSchema('openrouter', { type: 'object', properties: { a: { type: 'string' } } })).toBe(true);
  });

  it('returns false for other providers even with static schema', () => {
    expect(supportsNativeSchema('zai', { type: 'object', properties: {} })).toBe(false);
    expect(supportsNativeSchema('cerebras', { type: 'object', properties: {} })).toBe(false);
    expect(supportsNativeSchema('ollama', { type: 'object', properties: {} })).toBe(false);
  });
});

describe('getSchemaForProvider', () => {
  it('returns null when hasDynamicKeys and provider does not support', () => {
    expect(getSchemaForProvider({ type: 'object' }, 'openai', true)).toBeNull();
  });

  it('returns schema when not dynamic keys', () => {
    const schema = { type: 'object', properties: {} };
    expect(getSchemaForProvider(schema, 'openai', false)).toBe(schema);
  });

  it('returns schema when dynamic keys but default hasDynamicKeys=false', () => {
    const schema = { type: 'object' };
    expect(getSchemaForProvider(schema, 'openai')).toBe(schema);
  });
});
