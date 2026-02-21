/**
 * Unit tests for validate middleware.
 *
 * Tests Zod-based request validation:
 *   - validateBody: Body validation with schema coercion
 *   - validateQuery: Query parameter validation
 *   - validateParams: URL parameter validation
 *   - Error formatting with field-level details
 */

import { describe, it, expect, vi } from 'vitest'
import { z } from 'zod'
import { validateBody, validateQuery, validateParams } from '../../../src/middleware/validate.js'
import type { FastifyRequest, FastifyReply } from 'fastify'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockRequest(overrides: Partial<FastifyRequest> = {}): FastifyRequest {
  return {
    body: {},
    query: {},
    params: {},
    headers: {},
    ...overrides,
  } as unknown as FastifyRequest
}

const mockReply = {} as FastifyReply

// ---------------------------------------------------------------------------
// validateBody
// ---------------------------------------------------------------------------

describe('Validate Middleware — validateBody', () => {
  const schema = z.object({
    name: z.string().min(1),
    age: z.number().int().positive(),
  })

  it('should pass and replace body with parsed data on valid input', async () => {
    const handler = validateBody(schema)
    const request = mockRequest({ body: { name: 'Alice', age: 30 } })

    await handler(request, mockReply, vi.fn())

    expect(request.body).toEqual({ name: 'Alice', age: 30 })
  })

  it('should throw ValidationError on invalid input', async () => {
    const handler = validateBody(schema)
    const request = mockRequest({ body: { name: '', age: -5 } })

    await expect(handler(request, mockReply, vi.fn())).rejects.toThrow(
      'Request body validation failed',
    )
  })

  it('should include field-level errors in ValidationError details', async () => {
    const handler = validateBody(schema)
    const request = mockRequest({ body: {} })

    try {
      await handler(request, mockReply, vi.fn())
      expect.fail('Should have thrown')
    } catch (err: unknown) {
      const error = err as { code: string; statusCode: number; details: Record<string, unknown> }
      expect(error.code).toBe('VALIDATION_ERROR')
      expect(error.statusCode).toBe(422)
      expect(error.details).toHaveProperty('fields')
      expect(error.details).toHaveProperty('issues')
    }
  })

  it('should coerce data types when schema defines coercion', async () => {
    const coerceSchema = z.object({
      count: z.coerce.number(),
    })
    const handler = validateBody(coerceSchema)
    const request = mockRequest({ body: { count: '42' } })

    await handler(request, mockReply, vi.fn())

    expect(request.body).toEqual({ count: 42 })
  })

  it('should strip unknown fields with strict schema', async () => {
    const strictSchema = z.object({
      name: z.string(),
    }).strict()
    const handler = validateBody(strictSchema)
    const request = mockRequest({ body: { name: 'Bob', extra: 'field' } })

    await expect(handler(request, mockReply, vi.fn())).rejects.toThrow(
      'Request body validation failed',
    )
  })
})

// ---------------------------------------------------------------------------
// validateQuery
// ---------------------------------------------------------------------------

describe('Validate Middleware — validateQuery', () => {
  const schema = z.object({
    page: z.coerce.number().int().positive().default(1),
    limit: z.coerce.number().int().positive().max(100).default(20),
  })

  it('should pass and replace query with parsed data on valid input', async () => {
    const handler = validateQuery(schema)
    const request = mockRequest({ query: { page: '2', limit: '50' } })

    await handler(request, mockReply, vi.fn())

    expect(request.query).toEqual({ page: 2, limit: 50 })
  })

  it('should apply defaults when query params are missing', async () => {
    const handler = validateQuery(schema)
    const request = mockRequest({ query: {} })

    await handler(request, mockReply, vi.fn())

    expect(request.query).toEqual({ page: 1, limit: 20 })
  })

  it('should throw ValidationError on invalid query params', async () => {
    const handler = validateQuery(schema)
    const request = mockRequest({ query: { page: 'abc', limit: '200' } })

    await expect(handler(request, mockReply, vi.fn())).rejects.toThrow(
      'Query parameter validation failed',
    )
  })
})

// ---------------------------------------------------------------------------
// validateParams
// ---------------------------------------------------------------------------

describe('Validate Middleware — validateParams', () => {
  const schema = z.object({
    id: z.string().uuid(),
  })

  it('should pass and replace params with parsed data on valid input', async () => {
    const handler = validateParams(schema)
    const uuid = '550e8400-e29b-41d4-a716-446655440000'
    const request = mockRequest({ params: { id: uuid } })

    await handler(request, mockReply, vi.fn())

    expect(request.params).toEqual({ id: uuid })
  })

  it('should throw ValidationError on invalid UUID param', async () => {
    const handler = validateParams(schema)
    const request = mockRequest({ params: { id: 'not-a-uuid' } })

    await expect(handler(request, mockReply, vi.fn())).rejects.toThrow(
      'URL parameter validation failed',
    )
  })

  it('should throw ValidationError when required param is missing', async () => {
    const handler = validateParams(schema)
    const request = mockRequest({ params: {} })

    await expect(handler(request, mockReply, vi.fn())).rejects.toThrow(
      'URL parameter validation failed',
    )
  })
})

// ---------------------------------------------------------------------------
// Error formatting
// ---------------------------------------------------------------------------

describe('Validate Middleware — error formatting', () => {
  it('should group errors by field path', async () => {
    const schema = z.object({
      user: z.object({
        name: z.string().min(3),
        email: z.string().email(),
      }),
    })
    const handler = validateBody(schema)
    const request = mockRequest({
      body: { user: { name: 'A', email: 'invalid' } },
    })

    try {
      await handler(request, mockReply, vi.fn())
      expect.fail('Should have thrown')
    } catch (err: unknown) {
      const error = err as { details: { fields: Record<string, string[]>; issues: Array<{ path: (string | number)[] }> } }
      // Should have field errors keyed by dot-separated path
      expect(error.details.fields).toHaveProperty('user.name')
      expect(error.details.fields).toHaveProperty('user.email')
    }
  })

  it('should use _root key for root-level errors', async () => {
    const schema = z.string().min(5)
    const handler = validateBody(schema)
    const request = mockRequest({ body: 'ab' })

    try {
      await handler(request, mockReply, vi.fn())
      expect.fail('Should have thrown')
    } catch (err: unknown) {
      const error = err as { details: { fields: Record<string, string[]> } }
      expect(error.details.fields).toHaveProperty('_root')
    }
  })
})
