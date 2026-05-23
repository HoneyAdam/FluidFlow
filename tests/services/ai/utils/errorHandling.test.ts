import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  AIErrorCode,
  AIProviderError,
  handleAPIError,
  throwIfNotOk,
  isRetryableError,
  wrapError,
  formatErrorForLog,
} from '../../../../services/ai/utils/errorHandling';

// Mock fetch for handleAPIError tests
function createMockResponse(status: number, body: unknown): Response {
  const bodyStr = typeof body === 'string' ? body : JSON.stringify(body);
  return {
    ok: status >= 200 && status < 300,
    status,
    text: vi.fn().mockResolvedValue(bodyStr),
    json: vi.fn().mockResolvedValue(body),
  } as unknown as Response;
}

describe('AIErrorCode', () => {
  it('should have all error code values', () => {
    expect(AIErrorCode.NETWORK_ERROR).toBe('NETWORK_ERROR');
    expect(AIErrorCode.HTTP_ERROR).toBe('HTTP_ERROR');
    expect(AIErrorCode.AUTH_ERROR).toBe('AUTH_ERROR');
    expect(AIErrorCode.RATE_LIMIT).toBe('RATE_LIMIT');
    expect(AIErrorCode.BAD_REQUEST).toBe('BAD_REQUEST');
    expect(AIErrorCode.MODEL_NOT_FOUND).toBe('MODEL_NOT_FOUND');
    expect(AIErrorCode.SERVICE_UNAVAILABLE).toBe('SERVICE_UNAVAILABLE');
    expect(AIErrorCode.PARSE_ERROR).toBe('PARSE_ERROR');
    expect(AIErrorCode.STREAM_ERROR).toBe('STREAM_ERROR');
    expect(AIErrorCode.UNKNOWN).toBe('UNKNOWN');
  });
});

