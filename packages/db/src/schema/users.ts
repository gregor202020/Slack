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
import { relations, sql } from 'drizzle-orm';

// ============================================================================
// TABLE: positions
// ============================================================================

export const positions = pgTable(
  'positions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    name: varchar('name', { length: 100 }).unique().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
);

export const positionsRelations = relations(positions, ({ many }) => ({
  users: many(users),
}));

// ============================================================================
// TABLE: users
// ============================================================================

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    phone: varchar('phone', { length: 20 }).unique().notNull(),
    email: text('email'),
    fullName: varchar('full_name', { length: 100 }).notNull(),
    address: text('address'),
    positionId: uuid('position_id').references(() => positions.id, {
      onDelete: 'set null',
    }),
    avatarUrl: text('avatar_url'),
    displayName: varchar('display_name', { length: 80 }),
    bio: text('bio'),
    timezone: varchar('timezone', { length: 50 }).default('UTC').notNull(),
    theme: varchar('theme', { length: 10 }).default('dark').notNull(),
    notificationSound: boolean('notification_sound').default(true).notNull(),
    notificationDesktop: boolean('notification_desktop').default(true).notNull(),
    orgRole: varchar('org_role', { length: 20 }).default('basic').notNull(),
    status: varchar('status', { length: 20 }).default('active').notNull(),
    signupAt: timestamp('signup_at', { withTimezone: true, mode: 'date' }),
    profileCompletedAt: timestamp('profile_completed_at', {
      withTimezone: true,
      mode: 'date',
    }),
    quietHoursEnabled: boolean('quiet_hours_enabled').default(true).notNull(),
    failedOtpAttempts: integer('failed_otp_attempts').default(0).notNull(),
    lockedUntil: timestamp('locked_until', {
      withTimezone: true,
      mode: 'date',
    }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_users_status').on(table.status),
    index('idx_users_org_role').on(table.orgRole),
    index('idx_users_position_id').on(table.positionId),
    index('idx_users_phone').on(table.phone),
    // Full-text search GIN index on full_name
    index('idx_users_fullname_fts').using('gin', sql`to_tsvector('english', ${table.fullName})`).where(sql`${table.status} = 'active'`),
  ],
);

export const usersRelations = relations(users, ({ one, many }) => ({
  position: one(positions, {
    fields: [users.positionId],
    references: [positions.id],
  }),
  sessions: many(userSessions),
  invitesSent: many(invites),
}));

// ============================================================================
// TABLE: invites
// ============================================================================

export const invites = pgTable(
  'invites',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    phoneHash: varchar('phone_hash', { length: 128 }).notNull(),
    tokenHash: varchar('token_hash', { length: 128 }).unique().notNull(),
    invitedBy: uuid('invited_by')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' })
      .notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_invites_phone_hash').on(table.phoneHash),
    index('idx_invites_token_hash').on(table.tokenHash),
    index('idx_invites_invited_by').on(table.invitedBy),
    index('idx_invites_expires_at').on(table.expiresAt),
  ],
);

export const invitesRelations = relations(invites, ({ one }) => ({
  invitedByUser: one(users, {
    fields: [invites.invitedBy],
    references: [users.id],
  }),
}));

// ============================================================================
// TABLE: otp_attempts
// ============================================================================

export const otpAttempts = pgTable(
  'otp_attempts',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    phoneHash: varchar('phone_hash', { length: 128 }).notNull(),
    attemptType: varchar('attempt_type', { length: 10 }).notNull(),
    success: boolean('success').default(false).notNull(),
    ipAddress: varchar('ip_address', { length: 45 }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    index('idx_otp_attempts_phone_hash').on(table.phoneHash),
    index('idx_otp_attempts_ip_address').on(table.ipAddress),
    index('idx_otp_attempts_type').on(table.attemptType),
    index('idx_otp_attempts_created_at').on(table.createdAt),
  ],
);

// ============================================================================
// TABLE: user_sessions
// ============================================================================

export const userSessions = pgTable(
  'user_sessions',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    userId: uuid('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    deviceFingerprintHash: varchar('device_fingerprint_hash', { length: 128 }),
    tokenHash: varchar('token_hash', { length: 128 }).unique().notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' })
      .notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
  },
  (table) => [
    index('idx_user_sessions_user_id').on(table.userId),
    index('idx_user_sessions_expires_at').on(table.expiresAt),
    index('idx_user_sessions_token_hash').on(table.tokenHash),
  ],
);

export const userSessionsRelations = relations(userSessions, ({ one }) => ({
  user: one(users, {
    fields: [userSessions.userId],
    references: [users.id],
  }),
}));
