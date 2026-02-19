import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';

// ============================================================================
// TABLE: api_keys
// ============================================================================

export const apiKeys = pgTable(
  'api_keys',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: varchar('name', { length: 100 }).unique().notNull(),
    keyHash: varchar('key_hash', { length: 128 }).unique().notNull(),
    scopes: jsonb('scopes').notNull().$type<
      Array<{ action: string; resource: string }>
    >(),
    ipAllowlist: jsonb('ip_allowlist').$type<string[]>(),
    rateLimit: integer('rate_limit').default(1000).notNull(),
    createdBy: uuid('created_by')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    index('idx_api_keys_key_hash').on(table.keyHash),
    index('idx_api_keys_created_by').on(table.createdBy),
  ],
);

export const apiKeysRelations = relations(apiKeys, ({ one }) => ({
  creator: one(users, {
    fields: [apiKeys.createdBy],
    references: [users.id],
  }),
}));
