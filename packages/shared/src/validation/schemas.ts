import { z } from 'zod';
import {
  MAX_MESSAGE_LENGTH,
  MAX_CHANNEL_NAME_LENGTH,
  MAX_USER_NAME_LENGTH,
  MAX_EMAIL_LENGTH,
  MAX_ADDRESS_LENGTH,
  MAX_ANNOUNCEMENT_TITLE_LENGTH,
  MAX_ANNOUNCEMENT_BODY_LENGTH,
  MAX_MAINTENANCE_TITLE_LENGTH,
  MAX_MAINTENANCE_DESC_LENGTH,
  MAX_MAINTENANCE_COMMENT_LENGTH,
  MAX_SHIFT_ROLE_LABEL_LENGTH,
  MAX_SHIFT_NOTES_LENGTH,
  MAX_SEARCH_QUERY_LENGTH,
  MAX_CHANNEL_TOPIC_LENGTH,
  MAX_API_KEY_NAME_LENGTH,
  MAX_GROUP_DM_MEMBERS,
  MAX_DISPLAY_NAME_LENGTH,
  MAX_BIO_LENGTH,
  OTP_LENGTH,
} from '../constants/limits';

// ---------------------------------------------------------------------------
// Regex patterns
// ---------------------------------------------------------------------------

/** Channel names: lowercase alphanumeric, hyphens, underscores only. */
const CHANNEL_NAME_REGEX = /^[a-z0-9_-]+$/;

/** API key names: alphanumeric, hyphens, underscores, spaces. */
const API_KEY_NAME_REGEX = /^[a-zA-Z0-9_ -]+$/;

/** Australian E.164 phone (or generic international). Loose check — full validation server-side. */
export const PHONE_REGEX = /^\+[1-9]\d{6,14}$/;

// ---------------------------------------------------------------------------
// Auth schemas
// ---------------------------------------------------------------------------

export const otpRequestSchema = z.object({
  phone: z.string().regex(PHONE_REGEX, 'Invalid phone number format'),
  method: z.enum(['sms', 'email']).default('sms'),
});

export const otpVerifySchema = z.object({
  phone: z.string().regex(PHONE_REGEX, 'Invalid phone number format'),
  code: z
    .string()
    .length(OTP_LENGTH, `OTP code must be exactly ${OTP_LENGTH} digits`)
    .regex(/^\d+$/, 'OTP code must contain only digits'),
});

// ---------------------------------------------------------------------------
// User / onboarding schemas
// ---------------------------------------------------------------------------

export const completeOnboardingSchema = z.object({
  fullName: z.string().min(1, 'Full name is required').max(MAX_USER_NAME_LENGTH).trim(),
  email: z.string().min(1, 'Email is required').max(MAX_EMAIL_LENGTH).email('Invalid email format'),
  address: z.string().min(1, 'Address is required').max(MAX_ADDRESS_LENGTH).trim(),
  positionId: z.string().uuid('Invalid position ID'),
  timezone: z.string().min(1, 'Timezone is required'),
});

export const updateProfileSchema = z.object({
  fullName: z.string().min(1).max(MAX_USER_NAME_LENGTH).trim().optional(),
  email: z.string().max(MAX_EMAIL_LENGTH).email('Invalid email format').optional(),
  address: z.string().max(MAX_ADDRESS_LENGTH).trim().optional(),
  positionId: z.string().uuid('Invalid position ID').optional(),
  timezone: z.string().min(1).optional(),
  quietHoursEnabled: z.boolean().optional(),
});

export const updateUserProfileSchema = z.object({
  displayName: z.string().max(MAX_DISPLAY_NAME_LENGTH).trim().optional(),
  bio: z.string().max(MAX_BIO_LENGTH).trim().optional(),
  timezone: z.string().min(1).optional(),
});

export const updatePreferencesSchema = z.object({
  theme: z.enum(['dark', 'light']).optional(),
  notificationSound: z.boolean().optional(),
  notificationDesktop: z.boolean().optional(),
});

export const avatarUploadSchema = z.object({
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
});