describe('AIProviderError', () => {
  it('should create error with code and message', () => {
    const error = new AIProviderError('test error', AIErrorCode.NETWORK_ERROR);
    expect(error.message).toBe('test error');
    expect(error.code).toBe(AIErrorCode.NETWORK_ERROR);
    expect(error.name).toBe('AIProviderError');
    expect(error.isRetryable).toBe(true);
  });

  it('should include options when provided', () => {
    const originalErr = new Error('original');
    const error = new AIProviderError('test', AIErrorCode.HTTP_ERROR, {
      statusCode: 500,
      provider: 'openai',
      originalError: originalErr,
    });
    expect(error.statusCode).toBe(500);
    expect(error.provider).toBe('openai');
    expect(error.originalError).toBe(originalErr);
  });

  describe('determineRetryable', () => {
    it('returns true for NETWORK_ERROR', () => {
      const err = new AIProviderError('', AIErrorCode.NETWORK_ERROR);
      expect(err.isRetryable).toBe(true);
    });

    it('returns true for RATE_LIMIT', () => {
      const err = new AIProviderError('', AIErrorCode.RATE_LIMIT);
      expect(err.isRetryable).toBe(true);
    });

    it('returns true for SERVICE_UNAVAILABLE', () => {
      const err = new AIProviderError('', AIErrorCode.SERVICE_UNAVAILABLE);
      expect(err.isRetryable).toBe(true);
    });

    it('returns false for AUTH_ERROR', () => {
      const err = new AIProviderError('', AIErrorCode.AUTH_ERROR);
      expect(err.isRetryable).toBe(false);
    });

    it('returns false for BAD_REQUEST', () => {
      const err = new AIProviderError('', AIErrorCode.BAD_REQUEST);
      expect(err.isRetryable).toBe(false);
    });

    it('returns false for MODEL_NOT_FOUND', () => {
      const err = new AIProviderError('', AIErrorCode.MODEL_NOT_FOUND);
      expect(err.isRetryable).toBe(false);
    });

    it('returns true for 5xx status codes in default case', () => {
      const err = new AIProviderError('', AIErrorCode.HTTP_ERROR, { statusCode: 502 });
      expect(err.isRetryable).toBe(true);
    });

    it('returns false for non-5xx status in default case', () => {
      const err = new AIProviderError('', AIErrorCode.HTTP_ERROR, { statusCode: 418 });
      expect(err.isRetryable).toBe(false);
    });

    it('returns false for undefined statusCode in default case', () => {
      const err = new AIProviderError('', AIErrorCode.HTTP_ERROR);
      expect(err.isRetryable).toBe(false);
    });

    it('returns true for 5xx PARSE_ERROR', () => {
      const err = new AIProviderError('', AIErrorCode.PARSE_ERROR, { statusCode: 500 });
      expect(err.isRetryable).toBe(true);
    });
  });

  describe('toUserMessage', () => {
    it('returns auth message for AUTH_ERROR', () => {
      const err = new AIProviderError('', AIErrorCode.AUTH_ERROR);
      expect(err.toUserMessage()).toBe('Authentication failed. Please check your API key.');
    });

    it('returns rate limit message for RATE_LIMIT', () => {
      const err = new AIProviderError('', AIErrorCode.RATE_LIMIT);
      expect(err.toUserMessage()).toBe('Rate limit exceeded. Please wait a moment and try again.');
    });

    it('returns model not found message for MODEL_NOT_FOUND', () => {
      const err = new AIProviderError('', AIErrorCode.MODEL_NOT_FOUND);
      expect(err.toUserMessage()).toBe('The selected model is not available. Please choose a different model.');
    });

    it('returns service unavailable message', () => {
      const err = new AIProviderError('', AIErrorCode.SERVICE_UNAVAILABLE);
      expect(err.toUserMessage()).toBe('The AI service is temporarily unavailable. Please try again later.');
    });

    it('returns network error message', () => {
      const err = new AIProviderError('', AIErrorCode.NETWORK_ERROR);
      expect(err.toUserMessage()).toBe('Network error. Please check your internet connection.');
    });

    it('returns bad request message with original message', () => {
      const err = new AIProviderError('missing param', AIErrorCode.BAD_REQUEST);
      expect(err.toUserMessage()).toBe('Invalid request: missing param');
    });

    it('returns original message for unknown codes', () => {
      const err = new AIProviderError('some error', AIErrorCode.PARSE_ERROR);
      expect(err.toUserMessage()).toBe('some error');
    });
  });
});

