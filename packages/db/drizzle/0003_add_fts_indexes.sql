-- Full-text search indexes using GIN + tsvector
-- Enables fast search across messages, channels, and users

-- Messages: GIN index on body tsvector (english config), only non-deleted
CREATE INDEX "idx_messages_body_fts" ON "messages" USING gin (to_tsvector('english', "body")) WHERE "deleted_at" IS NULL;--> statement-breakpoint

-- Channels: GIN index on name tsvector, only active channels
CREATE INDEX "idx_channels_name_fts" ON "channels" USING gin (to_tsvector('english', "name")) WHERE "status" = 'active';--> statement-breakpoint

-- Users: GIN index on full_name tsvector, only active users
CREATE INDEX "idx_users_fullname_fts" ON "users" USING gin (to_tsvector('english', "full_name")) WHERE "status" = 'active';