// ---------------------------------------------------------------------------
// Venue schemas
// ---------------------------------------------------------------------------

export const createVenueSchema = z.object({
  name: z.string().min(1, 'Venue name is required').max(200).trim(),
  address: z.string().min(1, 'Venue address is required').max(MAX_ADDRESS_LENGTH).trim(),
});

export const updateVenueSchema = z.object({
  name: z.string().min(1).max(200).trim().optional(),
  address: z.string().min(1).max(MAX_ADDRESS_LENGTH).trim().optional(),
});

// ---------------------------------------------------------------------------
// Channel schemas
// ---------------------------------------------------------------------------

export const createChannelSchema = z.object({
  name: z
    .string()
    .min(1, 'Channel name is required')
    .max(MAX_CHANNEL_NAME_LENGTH)
    .regex(
      CHANNEL_NAME_REGEX,
      'Channel name must be lowercase and contain only letters, numbers, hyphens, and underscores',
    ),
  type: z.enum(['public', 'private']),
  scope: z.enum(['org', 'venue']),
  venueId: z.string().uuid('Invalid venue ID').optional(),
}).refine(
  (data) => data.scope !== 'venue' || !!data.venueId,
  { message: 'venueId is required when scope is venue', path: ['venueId'] },
)

export const updateChannelSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(MAX_CHANNEL_NAME_LENGTH)
    .regex(
      CHANNEL_NAME_REGEX,
      'Channel name must be lowercase and contain only letters, numbers, hyphens, and underscores',
    )
    .optional(),
  topic: z.string().max(MAX_CHANNEL_TOPIC_LENGTH).optional(),
  isDefault: z.boolean().optional(),
  isMandatory: z.boolean().optional(),
});

// ---------------------------------------------------------------------------
// Message schemas
// ---------------------------------------------------------------------------

export const sendMessageSchema = z
  .object({
    channelId: z.string().uuid('Invalid channel ID').optional(),
    dmId: z.string().uuid('Invalid DM ID').optional(),
    parentMessageId: z.string().uuid('Invalid parent message ID').optional(),
    body: z.string().min(1, 'Message body is required').max(MAX_MESSAGE_LENGTH),
  })
  .refine((data) => data.channelId || data.dmId, {
    message: 'Either channelId or dmId must be provided',
  });

export const editMessageSchema = z.object({
  body: z.string().min(1, 'Message body is required').max(MAX_MESSAGE_LENGTH),
});

// ---------------------------------------------------------------------------
// DM schemas
// ---------------------------------------------------------------------------

export const createDmSchema = z.object({
  type: z.enum(['direct', 'group']),
  memberUserIds: z
    .array(z.string().uuid('Invalid user ID'))
    .min(1, 'At least one member is required')
    .max(MAX_GROUP_DM_MEMBERS, `Group DMs cannot exceed ${MAX_GROUP_DM_MEMBERS} members`),
});

// ---------------------------------------------------------------------------
// Announcement schemas
// ---------------------------------------------------------------------------

export const createAnnouncementSchema = z.object({
  scope: z.enum(['system', 'venue', 'channel']),
  venueId: z.string().uuid('Invalid venue ID').optional(),
  channelId: z.string().uuid('Invalid channel ID').optional(),
  title: z.string().min(1, 'Announcement title is required').max(MAX_ANNOUNCEMENT_TITLE_LENGTH).trim(),
  body: z.string().min(1, 'Announcement body is required').max(MAX_ANNOUNCEMENT_BODY_LENGTH),
  ackRequired: z.boolean(),
}).refine(
  (data) => data.scope !== 'venue' || !!data.venueId,
  { message: 'venueId is required when scope is venue', path: ['venueId'] },
).refine(
  (data) => data.scope !== 'channel' || !!data.channelId,
  { message: 'channelId is required when scope is channel', path: ['channelId'] },
)

// ---------------------------------------------------------------------------
// Maintenance schemas
// ---------------------------------------------------------------------------