describe('handleAPIError', () => {
  it('handles OpenAI error format', async () => {
    const res = createMockResponse(401, { error: { message: 'Invalid API key' } });
    const error = await handleAPIError(res, 'openai');
    expect(error.code).toBe(AIErrorCode.AUTH_ERROR);
    expect(error.message).toBe('Invalid API key');
    expect(error.provider).toBe('openai');
  });

  it('handles Anthropic error format with top-level message', async () => {
    const res = createMockResponse(400, { message: 'Bad request: model not found' });
    const error = await handleAPIError(res);
    expect(error.code).toBe(AIErrorCode.BAD_REQUEST);
    expect(error.message).toBe('Bad request: model not found');
  });

  it('handles string error field', async () => {
    const res = createMockResponse(500, { error: 'internal error string' });
    const err = await handleAPIError(res);
    expect(err.message).toBe('internal error string');
  });

  it('handles detail field (Ollama format)', async () => {
    const res = createMockResponse(404, { detail: 'model not found' });
    const err = await handleAPIError(res);
    expect(err.message).toBe('model not found');
  });

  it('handles non-JSON response', async () => {
    const res = {
      ok: false,
      status: 500,
      text: vi.fn().mockResolvedValue('Internal Server Error'),
    } as unknown as Response;
    const err = await handleAPIError(res);
    expect(err.message).toContain('HTTP 500');
    expect(err.message).toContain('Internal Server Error');
  });

  it('handles response.text failure gracefully', async () => {
    const res = {
      ok: false,
      status: 500,
      text: vi.fn().mockRejectedValue(new Error('body read failed')),
    } as unknown as Response;
    const err = await handleAPIError(res);
    expect(err.message).toBe('HTTP 500');
  });

  it('handles 429 rate limit', async () => {
    const res = createMockResponse(429, { error: { message: 'Too many requests' } });
    const err = await handleAPIError(res);
    expect(err.code).toBe(AIErrorCode.RATE_LIMIT);
  });

  it('handles 404 model not found', async () => {
    const res = createMockResponse(404, { error: { message: 'Model not found' } });
    const err = await handleAPIError(res);
    expect(err.code).toBe(AIErrorCode.MODEL_NOT_FOUND);
  });

  it('handles 503 service unavailable', async () => {
    const res = createMockResponse(503, {});
    const err = await handleAPIError(res);
    expect(err.code).toBe(AIErrorCode.SERVICE_UNAVAILABLE);
  });

  it('handles 403 forbidden as auth error', async () => {
    const res = createMockResponse(403, {});
    const err = await handleAPIError(res);
    expect(err.code).toBe(AIErrorCode.AUTH_ERROR);
  });

  it('handles 502 as service unavailable', async () => {
    const res = createMockResponse(502, {});
    const err = await handleAPIError(res);
    expect(err.code).toBe(AIErrorCode.SERVICE_UNAVAILABLE);
  });

  it('handles 418 as generic HTTP error', async () => {
    const res = createMockResponse(418, {});
    const err = await handleAPIError(res);
    expect(err.code).toBe(AIErrorCode.HTTP_ERROR);
  });

  it('handles null response body', async () => {
    const res = createMockResponse(500, null);
    const err = await handleAPIError(res);
    expect(err.message).toBe('HTTP 500');
  });

  it('truncates long non-JSON error text', async () => {
    const longText = 'a'.repeat(300);
    const res = {
      ok: false,
      status: 500,
      text: vi.fn().mockResolvedValue(longText),
    } as unknown as Response;
    const err = await handleAPIError(res);
    expect(err.message).toContain('HTTP 500:');
    // Should be truncated to ~200 chars
    expect(err.message.length).toBeLessThan(300);
  });
});

describe('throwIfNotOk', () => {
  it('does not throw for ok responses', async () => {
    const res = { ok: true } as Response;
    await expect(throwIfNotOk(res)).resolves.toBeUndefined();
  });

  it('throws for non-ok responses', async () => {
    const res = createMockResponse(401, { error: { message: 'Unauthorized' } });
    await expect(throwIfNotOk(res, 'openai')).rejects.toThrow('Unauthorized');
  });
});

describe('isRetryableError', () => {
  it('returns true for AIProviderError with isRetryable=true', () => {
    const err = new AIProviderError('test', AIErrorCode.NETWORK_ERROR);
    expect(isRetryableError(err)).toBe(true);
  });

  it('returns false for AIProviderError with isRetryable=false', () => {
    const err = new AIProviderError('test', AIErrorCode.AUTH_ERROR);
    expect(isRetryableError(err)).toBe(false);
  });

  it('returns true for network-related Error messages', () => {
    expect(isRetryableError(new Error('network timeout occurred'))).toBe(true);
    expect(isRetryableError(new Error('connection timeout'))).toBe(true);
    expect(isRetryableError(new Error('econnrefused'))).toBe(true);
    expect(isRetryableError(new Error('enotfound host'))).toBe(true);
    expect(isRetryableError(new Error('fetch failed'))).toBe(true);
  });

  it('returns true for rate limit errors', () => {
    expect(isRetryableError(new Error('rate limit exceeded'))).toBe(true);
    expect(isRetryableError(new Error('429 too many requests'))).toBe(true);
  });

  it('returns false for non-retryable errors', () => {
    expect(isRetryableError(new Error('invalid request'))).toBe(false);
  });

  it('returns false for non-Error objects', () => {
    expect(isRetryableError('string error')).toBe(false);
    expect(isRetryableError(42)).toBe(false);
  });
});

