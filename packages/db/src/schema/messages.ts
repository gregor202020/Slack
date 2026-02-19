import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  index,
  uniqueIndex,
  check,
} from 'drizzle-orm/pg-core';
import { relations, sql } from 'drizzle-orm';
import { users } from './users';
import { channels } from './channels';
import { dms } from './dms';

// ============================================================================
// TABLE: messages
// ============================================================================

export const messages = pgTable(
  'messages',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    channelId: uuid('channel_id').references(() => channels.id, {
      onDelete: 'cascade',
    }),
    dmId: uuid('dm_id').references(() => dms.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    parentMessageId: uuid('parent_message_id'),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    index('idx_messages_channel_id').on(table.channelId),
    index('idx_messages_dm_id').on(table.dmId),
    index('idx_messages_user_id').on(table.userId),
    index('idx_messages_parent_message_id').on(table.parentMessageId),
    index('idx_messages_channel_created').on(table.channelId, table.createdAt),
    index('idx_messages_dm_created').on(table.dmId, table.createdAt),
    index('idx_messages_thread').on(table.parentMessageId, table.createdAt),
    // Partial indexes for non-deleted messages (Finding S-01)
    index('idx_messages_channel_active').on(table.channelId, table.createdAt).where(sql`deleted_at IS NULL`),
    index('idx_messages_dm_active').on(table.dmId, table.createdAt).where(sql`deleted_at IS NULL`),
    // CHECK: messages must target exactly one of channel or DM (Finding S-06)
    check('chk_messages_target', sql`(channel_id IS NOT NULL AND dm_id IS NULL) OR (channel_id IS NULL AND dm_id IS NOT NULL)`),
  ],
);

export const messagesRelations = relations(messages, ({ one, many }) => ({
  channel: one(channels, {
    fields: [messages.channelId],
    references: [channels.id],
  }),
  dm: one(dms, {
    fields: [messages.dmId],
    references: [dms.id],
  }),
  user: one(users, {
    fields: [messages.userId],
    references: [users.id],
  }),
  parentMessage: one(messages, {
    fields: [messages.parentMessageId],
    references: [messages.id],
    relationName: 'threadReplies',
  }),
  threadReplies: many(messages, { relationName: 'threadReplies' }),
  versions: many(messageVersions),
  reactions: many(messageReactions),
  mentions: many(mentions),
  linkPreviews: many(linkPreviews),
}));

// ============================================================================
// TABLE: message_versions
// ============================================================================

export const messageVersions = pgTable(
  'message_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    messageId: uuid('message_id')
      .references(() => messages.id, { onDelete: 'cascade' })
      .notNull(),
    body: text('body').notNull(),
    editedAt: timestamp('edited_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    editedBy: uuid('edited_by')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
  },
  (table) => [
    index('idx_message_versions_message_id').on(
      table.messageId,
      table.editedAt,
    ),
  ],
);

export const messageVersionsRelations = relations(
  messageVersions,
  ({ one }) => ({
    message: one(messages, {
      fields: [messageVersions.messageId],
      references: [messages.id],
    }),
    editor: one(users, {
      fields: [messageVersions.editedBy],
      references: [users.id],
    }),
  }),
);

// ============================================================================
// TABLE: message_reactions
// ============================================================================

export const messageReactions = pgTable(
  'message_reactions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    messageId: uuid('message_id')
      .references(() => messages.id, { onDelete: 'cascade' })
      .notNull(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    emoji: varchar('emoji', { length: 50 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    uniqueIndex('uq_reaction_per_user_emoji').on(
      table.messageId,
      table.userId,
      table.emoji,
    ),
    index('idx_message_reactions_message_id').on(table.messageId),
    index('idx_message_reactions_user_id').on(table.userId),
  ],
);

export const messageReactionsRelations = relations(
  messageReactions,
  ({ one }) => ({
    message: one(messages, {
      fields: [messageReactions.messageId],
      references: [messages.id],
    }),
    user: one(users, {
      fields: [messageReactions.userId],
      references: [users.id],
    }),
  }),
);

// ============================================================================
// TABLE: mentions
// ============================================================================

export const mentions = pgTable(
  'mentions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    messageId: uuid('message_id')
      .references(() => messages.id, { onDelete: 'cascade' })
      .notNull(),
    userId: uuid('mentioned_user_id').references(() => users.id, {
      onDelete: 'cascade',
    }),
    mentionType: varchar('mention_type', { length: 20 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_mentions_message_id').on(table.messageId),
    index('idx_mentions_mentioned_user_id').on(table.userId),
    index('idx_mentions_mention_type').on(table.mentionType),
  ],
);

export const mentionsRelations = relations(mentions, ({ one }) => ({
  message: one(messages, {
    fields: [mentions.messageId],
    references: [messages.id],
  }),
  user: one(users, {
    fields: [mentions.userId],
    references: [users.id],
  }),
}));

// ============================================================================
// TABLE: link_previews
// ============================================================================

export const linkPreviews = pgTable(
  'link_previews',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    messageId: uuid('message_id')
      .references(() => messages.id, { onDelete: 'cascade' })
      .notNull(),
    url: text('url').notNull(),
    title: text('title'),
    description: text('description'),
    imageUrl: text('image_url'),
    fetchedAt: timestamp('fetched_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_link_previews_message_id').on(table.messageId),
  ],
);

export const linkPreviewsRelations = relations(linkPreviews, ({ one }) => ({
  message: one(messages, {
    fields: [linkPreviews.messageId],
    references: [messages.id],
  }),
}));
