// --- Field length limits (from spec Section 19) ---
export const MAX_MESSAGE_LENGTH = 40_000;
export const MAX_CHANNEL_NAME_LENGTH = 80;
export const MAX_USER_NAME_LENGTH = 100;
export const MAX_EMAIL_LENGTH = 254;
export const MAX_ADDRESS_LENGTH = 500;
export const MAX_ANNOUNCEMENT_TITLE_LENGTH = 200;
export const MAX_ANNOUNCEMENT_BODY_LENGTH = 40_000;
export const MAX_MAINTENANCE_TITLE_LENGTH = 200;
export const MAX_MAINTENANCE_DESC_LENGTH = 10_000;
export const MAX_MAINTENANCE_COMMENT_LENGTH = 5_000;
export const MAX_SHIFT_ROLE_LABEL_LENGTH = 100;
export const MAX_SHIFT_NOTES_LENGTH = 1_000;
export const MAX_SEARCH_QUERY_LENGTH = 500;
export const MAX_CANVAS_SIZE_BYTES = 5 * 1024 * 1024;
export const MAX_FILE_SIZE_BYTES = 100 * 1024 * 1024;
export const MAX_GROUP_DM_MEMBERS = 50;
export const MAX_REACTIONS_PER_MESSAGE = 20;
export const MAX_CHANNEL_TOPIC_LENGTH = 500;
export const MAX_API_KEY_NAME_LENGTH = 100;
export const MAX_FILENAME_LENGTH = 255;

// --- Auth & session timing ---
export const OTP_LENGTH = 6;
export const OTP_EXPIRY_SECONDS = 300;
export const SESSION_DURATION_DAYS = 7;
export const ACCESS_TOKEN_EXPIRY_SECONDS = 900;
export const INVITE_EXPIRY_DAYS = 7;

// --- Retention & lifecycle ---
export const VAULT_RETENTION_DAYS = 180;
export const SWAP_EXPIRY_HOURS = 48;
export const EARLY_PURGE_DELAY_HOURS = 48;

// --- Notification timing ---
export const ANNOUNCEMENT_REMINDER_INTERVAL_HOURS = 3;
export const QUIET_HOURS_START = 22;
export const QUIET_HOURS_END = 10;
export const ESCALATION_REMINDER_THRESHOLD = 2;
