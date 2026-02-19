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
import { venues } from './venues';

// ============================================================================
// TABLE: maintenance_requests
// ============================================================================

export const maintenanceRequests = pgTable(
  'maintenance_requests',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    venueId: uuid('venue_id')
      .references(() => venues.id, { onDelete: 'cascade' })
      .notNull(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    title: varchar('title', { length: 200 }).notNull(),
    description: text('description').notNull(),
    priority: varchar('priority', { length: 10 }).default('medium').notNull(),
    status: varchar('status', { length: 20 }).default('open').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_maintenance_requests_venue_id').on(table.venueId),
    index('idx_maintenance_requests_user_id').on(table.userId),
    index('idx_maintenance_requests_status').on(table.status),
    index('idx_maintenance_requests_priority').on(table.priority),
    index('idx_maintenance_requests_venue_status').on(
      table.venueId,
      table.status,
    ),
  ],
);

export const maintenanceRequestsRelations = relations(
  maintenanceRequests,
  ({ one, many }) => ({
    venue: one(venues, {
      fields: [maintenanceRequests.venueId],
      references: [venues.id],
    }),
    user: one(users, {
      fields: [maintenanceRequests.userId],
      references: [users.id],
    }),
    comments: many(maintenanceComments),
  }),
);

// ============================================================================
// TABLE: maintenance_comments
// ============================================================================

export const maintenanceComments = pgTable(
  'maintenance_comments',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    requestId: uuid('request_id')
      .references(() => maintenanceRequests.id, { onDelete: 'cascade' })
      .notNull(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    body: text('body').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_maintenance_comments_request_id').on(
      table.requestId,
      table.createdAt,
    ),
    index('idx_maintenance_comments_user_id').on(table.userId),
  ],
);

export const maintenanceCommentsRelations = relations(
  maintenanceComments,
  ({ one }) => ({
    request: one(maintenanceRequests, {
      fields: [maintenanceComments.requestId],
      references: [maintenanceRequests.id],
    }),
    user: one(users, {
      fields: [maintenanceComments.userId],
      references: [users.id],
    }),
  }),
);