export const createMaintenanceSchema = z.object({
  venueId: z.string().uuid('Invalid venue ID'),
  title: z.string().min(1, 'Title is required').max(MAX_MAINTENANCE_TITLE_LENGTH).trim(),
  description: z.string().min(1, 'Description is required').max(MAX_MAINTENANCE_DESC_LENGTH),
  priority: z.enum(['low', 'medium', 'high', 'urgent']),
});

export const createMaintenanceCommentSchema = z.object({
  body: z.string().min(1, 'Comment body is required').max(MAX_MAINTENANCE_COMMENT_LENGTH),
});

// ---------------------------------------------------------------------------
// Shift schemas
// ---------------------------------------------------------------------------

export const createShiftSchema = z
  .object({
    venueId: z.string().uuid('Invalid venue ID'),
    userId: z.string().uuid('Invalid user ID'),
    startTime: z.string().datetime({ message: 'Start time must be a valid ISO 8601 datetime' }),
    endTime: z.string().datetime({ message: 'End time must be a valid ISO 8601 datetime' }),
    roleLabel: z.string().max(MAX_SHIFT_ROLE_LABEL_LENGTH).optional(),
    notes: z.string().max(MAX_SHIFT_NOTES_LENGTH).optional(),
  })
  .refine(
    (data) => new Date(data.endTime).getTime() > new Date(data.startTime).getTime(),
    { message: 'End time must be after start time' },
  )
  .refine(
    (data) => {
      const durationMs = new Date(data.endTime).getTime() - new Date(data.startTime).getTime();
      const twentyFourHoursMs = 24 * 60 * 60 * 1000;
      return durationMs <= twentyFourHoursMs;
    },
    { message: 'Shift duration cannot exceed 24 hours' },
  );

export const requestSwapSchema = z.object({
  shiftId: z.string().uuid('Invalid shift ID'),
  targetUserId: z.string().uuid('Invalid target user ID'),
  targetShiftId: z.string().uuid('Invalid target shift ID'),
});

// ---------------------------------------------------------------------------
// API key schemas
// ---------------------------------------------------------------------------

const apiKeyScopeSchema = z.object({
  action: z.string().min(1),
  resource: z.string().min(1),
});

export const createApiKeySchema = z.object({
  name: z
    .string()
    .min(1, 'API key name is required')
    .max(MAX_API_KEY_NAME_LENGTH)
    .regex(API_KEY_NAME_REGEX, 'API key name may only contain letters, numbers, hyphens, underscores, and spaces'),
  scopes: z.array(apiKeyScopeSchema).min(1, 'At least one scope is required'),
  ipAllowlist: z.array(z.string()).optional(),
  rateLimit: z.number().int().positive().optional(),
});

// ---------------------------------------------------------------------------
// Search schema
// ---------------------------------------------------------------------------

export const searchQuerySchema = z.object({
  query: z.string().min(1, 'Search query is required').max(MAX_SEARCH_QUERY_LENGTH),
});

// ---------------------------------------------------------------------------
// Bulk delete schemas
// ---------------------------------------------------------------------------

export const bulkDeletePreviewSchema = z.object({
  scope: z.enum(['org', 'channel']),
  channelId: z.string().uuid('Invalid channel ID').optional(),
  olderThanDays: z.number().int().positive('Age threshold must be a positive number'),
});

export const bulkDeleteExecuteSchema = z.object({
  scope: z.enum(['org', 'channel']),
  channelId: z.string().uuid('Invalid channel ID').optional(),
  olderThanDays: z.number().int().positive('Age threshold must be a positive number'),
  confirmationText: z.string().min(1, 'Confirmation text is required'),
});

// ---------------------------------------------------------------------------
// Pagination schema
// ---------------------------------------------------------------------------

export const cursorPaginationSchema = z.object({
  cursor: z.string().optional(),
  limit: z.number().int().min(1).max(100).default(25),
})

/** Query-string pagination — coerces `limit` from string and validates `cursor` as ISO datetime. */
export const paginationQuerySchema = z.object({
  cursor: z.string().datetime().optional(),
  limit: z.coerce.number().int().positive().max(100).default(25),
})
