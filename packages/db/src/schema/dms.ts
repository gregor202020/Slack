import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  primaryKey,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';

// ============================================================================
// TABLE: dms
// ============================================================================

export const dms = pgTable(
  'dms',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    type: varchar('type', { length: 10 }).default('direct').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    dissolvedAt: timestamp('dissolved_at', {
      withTimezone: true,
      mode: 'date',
    }),
    dissolvedBy: uuid('dissolved_by').references(() => users.id, {
      onDelete: 'set null',
    }),
  },
  (table) => [
    index('idx_dms_type').on(table.type),
  ],
);

export const dmsRelations = relations(dms, ({ one, many }) => ({
  dissolver: one(users, {
    fields: [dms.dissolvedBy],
    references: [users.id],
  }),
  members: many(dmMembers),
}));

// ============================================================================
// TABLE: dm_members
// ============================================================================

export const dmMembers = pgTable(
  'dm_members',
  {
    dmId: uuid('dm_id')
      .references(() => dms.id, { onDelete: 'cascade' })
      .notNull(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.dmId, table.userId] }),
    index('idx_dm_members_user_id').on(table.userId),
    index('idx_dm_members_dm_id').on(table.dmId),
  ],
);

export const dmMembersRelations = relations(dmMembers, ({ one }) => ({
  dm: one(dms, {
    fields: [dmMembers.dmId],
    references: [dms.id],
  }),
  user: one(users, {
    fields: [dmMembers.userId],
    references: [users.id],
  }),
}));
