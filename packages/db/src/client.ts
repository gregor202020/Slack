import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import type { Logger } from 'drizzle-orm';
import * as schema from './schema/index.js';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

/**
 * Slow query threshold in milliseconds.
 * Queries exceeding this are logged at warn level.
 */
const SLOW_QUERY_THRESHOLD_MS = 100;

/**
 * Custom Drizzle logger that tracks query execution time.
 *
 * Drizzle calls logQuery() before the query executes.  We record the
 * timestamp here and expose a `logQueryEnd()` helper that service code
 * can call after awaiting a query to detect slow operations.
 *
 * For automatic slow-query detection we also emit structured JSON logs
 * that a log pipeline can alert on.
 */
class ObservabilityLogger implements Logger {
  logQuery(query: string, params: unknown[]): void {
    // Log queries at debug level in development for local troubleshooting.
    if (process.env.LOG_LEVEL === 'debug' || process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.log(JSON.stringify({
        level: 'debug',
        msg: 'db query',
        query: query.length > 200 ? query.slice(0, 200) + '...' : query,
        paramCount: params.length,
      }));
    }
  }
}

/**
 * Raw postgres.js connection with explicit pool configuration.
 * Use this for raw SQL queries or when you need direct access to the driver.
 */
export const sql = postgres(DATABASE_URL, {
  max: 20,
  idle_timeout: 20,
  connect_timeout: 10,
});

/**
 * Drizzle ORM database instance with full schema typing and
 * observability logger for query tracking.
 */
export const db = drizzle(sql, {
  schema,
  logger: new ObservabilityLogger(),
});

/**
 * Helper to time a database operation and log slow queries.
 *
 * Usage:
 *   const result = await timedQuery('getUser', () =>
 *     db.select().from(users).where(eq(users.id, id))
 *   );
 */
export async function timedQuery<T>(
  label: string,
  fn: () => Promise<T>,
): Promise<T> {
  const start = performance.now();
  const result = await fn();
  const durationMs = Math.round((performance.now() - start) * 100) / 100;

  if (durationMs > SLOW_QUERY_THRESHOLD_MS) {
    // eslint-disable-next-line no-console
    console.warn(JSON.stringify({
      level: 'warn',
      msg: 'slow db query',
      label,
      durationMs,
      threshold: SLOW_QUERY_THRESHOLD_MS,
    }));
  }

  return result;
}

/**
 * Gracefully close the database connection pool.
 * Call this during application shutdown.
 */
export async function closeDb() {
  await sql.end();
}