describe('wrapError', () => {
  it('returns AIProviderError as-is', () => {
    const original = new AIProviderError('test', AIErrorCode.NETWORK_ERROR);
    const result = wrapError(original);
    expect(result).toBe(original);
  });

  it('wraps timeout Error as NETWORK_ERROR', () => {
    const result = wrapError(new Error('Request timeout'), 'test');
    expect(result.code).toBe(AIErrorCode.NETWORK_ERROR);
    expect(result.provider).toBe('test');
  });

  it('wraps ETIMEDOUT Error as NETWORK_ERROR', () => {
    const result = wrapError(new Error('Connection ETIMEDOUT'));
    expect(result.code).toBe(AIErrorCode.NETWORK_ERROR);
  });

  it('wraps ECONNREFUSED Error as NETWORK_ERROR', () => {
    const result = wrapError(new Error('Connection ECONNREFUSED'));
    expect(result.code).toBe(AIErrorCode.NETWORK_ERROR);
  });

  it('wraps network Error as NETWORK_ERROR', () => {
    const result = wrapError(new Error('network failure'));
    expect(result.code).toBe(AIErrorCode.NETWORK_ERROR);
  });

  it('wraps rate limit Error', () => {
    const result = wrapError(new Error('rate limit exceeded'));
    expect(result.code).toBe(AIErrorCode.RATE_LIMIT);
  });

  it('wraps 429 Error as RATE_LIMIT', () => {
    const result = wrapError(new Error('HTTP 429'));
    expect(result.code).toBe(AIErrorCode.RATE_LIMIT);
  });

  it('wraps unauthorized Error as AUTH_ERROR', () => {
    const result = wrapError(new Error('unauthorized access'));
    expect(result.code).toBe(AIErrorCode.AUTH_ERROR);
  });

  it('wraps 401 Error as AUTH_ERROR', () => {
    const result = wrapError(new Error('HTTP 401'));
    expect(result.code).toBe(AIErrorCode.AUTH_ERROR);
  });

  it('wraps unknown Error as UNKNOWN', () => {
    const result = wrapError(new Error('something weird'));
    expect(result.code).toBe(AIErrorCode.UNKNOWN);
  });

  it('wraps non-Error as UNKNOWN', () => {
    const result = wrapError('string error', 'provider');
    expect(result.code).toBe(AIErrorCode.UNKNOWN);
    expect(result.message).toBe('string error');
    expect(result.provider).toBe('provider');
  });
});

describe('formatErrorForLog', () => {
  it('formats AIProviderError with context', () => {
    const err = new AIProviderError('test', AIErrorCode.NETWORK_ERROR, { statusCode: 500 });
    const result = formatErrorForLog(err, 'Provider');
    expect(result).toContain('NETWORK_ERROR');
    expect(result).toContain('test');
    expect(result).toContain('HTTP 500');
    expect(result).toContain('[Provider]');
  });

  it('formats AIProviderError without statusCode', () => {
    const err = new AIProviderError('test', AIErrorCode.NETWORK_ERROR);
    const result = formatErrorForLog(err);
    expect(result).toContain('NETWORK_ERROR');
    expect(result).not.toContain('HTTP');
  });

  it('formats standard Error', () => {
    const err = new Error('standard error');
    const result = formatErrorForLog(err, 'Ctx');
    expect(result).toContain('Error');
    expect(result).toContain('standard error');
    expect(result).toContain('[Ctx]');
  });

  it('formats non-Error', () => {
    const result = formatErrorForLog('string error');
    expect(result).toContain('Unknown error');
    expect(result).toContain('string error');
  });

  it('formats without context prefix when no context', () => {
    const result = formatErrorForLog(new Error('test'));
    expect(result).not.toContain('[]');
  });
});
