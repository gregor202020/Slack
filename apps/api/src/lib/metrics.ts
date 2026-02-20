/**
 * In-memory request metrics tracker.
 *
 * Tracks request count and cumulative response time for computing
 * averages. Exposed via the /api/metrics endpoint.
 *
 * This is intentionally simple — no external dependencies.
 * For production, replace with Prometheus/StatsD/Datadog.
 */

const startedAt = Date.now()

let requestCount = 0
let totalResponseTimeMs = 0

/**
 * Record a completed HTTP request.
 */
export function recordRequest(responseTimeMs: number): void {
  requestCount++
  totalResponseTimeMs += responseTimeMs
}

/**
 * Get current metrics snapshot.
 */
export function getMetrics(): {
  uptime: number
  requests: { total: number; avgResponseTimeMs: number }
  memory: { rss: number; heapUsed: number; heapTotal: number; external: number }
} {
  const mem = process.memoryUsage()

  return {
    uptime: Math.floor((Date.now() - startedAt) / 1000),
    requests: {
      total: requestCount,
      avgResponseTimeMs: requestCount > 0
        ? Math.round((totalResponseTimeMs / requestCount) * 100) / 100
        : 0,
    },
    memory: {
      rss: mem.rss,
      heapUsed: mem.heapUsed,
      heapTotal: mem.heapTotal,
      external: mem.external,
    },
  }
}
