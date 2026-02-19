/**
 * Database helpers for test suites.
 *
 * Provides functions to create test fixtures and clean up
 * test data between runs. Uses the real Drizzle client so
 * E2E tests exercise the full data path.
 */

import {
  db,
  users,
  userSessions,
  venues,
  userVenues,
  channels,
  channelMembers,
  messages,
  messageReactions,
  messageVersions,
  announcements,
  announcementAcks,
  otpAttempts,
  auditLogs,
  deletedVault,
  mentions,
  files,
  deviceTokens,
  invites,
  dms,
  dmMembers,
  shifts,
  shiftSwaps,
  canvas,
  canvasVersions,
  apiKeys,
  linkPreviews,
} from '@smoker/db'
import { randomBytes, createHash } from 'node:crypto'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function randomUuid(): string {
  return crypto.randomUUID()
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

// ---------------------------------------------------------------------------
// Test user creation
// ---------------------------------------------------------------------------

export interface TestUser {
  id: string
  phone: string
  fullName: string
  orgRole: string
  status: string
}

export async function createTestUser(
  overrides: Partial<{
    id: string
    phone: string
    fullName: string
    orgRole: string
    status: string
    email: string
  }> = {},
): Promise<TestUser> {
  const id = overrides.id ?? randomUuid()
  const phone = overrides.phone ?? `+1555${Math.floor(1000000 + Math.random() * 9000000)}`

  const [user] = await db
    .insert(users)
    .values({
      id,
      phone,
      fullName: overrides.fullName ?? 'Test User',
      orgRole: overrides.orgRole ?? 'basic',
      status: overrides.status ?? 'active',
      email: overrides.email ?? null,
    })
    .returning()

  return user as TestUser
}

// ---------------------------------------------------------------------------
// Test session creation
// ---------------------------------------------------------------------------

export interface TestSession {
  id: string
  userId: string
  tokenHash: string
}

export async function createTestSession(
  userId: string,
  overrides: Partial<{
    id: string
    expiresAt: Date
    revokedAt: Date | null
  }> = {},
): Promise<TestSession> {
  const rawToken = randomBytes(32).toString('hex')
  const tokenHash = hashToken(rawToken)
  const expiresAt = overrides.expiresAt ?? new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  const [session] = await db
    .insert(userSessions)
    .values({
      id: overrides.id,
      userId,
      tokenHash,
      expiresAt,
      revokedAt: overrides.revokedAt ?? null,
      deviceFingerprintHash: null,
    })
    .returning()

  return session as TestSession
}

// ---------------------------------------------------------------------------
// Test venue creation
// ---------------------------------------------------------------------------

export interface TestVenue {
  id: string
  name: string
  status: string
}

export async function createTestVenue(
  overrides: Partial<{
    id: string
    name: string
    address: string
    createdBy: string
    status: string
  }> = {},
): Promise<TestVenue> {
  const [venue] = await db
    .insert(venues)
    .values({
      id: overrides.id,
      name: overrides.name ?? `Test Venue ${Date.now()}`,
      address: overrides.address ?? '123 Test St',
      createdBy: overrides.createdBy ?? null,
      status: overrides.status ?? 'active',
    })
    .returning()

  return venue as TestVenue
}

// ---------------------------------------------------------------------------
// Test venue membership
// ---------------------------------------------------------------------------

export async function addUserToVenue(
  userId: string,
  venueId: string,
  venueRole: string = 'basic',
): Promise<void> {
  await db.insert(userVenues).values({
    userId,
    venueId,
    venueRole,
  })
}

// ---------------------------------------------------------------------------
// Test channel creation
// ---------------------------------------------------------------------------

export interface TestChannel {
  id: string
  name: string
  type: string
  scope: string
  status: string
  venueId: string | null
  ownerUserId: string | null
}

export async function createTestChannel(
  overrides: Partial<{
    id: string
    name: string
    type: string
    scope: string
    venueId: string
    ownerUserId: string
    status: string
    isDefault: boolean
    isMandatory: boolean
  }> = {},
): Promise<TestChannel> {
  const [channel] = await db
    .insert(channels)
    .values({
      id: overrides.id,
      name: overrides.name ?? `test-channel-${Date.now()}`,
      type: overrides.type ?? 'public',
      scope: overrides.scope ?? 'org',
      venueId: overrides.venueId ?? null,
      ownerUserId: overrides.ownerUserId ?? null,
      status: overrides.status ?? 'active',
      isDefault: overrides.isDefault ?? false,
      isMandatory: overrides.isMandatory ?? false,
    })
    .returning()

  return channel as TestChannel
}

// ---------------------------------------------------------------------------
// Test channel membership
// ---------------------------------------------------------------------------

export async function addUserToChannel(
  channelId: string,
  userId: string,
): Promise<void> {
  await db.insert(channelMembers).values({
    channelId,
    userId,
    notificationPref: 'all',
  })
}

// ---------------------------------------------------------------------------
// Test message creation
// ---------------------------------------------------------------------------

export interface TestMessage {
  id: string
  channelId: string | null
  dmId: string | null
  userId: string
  body: string
  parentMessageId: string | null
  deletedAt: Date | null
}

export async function createTestMessage(
  overrides: Partial<{
    id: string
    channelId: string
    dmId: string
    userId: string
    body: string
    parentMessageId: string
    deletedAt: Date
  }>,
): Promise<TestMessage> {
  const [message] = await db
    .insert(messages)
    .values({
      id: overrides.id,
      channelId: overrides.channelId ?? null,
      dmId: overrides.dmId ?? null,
      userId: overrides.userId!,
      body: overrides.body ?? 'Test message',
      parentMessageId: overrides.parentMessageId ?? null,
      deletedAt: overrides.deletedAt ?? null,
    })
    .returning()

  return message as TestMessage
}

// ---------------------------------------------------------------------------
// Test announcement creation
// ---------------------------------------------------------------------------

export interface TestAnnouncement {
  id: string
  userId: string
  scope: string
  title: string
  body: string
  ackRequired: boolean
}

export async function createTestAnnouncement(
  overrides: Partial<{
    id: string
    userId: string
    scope: string
    venueId: string
    channelId: string
    title: string
    body: string
    ackRequired: boolean
  }>,
): Promise<TestAnnouncement> {
  const [announcement] = await db
    .insert(announcements)
    .values({
      id: overrides.id,
      userId: overrides.userId!,
      scope: overrides.scope ?? 'system',
      venueId: overrides.venueId ?? null,
      channelId: overrides.channelId ?? null,
      title: overrides.title ?? 'Test Announcement',
      body: overrides.body ?? 'This is a test announcement.',
      ackRequired: overrides.ackRequired ?? false,
    })
    .returning()

  return announcement as TestAnnouncement
}

// ---------------------------------------------------------------------------
// Test shift creation
// ---------------------------------------------------------------------------

export interface TestShift {
  id: string
  venueId: string
  userId: string
  startTime: Date
  endTime: Date
  roleLabel: string | null
  notes: string | null
  version: number
  lockedBySwapId: string | null
}

export async function createTestShift(
  overrides: {
    venueId: string
    userId: string
    startTime?: Date
    endTime?: Date
    roleLabel?: string
    notes?: string
    id?: string
  },
): Promise<TestShift> {
  const startTime = overrides.startTime ?? new Date(Date.now() + 24 * 60 * 60 * 1000)
  const endTime = overrides.endTime ?? new Date(startTime.getTime() + 8 * 60 * 60 * 1000)

  const [shift] = await db
    .insert(shifts)
    .values({
      id: overrides.id,
      venueId: overrides.venueId,
      userId: overrides.userId,
      startTime,
      endTime,
      roleLabel: overrides.roleLabel ?? null,
      notes: overrides.notes ?? null,
      version: 1,
    })
    .returning()

  return shift as TestShift
}

// ---------------------------------------------------------------------------
// Test shift swap creation
// ---------------------------------------------------------------------------

export interface TestShiftSwap {
  id: string
  shiftId: string
  requesterUserId: string
  targetUserId: string
  targetShiftId: string | null
  status: string
  expiresAt: Date
}

export async function createTestShiftSwap(
  overrides: {
    shiftId: string
    requesterUserId: string
    targetUserId: string
    targetShiftId: string
    status?: string
    expiresAt?: Date
    id?: string
  },
): Promise<TestShiftSwap> {
  const [swap] = await db
    .insert(shiftSwaps)
    .values({
      id: overrides.id,
      shiftId: overrides.shiftId,
      requesterUserId: overrides.requesterUserId,
      targetUserId: overrides.targetUserId,
      targetShiftId: overrides.targetShiftId,
      status: overrides.status ?? 'pending',
      expiresAt: overrides.expiresAt ?? new Date(Date.now() + 48 * 60 * 60 * 1000),
    })
    .returning()

  return swap as TestShiftSwap
}

// ---------------------------------------------------------------------------
// Test DM creation
// ---------------------------------------------------------------------------

export interface TestDm {
  id: string
  type: string
  createdAt: Date
  dissolvedAt: Date | null
}

export async function createTestDm(
  type: 'direct' | 'group' = 'direct',
  memberUserIds: string[],
): Promise<TestDm> {
  const [dm] = await db
    .insert(dms)
    .values({ type })
    .returning()

  for (const userId of memberUserIds) {
    await db.insert(dmMembers).values({
      dmId: dm!.id,
      userId,
    })
  }

  return dm as TestDm
}

// ---------------------------------------------------------------------------
// Test file creation
// ---------------------------------------------------------------------------

export interface TestFile {
  id: string
  userId: string
  channelId: string | null
  dmId: string | null
  originalFilename: string
  sanitizedFilename: string
  mimeType: string
  sizeBytes: bigint
  s3Key: string
  createdAt: Date
}

export async function createTestFile(
  overrides: {
    userId: string
    channelId?: string
    dmId?: string
    originalFilename?: string
    mimeType?: string
    sizeBytes?: number
    id?: string
  },
): Promise<TestFile> {
  const filename = overrides.originalFilename ?? 'test-file.txt'
  const s3Key = `uploads/${overrides.userId}/${Date.now()}-${filename}`

  const [file] = await db
    .insert(files)
    .values({
      id: overrides.id,
      userId: overrides.userId,
      channelId: overrides.channelId ?? null,
      dmId: overrides.dmId ?? null,
      originalFilename: filename,
      sanitizedFilename: filename,
      mimeType: overrides.mimeType ?? 'text/plain',
      sizeBytes: BigInt(overrides.sizeBytes ?? 1024),
      s3Key,
    })
    .returning()

  return file as TestFile
}

// ---------------------------------------------------------------------------
// Cleanup
// ---------------------------------------------------------------------------

/**
 * Delete all test data from the database in reverse dependency order.
 * Call this in afterAll/afterEach to keep the test DB clean.
 */
export async function cleanupTestData(): Promise<void> {
  // Order matters: delete children before parents
  // Files and file-related
  await db.delete(files)

  // Shift swaps before shifts
  await db.delete(shiftSwaps)
  await db.delete(shifts)

  // Canvas
  await db.delete(canvasVersions)
  await db.delete(canvas)

  // Announcements
  await db.delete(announcementAcks)
  await db.delete(announcements)

  // Messages and related
  await db.delete(linkPreviews)
  await db.delete(messageReactions)
  await db.delete(messageVersions)
  await db.delete(mentions)
  await db.delete(messages)

  // DMs
  await db.delete(dmMembers)
  await db.delete(dms)

  // Channels
  await db.delete(channelMembers)
  await db.delete(channels)

  // Venues
  await db.delete(userVenues)
  await db.delete(venues)

  // API keys, invites, device tokens
  await db.delete(apiKeys)
  await db.delete(invites)
  await db.delete(deviceTokens)

  // Auth-related
  await db.delete(otpAttempts)
  await db.delete(userSessions)

  // Audit and vault
  await db.delete(deletedVault)
  await db.delete(auditLogs)

  // Users last (everything references them)
  await db.delete(users)
}
