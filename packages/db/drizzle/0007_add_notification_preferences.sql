-- Add notification_preferences jsonb column to users table
ALTER TABLE "users" ADD COLUMN "notification_preferences" jsonb;
