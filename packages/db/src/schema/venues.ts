import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  primaryKey,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';

// ============================================================================
// TABLE: venues
// ============================================================================

export const venues = pgTable(
  'venues',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: varchar('name', { length: 200 }).notNull(),
    address: text('address'),
    status: varchar('status', { length: 20 }).default('active').notNull(),
    createdBy: uuid('created_by').references(() => users.id, {
      onDelete: 'restrict',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_venues_status').on(table.status),
    index('idx_venues_created_by').on(table.createdBy),
  ],
);

export const venuesRelations = relations(venues, ({ one, many }) => ({
  creator: one(users, {
    fields: [venues.createdBy],
    references: [users.id],
  }),
  userVenues: many(userVenues),
}));

// ============================================================================
// TABLE: user_venues
// ============================================================================

export const userVenues = pgTable(
  'user_venues',
  {
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    venueId: uuid('venue_id')
      .references(() => venues.id, { onDelete: 'cascade' })
      .notNull(),
    venueRole: varchar('venue_role', { length: 20 }).default('basic').notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.venueId] }),
    index('idx_user_venues_venue_id').on(table.venueId),
    index('idx_user_venues_user_id').on(table.userId),
    index('idx_user_venues_venue_role').on(table.venueRole),
  ],
);

export const userVenuesRelations = relations(userVenues, ({ one }) => ({
  user: one(users, {
    fields: [userVenues.userId],
    references: [users.id],
  }),
  venue: one(venues, {
    fields: [userVenues.venueId],
    references: [venues.id],
  }),
}));
