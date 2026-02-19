import {
  pgTable,
  uuid,
  integer,
  boolean,
  timestamp,
  customType,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';
import { channels } from './channels';

// Custom type for bytea columns (Yjs binary state)
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

// ============================================================================
// TABLE: canvas
// ============================================================================

export const canvas = pgTable(
  'canvas',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    channelId: uuid('channel_id')
      .references(() => channels.id, { onDelete: 'cascade' })
      .unique()
      .notNull(),
    yjsState: bytea('yjs_state'),
    sizeBytes: integer('size_bytes').default(0).notNull(),
    locked: boolean('locked').default(false).notNull(),
    lockedBy: uuid('locked_by').references(() => users.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_canvas_channel_id').on(table.channelId),
  ],
);

export const canvasRelations = relations(canvas, ({ one, many }) => ({
  channel: one(channels, {
    fields: [canvas.channelId],
    references: [channels.id],
  }),
  locker: one(users, {
    fields: [canvas.lockedBy],
    references: [users.id],
  }),
  versions: many(canvasVersions),
}));

// ============================================================================
// TABLE: canvas_versions
// ============================================================================

export const canvasVersions = pgTable(
  'canvas_versions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    canvasId: uuid('canvas_id')
      .references(() => canvas.id, { onDelete: 'cascade' })
      .notNull(),
    yjsSnapshot: bytea('yjs_snapshot').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_canvas_versions_canvas_id').on(table.canvasId, table.createdAt),
  ],
);

export const canvasVersionsRelations = relations(
  canvasVersions,
  ({ one }) => ({
    canvas: one(canvas, {
      fields: [canvasVersions.canvasId],
      references: [canvas.id],
    }),
  }),
);
