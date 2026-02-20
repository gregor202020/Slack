-- Add last_read_at column to channel_members for unread message tracking
ALTER TABLE "channel_members" ADD COLUMN "last_read_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint

-- Add last_read_at column to dm_members for unread message tracking
ALTER TABLE "dm_members" ADD COLUMN "last_read_at" timestamp with time zone DEFAULT now() NOT NULL;
