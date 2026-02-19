import {
  pgTable,
  uuid,
  varchar,
  text,
  integer,
  timestamp,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';
import { venues } from './venues';

// ============================================================================
// TABLE: shifts
// ============================================================================

export const shifts = pgTable(
  'shifts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    venueId: uuid('venue_id')
      .references(() => venues.id, { onDelete: 'cascade' })
      .notNull(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    startTime: timestamp('start_time', { withTimezone: true, mode: 'date' })
      .notNull(),
    endTime: timestamp('end_time', { withTimezone: true, mode: 'date' })
      .notNull(),
    roleLabel: varchar('role_label', { length: 100 }),
    notes: text('notes'),
    externalId: varchar('external_id', { length: 255 }),
    version: integer('version').default(1).notNull(),
    lockedBySwapId: uuid('locked_by_swap_id'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_shifts_venue_id').on(table.venueId),
    index('idx_shifts_user_id').on(table.userId),
    index('idx_shifts_start_time').on(table.startTime),
    index('idx_shifts_external_id').on(table.externalId),
    index('idx_shifts_locked_by_swap_id').on(table.lockedBySwapId),
    index('idx_shifts_user_upcoming').on(table.userId, table.startTime),
    index('idx_shifts_venue_time').on(table.venueId, table.startTime),
  ],
);

export const shiftsRelations = relations(shifts, ({ one, many }) => ({
  venue: one(venues, {
    fields: [shifts.venueId],
    references: [venues.id],
  }),
  user: one(users, {
    fields: [shifts.userId],
    references: [users.id],
  }),
  lockedBySwap: one(shiftSwaps, {
    fields: [shifts.lockedBySwapId],
    references: [shiftSwaps.id],
    relationName: 'lockedBySwap',
  }),
  swapRequests: many(shiftSwaps, { relationName: 'shiftSwaps' }),
}));

// ============================================================================
// TABLE: shift_swaps
// ============================================================================

export const shiftSwaps = pgTable(
  'shift_swaps',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    shiftId: uuid('shift_id')
      .references(() => shifts.id, { onDelete: 'cascade' })
      .notNull(),
    requesterUserId: uuid('requester_user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    targetUserId: uuid('target_user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    targetShiftId: uuid('target_shift_id').references(() => shifts.id, {
      onDelete: 'set null',
    }),
    status: varchar('status', { length: 20 }).default('pending').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    resolvedAt: timestamp('resolved_at', {
      withTimezone: true,
      mode: 'date',
    }),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' })
      .notNull(),
  },
  (table) => [
    index('idx_shift_swaps_shift_id').on(table.shiftId),
    index('idx_shift_swaps_requester').on(table.requesterUserId),
    index('idx_shift_swaps_target').on(table.targetUserId),
    index('idx_shift_swaps_status').on(table.status),
    index('idx_shift_swaps_expires_at').on(table.expiresAt),
  ],
);

export const shiftSwapsRelations = relations(shiftSwaps, ({ one }) => ({
  shift: one(shifts, {
    fields: [shiftSwaps.shiftId],
    references: [shifts.id],
    relationName: 'shiftSwaps',
  }),
  requester: one(users, {
    fields: [shiftSwaps.requesterUserId],
    references: [users.id],
  }),
  target: one(users, {
    fields: [shiftSwaps.targetUserId],
    references: [users.id],
  }),
  targetShift: one(shifts, {
    fields: [shiftSwaps.targetShiftId],
    references: [shifts.id],
    relationName: 'targetShiftSwaps',
  }),
}));
