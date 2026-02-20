import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  primaryKey,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { users } from './users';
import { venues } from './venues';

// ============================================================================
// TABLE: channels
// ============================================================================

export const channels = pgTable(
  'channels',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: varchar('name', { length: 80 }).notNull(),
    topic: text('topic'),
    description: text('description'),
    type: varchar('type', { length: 10 }).default('public').notNull(),
    scope: varchar('scope', { length: 10 }).default('org').notNull(),
    venueId: uuid('venue_id').references(() => venues.id, {
      onDelete: 'cascade',
    }),
    ownerUserId: uuid('owner_user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    isDefault: boolean('is_default').default(false).notNull(),
    isMandatory: boolean('is_mandatory').default(false).notNull(),
    status: varchar('status', { length: 20 }).default('active').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_channels_venue_id').on(table.venueId),
    index('idx_channels_owner_user_id').on(table.ownerUserId),
    index('idx_channels_status').on(table.status),
    index('idx_channels_scope').on(table.scope),
    index('idx_channels_type').on(table.type),
    uniqueIndex('idx_channels_unique_org_name')
      .on(table.name)
      .where(
        sql`${table.scope} = 'org' AND ${table.status} = 'active'`,
      ),
    uniqueIndex('idx_channels_unique_venue_name')
      .on(table.venueId, table.name)
      .where(
        sql`${table.scope} = 'venue' AND ${table.status} = 'active'`,
      ),
    // Full-text search GIN index on channel name
    index('idx_channels_name_fts').using('gin', sql`to_tsvector('english', ${table.name})`).where(sql`${table.status} = 'active'`),
  ],
);

export const channelsRelations = relations(channels, ({ one, many }) => ({
  venue: one(venues, {
    fields: [channels.venueId],
    references: [venues.id],
  }),
  owner: one(users, {
    fields: [channels.ownerUserId],
    references: [users.id],
  }),
  members: many(channelMembers),
}));

// ============================================================================
// TABLE: channel_members
// ============================================================================

export const channelMembers = pgTable(
  'channel_members',
  {
    channelId: uuid('channel_id')
      .references(() => channels.id, { onDelete: 'cascade' })
      .notNull(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    notificationPref: varchar('notification_pref', { length: 20 })
      .default('all')
      .notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.channelId, table.userId] }),
    index('idx_channel_members_user_id').on(table.userId),
    index('idx_channel_members_channel_id').on(table.channelId),
  ],
);

export const channelMembersRelations = relations(
  channelMembers,
  ({ one }) => ({
    channel: one(channels, {
      fields: [channelMembers.channelId],
      references: [channels.id],
    }),
    user: one(users, {
      fields: [channelMembers.userId],
      references: [users.id],
    }),
  }),
);
