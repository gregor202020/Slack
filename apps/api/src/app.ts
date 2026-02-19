/**
 * Fastify app factory function.
 *
 * Creates and configures the Fastify instance with:
 * - Logger config (pino) with sensitive data redaction (spec Section 16.12)
 * - All plugins via plugins/index.ts
 * - All routes via routes/index.ts
 * - Global error handler (Zod validation errors, AppError, unknown errors)
 * - onRequest hook for request ID generation
 * - onResponse hook for request logging
 */

import Fastify, { type FastifyInstance, type FastifyError } from 'fastify';
import { randomBytes } from 'node:crypto';
import { registerPlugins } from './plugins/index.js';
import { registerRoutes } from './routes/index.js';
import { AppError, ValidationError, InternalError } from './lib/errors.js';
import { getConfig } from './lib/config.js';

export async function buildApp(): Promise<FastifyInstance> {
  const config = getConfig();

  const app = Fastify({
    logger: {
      level: config.isDevelopment ? 'debug' : 'info',
      transport: config.isDevelopment
        ? { target: 'pino-pretty', options: { colorize: true } }
        : undefined,
      // Redact sensitive data from logs per spec Section 16.12
      redact: {
        paths: [
          'req.headers.authorization',
          'req.headers.cookie',
          'req.body.otp',
          'req.body.password',
          'req.body.token',
          'req.body.refreshToken',
          'req.body.email',
          'req.body.address',
          'req.body.phone',
          'req.body.apiKey',
        ],
        censor: '[REDACTED]',
      },
    },
    // Generate unique request IDs
    genReqId: () => randomBytes(8).toString('hex'),
    // Trust proxy headers if behind a reverse proxy
    trustProxy: config.isProduction,
  });

  // --- onRequest hook: attach request ID to response headers ---
  app.addHook('onRequest', async (request, reply) => {
    reply.header('X-Request-Id', request.id);
  });

  // --- onResponse hook: request logging (excluding sensitive data) ---
  app.addHook('onResponse', async (request, reply) => {
    // Log request completion. Sensitive fields are already redacted by pino config.
    request.log.info(
      {
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        responseTime: reply.elapsedTime,
        requestId: request.id,
        ip: request.ip,
        // Intentionally omit: authorization header, request body, user-agent details
      },
      'request completed',
    );
  });

  // --- Register plugins ---
  await registerPlugins(app);

  // --- Register routes ---
  await registerRoutes(app);

  // --- Global error handler ---
  app.setErrorHandler((error: FastifyError | AppError | Error, request, reply) => {
    // Handle our custom AppError hierarchy
    if (error instanceof AppError) {
      request.log.warn(
        {
          code: error.code,
          statusCode: error.statusCode,
          requestId: request.id,
        },
        error.message,
      );

      return reply.status(error.statusCode).send({
        error: {
          code: error.code,
          message: error.message,
          // Strip details in production to avoid leaking internals (Finding 4.1)
          ...(config.isDevelopment && error.details ? { details: error.details } : {}),
          requestId: request.id,
        },
      });
    }

    // Handle Zod validation errors that might have been thrown directly
    if (error.name === 'ZodError' && 'issues' in error) {
      const zodError = error as unknown as { issues: Array<{ path: (string | number)[]; message: string; code: string }> };
      return reply.status(422).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: {
            issues: zodError.issues.map((issue) => ({
              path: issue.path,
              message: issue.message,
              code: issue.code,
            })),
          },
          requestId: request.id,
        },
      });
    }

    // Handle Fastify's built-in validation errors
    if ('validation' in error && error.validation) {
      return reply.status(422).send({
        error: {
          code: 'VALIDATION_ERROR',
          message: error.message,
          requestId: request.id,
        },
      });
    }

    // Handle Fastify rate limit errors
    if ('statusCode' in error && error.statusCode === 429) {
      return reply.status(429).send({
        error: {
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Too many requests',
          requestId: request.id,
        },
      });
    }

    // Unknown errors — log the full error but return a generic message
    request.log.error(
      {
        err: error,
        requestId: request.id,
      },
      'Unhandled error',
    );

    return reply.status(500).send({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
        requestId: request.id,
      },
    });
  });

  // --- Health check route ---
  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // --- CSP violation report endpoint (spec Section 16.10) ---
  app.post('/api/csp-report', async (request) => {
    request.log.warn(
      { cspReport: request.body },
      'CSP violation report received',
    );
    return { received: true };
  });

  return app;
}
