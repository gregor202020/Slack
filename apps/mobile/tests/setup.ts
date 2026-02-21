/**
 * Test setup for mobile app unit tests.
 *
 * Provides mock globals and polyfills needed to run
 * React Native / Expo code in a Node.js vitest environment.
 */

import { vi } from 'vitest'

// Mock __DEV__ global used by React Native
;(globalThis as Record<string, unknown>).__DEV__ = true

// Mock fetch globally
globalThis.fetch = vi.fn()

// Reset mocks between tests
import { beforeEach } from 'vitest'

beforeEach(() => {
  vi.restoreAllMocks()
  ;(globalThis.fetch as ReturnType<typeof vi.fn>).mockReset()
})
