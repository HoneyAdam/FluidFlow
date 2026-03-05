import { Router, Request, Response } from 'express';

const router = Router();

/**
 * Validate a base URL to prevent SSRF attacks.
 * Only allows HTTPS URLs to known AI provider domains or public endpoints.
 * Blocks private/internal IP ranges.
 */
function isValidProxyBaseUrl(url: string): boolean {
  try {
    const parsed = new URL(url);

    if (!['https:', 'http:'].includes(parsed.protocol)) {
      return false;
    }

    const hostname = parsed.hostname.toLowerCase();

    // Allow known AI provider domains
    const allowedDomains = [
      'api.minimax.io',
      'api.openai.com',
      'api.anthropic.com',
      'generativelanguage.googleapis.com',
      'openrouter.ai',
      'api.openrouter.ai',
    ];

    if (allowedDomains.some(d => hostname === d || hostname.endsWith('.' + d))) {
      return true;
    }

    // Block private/internal IP ranges
    const blockedPatterns = [
      /^10\./, /^172\.(1[6-9]|2\d|3[01])\./, /^192\.168\./,
      /^0\./, /^169\.254\./, /^127\./, /^\[?::1\]?$/,
      /^\[?fe80:/i, /\.local$/i, /\.internal$/i,
      /^localhost$/i,
    ];

    if (blockedPatterns.some(p => p.test(hostname))) {
      return false;
    }

    // Only allow HTTPS for unknown domains
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

// MiniMax API proxy - avoids CORS issues from browser
// The MiniMax API doesn't allow certain headers from OpenAI SDK
router.post('/minimax/chat/completions', async (req: Request, res: Response) => {
  const apiKey = req.headers['x-api-key'] as string;

  if (!apiKey) {
    res.status(401).json({ error: 'API key required' });
    return;
  }

  const baseUrl = (req.headers['x-base-url'] as string) || 'https://api.minimax.io/v1';

  if (!isValidProxyBaseUrl(baseUrl)) {
    res.status(400).json({ error: 'Invalid base URL' });
    return;
  }

  // FIX-02: AbortController to prevent server hanging if upstream API is unresponsive
  const controller = new AbortController();
  const fetchTimeout = setTimeout(() => controller.abort(), 60000); // 60s timeout

  try {
    const isStreaming = req.body?.stream === true;

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify(req.body),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[AI Proxy] MiniMax error:', response.status, errorText);
      res.status(response.status).json({
        error: `MiniMax API error: ${response.status}`,
        details: errorText,
      });
      return;
    }

    if (isStreaming) {
      // Stream the response
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const reader = response.body?.getReader();
      if (!reader) {
        res.status(500).json({ error: 'Failed to get response stream' });
        return;
      }

      const decoder = new TextDecoder();

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          res.write(chunk);
        }
      } catch (streamError) {
        console.error('[AI Proxy] Stream error:', streamError);
      } finally {
        res.end();
      }
    } else {
      // Non-streaming response
      const data = await response.json();
      res.json(data);
    }
  } catch (error) {
    console.error('[AI Proxy] MiniMax request failed:', error);
    const isAbort = error instanceof Error && error.name === 'AbortError';
    res.status(isAbort ? 504 : 500).json({
      error: isAbort ? 'MiniMax API request timed out' : 'Failed to connect to MiniMax API',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  } finally {
    clearTimeout(fetchTimeout);
  }
});

// Test MiniMax connection
router.get('/minimax/test', async (req: Request, res: Response) => {
  const apiKey = req.headers['x-api-key'] as string;

  if (!apiKey) {
    res.status(401).json({ error: 'API key required' });
    return;
  }

  const baseUrl = (req.headers['x-base-url'] as string) || 'https://api.minimax.io/v1';

  if (!isValidProxyBaseUrl(baseUrl)) {
    res.json({ success: false, error: 'Invalid base URL' });
    return;
  }

  // FIX-02: AbortController for test endpoint
  const testController = new AbortController();
  const testTimeout = setTimeout(() => testController.abort(), 15000); // 15s for test

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'MiniMax-M2.1',
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 10,
      }),
      signal: testController.signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      res.json({ success: false, error: `HTTP ${response.status}: ${errorText}` });
      return;
    }

    const data = await response.json();
    res.json({ success: !!data.choices?.[0] });
  } catch (error) {
    res.json({
      success: false,
      error: error instanceof Error ? error.message : 'Connection failed',
    });
  } finally {
    clearTimeout(testTimeout);
  }
});

export { router as aiRouter };
