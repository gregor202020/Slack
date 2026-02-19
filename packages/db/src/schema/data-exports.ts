import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';

// ============================================================================
// TABLE: data_exports
// ============================================================================

export const dataExports = pgTable(
  'data_exports',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    requestedBy: uuid('requested_by')
      .references(() => users.id, { onDelete: 'restrict' })
      .notNull(),
    scope: varchar('scope', { length: 20 }).notNull(),
    targetUserId: uuid('target_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    format: varchar('format', { length: 10 }).default('json').notNull(),
    status: varchar('status', { length: 20 }).default('pending').notNull(),
    s3Key: text('s3_key'),
    encryptionKeyHash: varchar('encryption_key_hash', { length: 128 }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    completedAt: timestamp('completed_at', {
      withTimezone: true,
      mode: 'date',
    }),
    downloadedAt: timestamp('downloaded_at', {
      withTimezone: true,
      mode: 'date',
    }),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    index('idx_data_exports_requested_by').on(table.requestedBy),
    index('idx_data_exports_status').on(table.status),
    index('idx_data_exports_expires_at').on(table.expiresAt),
  ],
);

export const dataExportsRelations = relations(dataExports, ({ one }) => ({
  requester: one(users, {
    fields: [dataExports.requestedBy],
    references: [users.id],
    relationName: 'exportRequester',
  }),
  targetUser: one(users, {
    fields: [dataExports.targetUserId],
    references: [users.id],
    relationName: 'exportTarget',
  }),
}));
