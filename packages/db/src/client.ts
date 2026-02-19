import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema/index.js';

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  throw new Error('DATABASE_URL environment variable is not set');
}

/**
 * Raw postgres.js connection.
 * Use this for raw SQL queries or when you need direct access to the driver.
 */
export const sql = postgres(DATABASE_URL);

/**
 * Drizzle ORM database instance with full schema typing.
 */
export const db = drizzle(sql, { schema });
