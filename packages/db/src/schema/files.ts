import {
  pgTable,
  uuid,
  varchar,
  text,
  bigint,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';
import { channels } from './channels';
import { dms } from './dms';
import { messages } from './messages';

// ============================================================================
// TABLE: files
// ============================================================================

export const files = pgTable(
  'files',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    channelId: uuid('channel_id').references(() => channels.id, {
      onDelete: 'set null',
    }),
    dmId: uuid('dm_id').references(() => dms.id, { onDelete: 'set null' }),
    messageId: uuid('message_id').references(() => messages.id, {
      onDelete: 'set null',
    }),
    originalFilename: varchar('original_filename', { length: 255 }).notNull(),
    sanitizedFilename: varchar('sanitized_filename', { length: 255 }).notNull(),
    mimeType: varchar('mime_type', { length: 100 }).notNull(),
    sizeBytes: bigint('size_bytes', { mode: 'bigint' }).notNull(),
    s3Key: text('s3_key').unique().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_files_user_id').on(table.userId),
    index('idx_files_channel_id').on(table.channelId),
    index('idx_files_dm_id').on(table.dmId),
    index('idx_files_message_id').on(table.messageId),
  ],
);

export const filesRelations = relations(files, ({ one }) => ({
  user: one(users, {
    fields: [files.userId],
    references: [users.id],
  }),
  channel: one(channels, {
    fields: [files.channelId],
    references: [channels.id],
  }),
  dm: one(dms, {
    fields: [files.dmId],
    references: [dms.id],
  }),
  message: one(messages, {
    fields: [files.messageId],
    references: [messages.id],
  }),
}));
