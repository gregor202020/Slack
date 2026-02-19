/**
 * Zod validation middleware for Fastify routes.
 *
 * - validateBody: Validates request.body against a Zod schema.
 * - validateQuery: Validates request query parameters.
 * - validateParams: Validates URL path parameters.
 *
 * Returns 422 with structured errors if validation fails.
 */

import type { FastifyRequest, FastifyReply, preHandlerHookHandler } from 'fastify';
import type { ZodSchema, ZodError } from 'zod';
import { ValidationError } from '../lib/errors.js';

/**
 * Format Zod validation errors into a structured object suitable
 * for API error responses.
 */
function formatZodErrors(error: ZodError): Record<string, unknown> {
  const fieldErrors: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const path = issue.path.join('.');
    const key = path || '_root';

    if (!fieldErrors[key]) {
      fieldErrors[key] = [];
    }
    fieldErrors[key].push(issue.message);
  }

  return {
    fields: fieldErrors,
    issues: error.issues.map((issue) => ({
      path: issue.path,
      message: issue.message,
      code: issue.code,
    })),
  };
}

/**
 * Returns a Fastify preHandler that validates request.body against the given Zod schema.
 * On success, replaces request.body with the parsed (and coerced) data.
 * On failure, throws a ValidationError with structured field-level errors.
 */
export function validateBody(schema: ZodSchema): preHandlerHookHandler {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const result = schema.safeParse(request.body);

    if (!result.success) {
      throw new ValidationError(
        'Request body validation failed',
        'VALIDATION_ERROR',
        formatZodErrors(result.error),
      );
    }

    // Replace body with parsed/coerced data
    (request as { body: unknown }).body = result.data;
  };
}

/**
 * Returns a Fastify preHandler that validates request query parameters.
 * On success, replaces request.query with the parsed (and coerced) data.
 * On failure, throws a ValidationError with structured field-level errors.
 */
export function validateQuery(schema: ZodSchema): preHandlerHookHandler {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const result = schema.safeParse(request.query);

    if (!result.success) {
      throw new ValidationError(
        'Query parameter validation failed',
        'VALIDATION_ERROR',
        formatZodErrors(result.error),
      );
    }

    // Replace query with parsed/coerced data
    (request as { query: unknown }).query = result.data;
  };
}

/**
 * Returns a Fastify preHandler that validates URL path parameters.
 * On success, replaces request.params with the parsed (and coerced) data.
 * On failure, throws a ValidationError with structured field-level errors.
 */
export function validateParams(schema: ZodSchema): preHandlerHookHandler {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    const result = schema.safeParse(request.params);

    if (!result.success) {
      throw new ValidationError(
        'URL parameter validation failed',
        'VALIDATION_ERROR',
        formatZodErrors(result.error),
      );
    }

    // Replace params with parsed/coerced data
    (request as { params: unknown }).params = result.data;
  };
}
