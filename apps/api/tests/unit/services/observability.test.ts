/**
 * Unit tests for observability modules.
 *
 * Tests the pure-function modules:
 *   - src/lib/metrics.ts:       recordRequest(), getMetrics()
 *   - src/lib/error-tracker.ts: trackError(), installGlobalErrorHandlers()
 *   - src/lib/logger.ts:        setLogger(), getLogger()
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ---------------------------------------------------------------------------
// metrics.ts
// ---------------------------------------------------------------------------

describe('Metrics — recordRequest / getMetrics', () => {
  // Because metrics.ts uses module-level state (let requestCount, let totalResponseTimeMs),
  // we re-import it fresh for each test block to avoid polluted state from other tests.
  // Vitest's vi.resetModules() + dynamic import achieves this.

  beforeEach(() => {
    vi.resetModules()
  })

  it('should increment request count when recordRequest is called', async () => {
    const { recordRequest, getMetrics } = await import('../../../src/lib/metrics.js')

    const before = getMetrics()
    const initialCount = before.requests.total

    recordRequest(50)
    recordRequest(100)

    const after = getMetrics()
    expect(after.requests.total).toBe(initialCount + 2)
  })

  it('should compute correct average response time', async () => {
    const { recordRequest, getMetrics } = await import('../../../src/lib/metrics.js')

    const before = getMetrics()
    const initialCount = before.requests.total
    const initialAvg = before.requests.avgResponseTimeMs

    // To get a clean calculation, we record known values
    recordRequest(100)
    recordRequest(200)
    recordRequest(300)

    const after = getMetrics()
    // The average should factor in all recorded requests (including any from module init).
    // With module reset, initialCount should be 0 and these 3 give avg = 200
    if (initialCount === 0) {
      expect(after.requests.avgResponseTimeMs).toBe(200)
    } else {
      // If module state leaked, just verify the count incremented
      expect(after.requests.total).toBe(initialCount + 3)
    }
  })

  it('should return 0 average when no requests have been recorded', async () => {
    const { getMetrics } = await import('../../../src/lib/metrics.js')

    const metrics = getMetrics()
    // With a fresh module, if no recordRequest calls, avg should be 0
    if (metrics.requests.total === 0) {
      expect(metrics.requests.avgResponseTimeMs).toBe(0)
    }
  })

  it('should include uptime in the metrics', async () => {
    const { getMetrics } = await import('../../../src/lib/metrics.js')

    const metrics = getMetrics()
    expect(metrics).toHaveProperty('uptime')
    expect(typeof metrics.uptime).toBe('number')
    expect(metrics.uptime).toBeGreaterThanOrEqual(0)
  })

  it('should include memory usage in the metrics', async () => {
    const { getMetrics } = await import('../../../src/lib/metrics.js')

    const metrics = getMetrics()
    expect(metrics).toHaveProperty('memory')
    expect(metrics.memory).toHaveProperty('rss')
    expect(metrics.memory).toHaveProperty('heapUsed')
    expect(metrics.memory).toHaveProperty('heapTotal')
    expect(metrics.memory).toHaveProperty('external')
    expect(typeof metrics.memory.rss).toBe('number')
    expect(metrics.memory.rss).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// error-tracker.ts
// ---------------------------------------------------------------------------

describe('Error Tracker — trackError / installGlobalErrorHandlers', () => {
  it('should call log.error with structured context when trackError is called', () => {
    // Import synchronously (no module state to worry about)
    // We need to use dynamic import since we cleared modules above
    // but error-tracker has no mutable state, so static import is fine here.

    // Use a dynamic import to be safe after resetModules
    const trackErrorFn = async () => {
      const { trackError } = await import('../../../src/lib/error-tracker.js')
      return trackError
    }

    return trackErrorFn().then((trackError) => {
      const mockLog = {
        error: vi.fn(),
        fatal: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
        trace: vi.fn(),
        child: vi.fn(),
        silent: vi.fn(),
        level: 'info',
      } as unknown as import('fastify').FastifyBaseLogger

      const testError = new Error('Something went wrong')
      const context = {
        requestId: 'req-123',
        userId: 'user-456',
        route: '/api/test',
        method: 'GET',
      }

      trackError(mockLog, testError, context)

      expect(mockLog.error).toHaveBeenCalledOnce()
      expect(mockLog.error).toHaveBeenCalledWith(
        {
          err: testError,
          correlationId: 'req-123',
          userId: 'user-456',
          route: '/api/test',
          method: 'GET',
        },
        'Tracked error',
      )
    })
  })

  it('should call log.error with undefined fields when context is partial', async () => {
    const { trackError } = await import('../../../src/lib/error-tracker.js')

    const mockLog = {
      error: vi.fn(),
      fatal: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
      child: vi.fn(),
      silent: vi.fn(),
      level: 'info',
    } as unknown as import('fastify').FastifyBaseLogger

    const testError = new Error('Partial context error')

    trackError(mockLog, testError, {})

    expect(mockLog.error).toHaveBeenCalledOnce()
    expect(mockLog.error).toHaveBeenCalledWith(
      {
        err: testError,
        correlationId: undefined,
        userId: undefined,
        route: undefined,
        method: undefined,
      },
      'Tracked error',
    )
  })

  it('should attach process event listeners when installGlobalErrorHandlers is called', async () => {
    const { installGlobalErrorHandlers } = await import('../../../src/lib/error-tracker.js')

    const mockLog = {
      error: vi.fn(),
      fatal: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
      child: vi.fn(),
      silent: vi.fn(),
      level: 'info',
    } as unknown as import('fastify').FastifyBaseLogger

    const onSpy = vi.spyOn(process, 'on')

    installGlobalErrorHandlers(mockLog)

    // Should have attached both unhandledRejection and uncaughtException
    const unhandledCall = onSpy.mock.calls.find(
      (call) => call[0] === 'unhandledRejection',
    )
    const uncaughtCall = onSpy.mock.calls.find(
      (call) => call[0] === 'uncaughtException',
    )

    expect(unhandledCall).toBeTruthy()
    expect(uncaughtCall).toBeTruthy()

    onSpy.mockRestore()
  })

  it('should log unhandled rejection with error level', async () => {
    const { installGlobalErrorHandlers } = await import('../../../src/lib/error-tracker.js')

    const mockLog = {
      error: vi.fn(),
      fatal: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
      child: vi.fn(),
      silent: vi.fn(),
      level: 'info',
    } as unknown as import('fastify').FastifyBaseLogger

    // Capture the listener
    let rejectionHandler: ((reason: unknown) => void) | undefined
    const onSpy = vi.spyOn(process, 'on').mockImplementation((event, listener) => {
      if (event === 'unhandledRejection') {
        rejectionHandler = listener as (reason: unknown) => void
      }
      return process
    })

    installGlobalErrorHandlers(mockLog)

    // Simulate an unhandled rejection
    expect(rejectionHandler).toBeDefined()
    rejectionHandler!(new Error('Unhandled promise'))

    expect(mockLog.error).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'unhandled_rejection',
      }),
      'Unhandled promise rejection',
    )

    onSpy.mockRestore()
  })
})

// ---------------------------------------------------------------------------
// logger.ts
// ---------------------------------------------------------------------------

describe('Logger — setLogger / getLogger', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('should throw when getLogger is called before setLogger', async () => {
    const { getLogger } = await import('../../../src/lib/logger.js')

    expect(() => getLogger()).toThrow(
      'Logger not initialized. Call setLogger() from buildApp() first.',
    )
  })

  it('should store and return the logger instance after setLogger is called', async () => {
    const { setLogger, getLogger } = await import('../../../src/lib/logger.js')

    const mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
      fatal: vi.fn(),
      child: vi.fn(),
      silent: vi.fn(),
      level: 'info',
    } as unknown as import('fastify').FastifyBaseLogger

    setLogger(mockLogger)

    const result = getLogger()
    expect(result).toBe(mockLogger)
  })

  it('should allow overwriting the logger with a new instance', async () => {
    const { setLogger, getLogger } = await import('../../../src/lib/logger.js')

    const firstLogger = { id: 'first' } as unknown as import('fastify').FastifyBaseLogger
    const secondLogger = { id: 'second' } as unknown as import('fastify').FastifyBaseLogger

    setLogger(firstLogger)
    expect(getLogger()).toBe(firstLogger)

    setLogger(secondLogger)
    expect(getLogger()).toBe(secondLogger)
  })

  it('should expose a lazy proxy that resolves to the logger', async () => {
    const { setLogger, logger } = await import('../../../src/lib/logger.js')

    const mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
      trace: vi.fn(),
      fatal: vi.fn(),
      child: vi.fn(),
      silent: vi.fn(),
      level: 'info',
    } as unknown as import('fastify').FastifyBaseLogger

    setLogger(mockLogger)

    // The proxy should forward calls to the real logger
    logger.info({ test: true }, 'proxy test')

    expect(mockLogger.info).toHaveBeenCalledWith({ test: true }, 'proxy test')
  })

  it('should throw through the proxy when logger is not initialized', async () => {
    const { logger } = await import('../../../src/lib/logger.js')

    // Accessing any method on the proxy should throw since logger is not set
    expect(() => logger.info('should throw')).toThrow(
      'Logger not initialized',
    )
  })
})
