import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
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
 * Drizzle ORM database instance with full schema typing.
 */
export const db = drizzle(sql, { schema });

/**
 * Gracefully close the database connection pool.
 * Call this during application shutdown.
 */
export async function closeDb() {
  await sql.end();
}
