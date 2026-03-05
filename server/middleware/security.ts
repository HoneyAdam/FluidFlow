/**
 * Security middleware for Express server
 * Implements rate limiting, CORS, and security headers
 */

import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import { Request, Response, NextFunction } from 'express';

// Development mode has relaxed limits
const isDev = process.env.NODE_ENV !== 'production';

/**
 * Rate limiting configuration
 * Prevents brute force attacks and API abuse
 * Relaxed limits in development for better DX
 */
export const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDev ? 1000 : 100, // 1000 in dev, 100 in prod per 15 min
  message: {
    error: 'Too many requests from this IP, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Stricter rate limiting for AI endpoints
 */
export const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: isDev ? 100 : 20, // 100 in dev, 20 in prod per 15 min
  message: {
    error: 'Too many AI requests, please try again later.',
  },
  standardHeaders: true,
  legacyHeaders: false,
});

/**
 * Security headers middleware
 */
export const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https:", "blob:"],
      styleSrc: ["'self'", "'unsafe-inline'", "https:", "blob:"],
      imgSrc: ["'self'", "data:", "https:", "blob:"],
      connectSrc: ["'self'", "https:", "ws:", "wss:"],
      fontSrc: ["'self'", "https:", "data:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      childSrc: ["'none'"],
      workerSrc: ["'self'", "blob:"],
      manifestSrc: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false, // Needed for Monaco Editor
});

/**
 * Request validation middleware
 */
export function validateRequest(req: Request, res: Response, next: NextFunction) {
  // Check for common attack patterns
  // VULN-017 fix: Remove 'g' flag to prevent stateful regex .test() false negatives
  const suspiciousPatterns = [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/i, // XSS
    /javascript:/i, // JavaScript protocol
    /on\w+\s*=/i, // Event handlers
    /expression\s*\(/i, // CSS expression
  ];

  // Build a body string for scanning that EXCLUDES file content fields.
  // File content (stored on disk, not rendered in app UI) naturally contains
  // HTML/JS code like <script> tags, event handlers, etc. Scanning these
  // causes false positives when creating/updating projects.
  const bodyToScan = req.body ? (() => {
    const { files: _files, ...rest } = req.body;
    return JSON.stringify(rest);
  })() : '{}';
  const query = JSON.stringify(req.query);

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(bodyToScan) || pattern.test(query)) {
      return res.status(400).json({
        error: 'Invalid request: potentially malicious content detected',
      });
    }
  }

  // Validate Content-Type for POST/PUT requests
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    const contentType = req.get('Content-Type');
    if (contentType && !contentType.includes('application/json')) {
      return res.status(400).json({
        error: 'Invalid Content-Type. Expected application/json',
      });
    }
  }

  next();
}

/**
 * Error handling middleware
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
) {
  // Log the error
  console.error(`[ERROR] ${req.method} ${req.path}:`, err);

  // do not leak error details in production
  const isDevelopment = process.env.NODE_ENV !== 'production';

  // Handle specific error types
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Validation error',
      details: isDevelopment ? err.message : undefined,
    });
  }

  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({
      error: 'Unauthorized',
    });
  }

  // Default error response
  res.status(500).json({
    error: 'Internal server error',
    details: isDevelopment ? err.message : undefined,
  });
}

/**
 * Request logging middleware
 */
export function requestLogger(req: Request, res: Response, next: NextFunction) {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[API] ${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`);
  });

  next();
}