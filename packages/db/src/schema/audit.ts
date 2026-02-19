import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  jsonb,
  index,
} from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { users } from './users';

// ============================================================================
// TABLE: audit_logs
// ============================================================================

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    actorId: uuid('actor_id'),
    actorType: varchar('actor_type', { length: 20 }).notNull(),
    action: varchar('action', { length: 100 }).notNull(),
    targetType: varchar('target_type', { length: 50 }),
    targetId: uuid('target_id'),
    metadata: jsonb('metadata').$type<Record<string, unknown>>(),
    ipAddress: varchar('ip_address', { length: 45 }),
    userAgent: text('user_agent'),
    prevHash: varchar('prev_hash', { length: 128 }),
    contentHash: varchar('content_hash', { length: 128 }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_audit_logs_actor_id').on(table.actorId),
    index('idx_audit_logs_actor_type').on(table.actorType),
    index('idx_audit_logs_action').on(table.action),
    index('idx_audit_logs_target_type_id').on(table.targetType, table.targetId),
    index('idx_audit_logs_target_id').on(table.targetId),
    index('idx_audit_logs_created_at').on(table.createdAt),
    index('idx_audit_logs_ip_address').on(table.ipAddress),
    index('idx_audit_logs_actor_created').on(table.actorId, table.createdAt),
    index('idx_audit_logs_target_created').on(
      table.targetType,
      table.targetId,
      table.createdAt,
    ),
  ],
);

// ============================================================================
// TABLE: deleted_vault
// ============================================================================

export const deletedVault = pgTable(
  'deleted_vault',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    originalType: varchar('original_type', { length: 20 }).notNull(),
    originalId: uuid('original_id').notNull(),
    content: jsonb('content').notNull().$type<Record<string, unknown>>(),
    contentHash: varchar('content_hash', { length: 128 }),
    deletedBy: uuid('deleted_by').references(() => users.id, {
      onDelete: 'restrict',
    }),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    purgeAfter: timestamp('purge_after', { withTimezone: true, mode: 'date' })
      .notNull(),
    earlyPurgeRequestedAt: timestamp('early_purge_requested_at', {
      withTimezone: true,
      mode: 'date',
    }),
    earlyPurgeRequestedBy: uuid('early_purge_requested_by').references(
      () => users.id,
      { onDelete: 'set null' },
    ),
  },
  (table) => [
    index('idx_deleted_vault_original_type').on(table.originalType),
    index('idx_deleted_vault_original_id').on(table.originalId),
    index('idx_deleted_vault_deleted_by').on(table.deletedBy),
    index('idx_deleted_vault_deleted_at').on(table.deletedAt),
    index('idx_deleted_vault_purge_after').on(table.purgeAfter),
  ],
);

export const deletedVaultRelations = relations(deletedVault, ({ one }) => ({
  deleter: one(users, {
    fields: [deletedVault.deletedBy],
    references: [users.id],
    relationName: 'deletedByUser',
  }),
  earlyPurgeRequester: one(users, {
    fields: [deletedVault.earlyPurgeRequestedBy],
    references: [users.id],
    relationName: 'earlyPurgeRequester',
  }),
}));
