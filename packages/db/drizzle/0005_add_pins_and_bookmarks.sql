-- Create pinned_messages table
CREATE TABLE IF NOT EXISTS "pinned_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "channel_id" uuid NOT NULL REFERENCES "channels"("id") ON DELETE CASCADE,
  "message_id" uuid NOT NULL REFERENCES "messages"("id") ON DELETE CASCADE,
  "pinned_by" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "pinned_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

-- Unique index on (channel_id, message_id) to prevent duplicate pins
CREATE UNIQUE INDEX IF NOT EXISTS "uq_pinned_channel_message" ON "pinned_messages" ("channel_id", "message_id");--> statement-breakpoint

-- Performance indexes for pinned_messages
CREATE INDEX IF NOT EXISTS "idx_pinned_messages_channel_id" ON "pinned_messages" ("channel_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_pinned_messages_message_id" ON "pinned_messages" ("message_id");--> statement-breakpoint

-- Create bookmarks table
CREATE TABLE IF NOT EXISTS "bookmarks" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "message_id" uuid NOT NULL REFERENCES "messages"("id") ON DELETE CASCADE,
  "note" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint

-- Unique index on (user_id, message_id) to prevent duplicate bookmarks
CREATE UNIQUE INDEX IF NOT EXISTS "uq_bookmark_user_message" ON "bookmarks" ("user_id", "message_id");--> statement-breakpoint

-- Performance indexes for bookmarks
CREATE INDEX IF NOT EXISTS "idx_bookmarks_user_id" ON "bookmarks" ("user_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bookmarks_message_id" ON "bookmarks" ("message_id");
