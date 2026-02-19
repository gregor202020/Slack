import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  timestamp,
  index,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users, userSessions } from './users';
import { venues } from './venues';
import { channels } from './channels';

// ============================================================================
// TABLE: announcements
// ============================================================================

export const announcements = pgTable(
  'announcements',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    scope: varchar('scope', { length: 10 }).notNull(),
    venueId: uuid('venue_id').references(() => venues.id, {
      onDelete: 'cascade',
    }),
    channelId: uuid('channel_id').references(() => channels.id, {
      onDelete: 'cascade',
    }),
    title: varchar('title', { length: 200 }).notNull(),
    body: text('body').notNull(),
    ackRequired: boolean('ack_required').notNull(),
    locked: boolean('locked').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_announcements_user_id').on(table.userId),
    index('idx_announcements_scope').on(table.scope),
    index('idx_announcements_venue_id').on(table.venueId),
    index('idx_announcements_channel_id').on(table.channelId),
    index('idx_announcements_created_at').on(table.createdAt),
  ],
);

export const announcementsRelations = relations(
  announcements,
  ({ one, many }) => ({
    user: one(users, {
      fields: [announcements.userId],
      references: [users.id],
    }),
    venue: one(venues, {
      fields: [announcements.venueId],
      references: [venues.id],
    }),
    channel: one(channels, {
      fields: [announcements.channelId],
      references: [channels.id],
    }),
    acks: many(announcementAcks),
    reminders: many(announcementReminders),
  }),
);

// ============================================================================
// TABLE: announcement_acks
// ============================================================================

export const announcementAcks = pgTable(
  'announcement_acks',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    announcementId: uuid('announcement_id')
      .references(() => announcements.id, { onDelete: 'cascade' })
      .notNull(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    ackedAt: timestamp('acked_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    sessionId: uuid('session_id')
      .references(() => userSessions.id, { onDelete: 'restrict' })
      .notNull(),
  },
  (table) => [
    uniqueIndex('uq_announcement_ack').on(
      table.announcementId,
      table.userId,
    ),
    index('idx_announcement_acks_announcement_id').on(table.announcementId),
    index('idx_announcement_acks_user_id').on(table.userId),
    index('idx_announcement_acks_session_id').on(table.sessionId),
  ],
);

export const announcementAcksRelations = relations(
  announcementAcks,
  ({ one }) => ({
    announcement: one(announcements, {
      fields: [announcementAcks.announcementId],
      references: [announcements.id],
    }),
    user: one(users, {
      fields: [announcementAcks.userId],
      references: [users.id],
    }),
    session: one(userSessions, {
      fields: [announcementAcks.sessionId],
      references: [userSessions.id],
    }),
  }),
);

// ============================================================================
// TABLE: announcement_reminders
// ============================================================================

export const announcementReminders = pgTable(
  'announcement_reminders',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    announcementId: uuid('announcement_id')
      .references(() => announcements.id, { onDelete: 'cascade' })
      .notNull(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    sentAt: timestamp('sent_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    reminderNumber: integer('reminder_number').notNull(),
  },
  (table) => [
    index('idx_announcement_reminders_announcement_user').on(
      table.announcementId,
      table.userId,
    ),
    index('idx_announcement_reminders_user_id').on(table.userId),
    index('idx_announcement_reminders_sent_at').on(table.sentAt),
  ],
);

export const announcementRemindersRelations = relations(
  announcementReminders,
  ({ one }) => ({
    announcement: one(announcements, {
      fields: [announcementReminders.announcementId],
      references: [announcements.id],
    }),
    user: one(users, {
      fields: [announcementReminders.userId],
      references: [users.id],
    }),
  }),
);
