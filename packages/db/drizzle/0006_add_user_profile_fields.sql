-- Add profile and preference fields to users table
ALTER TABLE "users" ADD COLUMN "avatar_url" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "display_name" varchar(80);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "bio" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "theme" varchar(10) DEFAULT 'dark' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "notification_sound" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "notification_desktop" boolean DEFAULT true NOT NULL;
