import {
  pgTable,
  uuid,
  text,
  timestamp,
  varchar,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';

// ============================================================================
// TABLE: device_tokens
// ============================================================================

export const deviceTokens = pgTable(
  'device_tokens',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    token: text('token').notNull(),
    platform: varchar('platform', { length: 20 }).notNull(), // 'ios', 'android', 'web'
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('idx_device_tokens_token').on(table.token),
    index('idx_device_tokens_user_id').on(table.userId),
    index('idx_device_tokens_platform').on(table.platform),
  ],
);

export const deviceTokensRelations = relations(deviceTokens, ({ one }) => ({
  user: one(users, {
    fields: [deviceTokens.userId],
    references: [users.id],
  }),
}));
