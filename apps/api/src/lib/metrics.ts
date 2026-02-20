/**
 * In-memory request metrics tracker.
 *
 * Tracks request count and cumulative response time for computing
 * averages. Exposed via the /api/metrics endpoint (JSON) and
 * the /metrics endpoint (Prometheus text exposition format).
 *
 * This is intentionally simple — no external dependencies.
 */

const startedAt = Date.now()

let requestCount = 0
let totalResponseTimeMs = 0

// ---------------------------------------------------------------------------
// Prometheus-style counters and histograms (in-memory, no client library)
// ---------------------------------------------------------------------------

/**
 * http_requests_total — counter with { method, route, status } labels.
 * Key format: "method|route|status"
 */
const httpRequestsTotal = new Map<string, number>()

/**
 * http_request_duration_seconds — histogram.
 * Bucket boundaries in seconds. Each bucket tracks the count of requests
 * whose duration was <= the boundary.
 */
const HISTOGRAM_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]
const durationBucketCounts = new Map<string, number[]>()
const durationSums = new Map<string, number>()
const durationCounts = new Map<string, number>()

/** CPU usage tracking for rate computation */
let lastCpuUsage = process.cpuUsage()
let lastCpuTimestamp = process.hrtime.bigint()
let cpuPercent = 0

function updateCpuPercent(): void {
  const now = process.hrtime.bigint()
  const elapsed = Number(now - lastCpuTimestamp) / 1e9 // seconds
  if (elapsed < 1) return // only recalculate at most once per second

  const usage = process.cpuUsage(lastCpuUsage)
  const totalMicros = usage.user + usage.system
  cpuPercent = (totalMicros / 1e6) / elapsed // fraction of 1 CPU

  lastCpuUsage = process.cpuUsage()
  lastCpuTimestamp = now
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Record a completed HTTP request (legacy — used by onResponse hook).
 */
export function recordRequest(responseTimeMs: number): void {
  requestCount++
  totalResponseTimeMs += responseTimeMs
}

/**
 * Record a request with full Prometheus labels.
 */
export function recordPrometheusRequest(
  method: string,
  route: string,
  status: number,
  durationSeconds: number,
): void {
  // Counter
  const counterKey = `${method}|${route}|${status}`
  httpRequestsTotal.set(counterKey, (httpRequestsTotal.get(counterKey) ?? 0) + 1)

  // Histogram — keyed by method|route so we can break down per-endpoint
  const histKey = `${method}|${route}`
  if (!durationBucketCounts.has(histKey)) {
    durationBucketCounts.set(histKey, new Array(HISTOGRAM_BUCKETS.length).fill(0))
    durationSums.set(histKey, 0)
    durationCounts.set(histKey, 0)
  }
  const buckets = durationBucketCounts.get(histKey)!
  for (let i = 0; i < HISTOGRAM_BUCKETS.length; i++) {
    if (durationSeconds <= (HISTOGRAM_BUCKETS[i] ?? Infinity)) {
      buckets[i] = (buckets[i] ?? 0) + 1
    }
  }
  durationSums.set(histKey, durationSums.get(histKey)! + durationSeconds)
  durationCounts.set(histKey, durationCounts.get(histKey)! + 1)
}

/**
 * Get current metrics snapshot (JSON format — keeps backward compat).
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

/**
 * Build Prometheus text exposition format output.
 *
 * Accepts runtime values for websocket connections, db status, and redis
 * status that can't be read synchronously from this module.
 */
export function getPrometheusMetrics(runtime: {
  wsConnections: number
  dbConnected: boolean
  redisConnected: boolean
}): string {
  updateCpuPercent()

  const mem = process.memoryUsage()
  const uptimeSeconds = (Date.now() - startedAt) / 1000
  const lines: string[] = []

  // --- http_requests_total (counter) ---
  lines.push('# HELP http_requests_total Total HTTP requests')
  lines.push('# TYPE http_requests_total counter')
  for (const [key, count] of httpRequestsTotal) {
    const [method, route, status] = key.split('|')
    lines.push(`http_requests_total{method="${method}",route="${route}",status="${status}"} ${count}`)
  }

  // --- http_request_duration_seconds (histogram) ---
  lines.push('# HELP http_request_duration_seconds HTTP request duration in seconds')
  lines.push('# TYPE http_request_duration_seconds histogram')
  for (const [histKey, buckets] of durationBucketCounts) {
    const [method, route] = histKey.split('|')
    let cumulative = 0
    for (let i = 0; i < HISTOGRAM_BUCKETS.length; i++) {
      cumulative += (buckets[i] ?? 0)
      lines.push(
        `http_request_duration_seconds_bucket{method="${method}",route="${route}",le="${HISTOGRAM_BUCKETS[i] ?? ''}"} ${cumulative}`,
      )
    }
    const total = durationCounts.get(histKey) ?? 0
    lines.push(
      `http_request_duration_seconds_bucket{method="${method}",route="${route}",le="+Inf"} ${total}`,
    )
    lines.push(
      `http_request_duration_seconds_sum{method="${method}",route="${route}"} ${durationSums.get(histKey) ?? 0}`,
    )
    lines.push(
      `http_request_duration_seconds_count{method="${method}",route="${route}"} ${total}`,
    )
  }

  // --- websocket_connections_active (gauge) ---
  lines.push('# HELP websocket_connections_active Current active WebSocket connections')
  lines.push('# TYPE websocket_connections_active gauge')
  lines.push(`websocket_connections_active ${runtime.wsConnections}`)

  // --- database_connected (gauge, 1 = up, 0 = down) ---
  lines.push('# HELP database_connected Whether the database is reachable (1=up, 0=down)')
  lines.push('# TYPE database_connected gauge')
  lines.push(`database_connected ${runtime.dbConnected ? 1 : 0}`)

  // --- redis_connected (gauge, 1 = up, 0 = down) ---
  lines.push('# HELP redis_connected Whether Redis is reachable (1=up, 0=down)')
  lines.push('# TYPE redis_connected gauge')
  lines.push(`redis_connected ${runtime.redisConnected ? 1 : 0}`)

  // --- nodejs_process_memory_bytes (gauge with type label) ---
  lines.push('# HELP nodejs_process_memory_bytes Node.js process memory usage in bytes')
  lines.push('# TYPE nodejs_process_memory_bytes gauge')
  lines.push(`nodejs_process_memory_bytes{type="rss"} ${mem.rss}`)
  lines.push(`nodejs_process_memory_bytes{type="heapUsed"} ${mem.heapUsed}`)
  lines.push(`nodejs_process_memory_bytes{type="heapTotal"} ${mem.heapTotal}`)
  lines.push(`nodejs_process_memory_bytes{type="external"} ${mem.external}`)

  // --- nodejs_process_cpu_seconds_total (counter) ---
  const cpu = process.cpuUsage()
  const cpuSeconds = (cpu.user + cpu.system) / 1e6
  lines.push('# HELP nodejs_process_cpu_seconds_total Total CPU time spent in seconds')
  lines.push('# TYPE nodejs_process_cpu_seconds_total counter')
  lines.push(`nodejs_process_cpu_seconds_total ${cpuSeconds}`)

  // --- nodejs_process_uptime_seconds (gauge) ---
  lines.push('# HELP nodejs_process_uptime_seconds Process uptime in seconds')
  lines.push('# TYPE nodejs_process_uptime_seconds gauge')
  lines.push(`nodejs_process_uptime_seconds ${uptimeSeconds}`)

  return lines.join('\n') + '\n'
}
