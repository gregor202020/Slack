CREATE TABLE "announcement_acks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"announcement_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"acked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"session_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "announcement_reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"announcement_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"reminder_number" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "announcements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"scope" varchar(10) NOT NULL,
	"venue_id" uuid,
	"channel_id" uuid,
	"title" varchar(200) NOT NULL,
	"body" text NOT NULL,
	"ack_required" boolean NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"key_hash" varchar(128) NOT NULL,
	"scopes" jsonb NOT NULL,
	"ip_allowlist" jsonb,
	"rate_limit" integer DEFAULT 1000 NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "api_keys_name_unique" UNIQUE("name"),
	CONSTRAINT "api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" uuid,
	"actor_type" varchar(20) NOT NULL,
	"action" varchar(100) NOT NULL,
	"target_type" varchar(50),
	"target_id" uuid,
	"metadata" jsonb,
	"ip_address" varchar(45),
	"user_agent" text,
	"prev_hash" varchar(128),
	"content_hash" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deleted_vault" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"original_type" varchar(20) NOT NULL,
	"original_id" uuid NOT NULL,
	"content" jsonb NOT NULL,
	"content_hash" varchar(128),
	"deleted_by" uuid,
	"deleted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"purge_after" timestamp with time zone NOT NULL,
	"early_purge_requested_at" timestamp with time zone,
	"early_purge_requested_by" uuid
);
--> statement-breakpoint
CREATE TABLE "canvas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid NOT NULL,
	"yjs_state" "bytea",
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"locked" boolean DEFAULT false NOT NULL,
	"locked_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "canvas_channel_id_unique" UNIQUE("channel_id")
);
--> statement-breakpoint
CREATE TABLE "canvas_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"canvas_id" uuid NOT NULL,
	"yjs_snapshot" "bytea" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_members" (
	"channel_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"notification_pref" varchar(20) DEFAULT 'all' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "channel_members_channel_id_user_id_pk" PRIMARY KEY("channel_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "channels" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(80) NOT NULL,
	"topic" text,
	"description" text,
	"type" varchar(10) DEFAULT 'public' NOT NULL,
	"scope" varchar(10) DEFAULT 'org' NOT NULL,
	"venue_id" uuid,
	"owner_user_id" uuid,
	"is_default" boolean DEFAULT false NOT NULL,
	"is_mandatory" boolean DEFAULT false NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "data_exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"requested_by" uuid NOT NULL,
	"scope" varchar(20) NOT NULL,
	"target_user_id" uuid,
	"format" varchar(10) DEFAULT 'json' NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"s3_key" text,
	"encryption_key_hash" varchar(128),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"downloaded_at" timestamp with time zone,
	"expires_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "dm_members" (
	"dm_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dm_members_dm_id_user_id_pk" PRIMARY KEY("dm_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "dms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"type" varchar(10) DEFAULT 'direct' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dissolved_at" timestamp with time zone,
	"dissolved_by" uuid
);
--> statement-breakpoint
CREATE TABLE "files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"channel_id" uuid,
	"dm_id" uuid,
	"message_id" uuid,
	"original_filename" varchar(255) NOT NULL,
	"sanitized_filename" varchar(255) NOT NULL,
	"mime_type" varchar(100) NOT NULL,
	"size_bytes" bigint NOT NULL,
	"s3_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "files_s3_key_unique" UNIQUE("s3_key")
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone_hash" varchar(128) NOT NULL,
	"token_hash" varchar(128) NOT NULL,
	"invited_by" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invites_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "link_previews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"url" text NOT NULL,
	"title" text,
	"description" text,
	"image_url" text,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maintenance_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"request_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "maintenance_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text NOT NULL,
	"priority" varchar(10) DEFAULT 'medium' NOT NULL,
	"status" varchar(20) DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mentions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"mentioned_user_id" uuid,
	"mention_type" varchar(20) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_reactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"emoji" varchar(50) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "message_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"message_id" uuid NOT NULL,
	"body" text NOT NULL,
	"edited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_by" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"channel_id" uuid,
	"dm_id" uuid,
	"user_id" uuid NOT NULL,
	"parent_message_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "otp_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone_hash" varchar(128) NOT NULL,
	"attempt_type" varchar(10) NOT NULL,
	"success" boolean DEFAULT false NOT NULL,
	"ip_address" varchar(45),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(100) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "positions_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "shift_swaps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shift_id" uuid NOT NULL,
	"requester_user_id" uuid NOT NULL,
	"target_user_id" uuid NOT NULL,
	"target_shift_id" uuid,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"venue_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone NOT NULL,
	"role_label" varchar(100),
	"notes" text,
	"external_id" varchar(255),
	"version" integer DEFAULT 1 NOT NULL,
	"locked_by_swap_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"device_fingerprint_hash" varchar(128),
	"token_hash" varchar(128) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "user_sessions_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "user_venues" (
	"user_id" uuid NOT NULL,
	"venue_id" uuid NOT NULL,
	"venue_role" varchar(20) DEFAULT 'basic' NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_venues_user_id_venue_id_pk" PRIMARY KEY("user_id","venue_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone" varchar(20) NOT NULL,
	"email" text,
	"full_name" varchar(100) NOT NULL,
	"address" text,
	"position_id" uuid,
	"timezone" varchar(50) DEFAULT 'UTC' NOT NULL,
	"org_role" varchar(20) DEFAULT 'basic' NOT NULL,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"signup_at" timestamp with time zone,
	"profile_completed_at" timestamp with time zone,
	"quiet_hours_enabled" boolean DEFAULT true NOT NULL,
	"failed_otp_attempts" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_phone_unique" UNIQUE("phone")
);
--> statement-breakpoint
CREATE TABLE "venues" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"address" text,
	"status" varchar(20) DEFAULT 'active' NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "announcement_acks" ADD CONSTRAINT "announcement_acks_announcement_id_announcements_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_acks" ADD CONSTRAINT "announcement_acks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_acks" ADD CONSTRAINT "announcement_acks_session_id_user_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."user_sessions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_reminders" ADD CONSTRAINT "announcement_reminders_announcement_id_announcements_id_fk" FOREIGN KEY ("announcement_id") REFERENCES "public"."announcements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcement_reminders" ADD CONSTRAINT "announcement_reminders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "announcements" ADD CONSTRAINT "announcements_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_keys" ADD CONSTRAINT "api_keys_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deleted_vault" ADD CONSTRAINT "deleted_vault_deleted_by_users_id_fk" FOREIGN KEY ("deleted_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deleted_vault" ADD CONSTRAINT "deleted_vault_early_purge_requested_by_users_id_fk" FOREIGN KEY ("early_purge_requested_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canvas" ADD CONSTRAINT "canvas_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canvas" ADD CONSTRAINT "canvas_locked_by_users_id_fk" FOREIGN KEY ("locked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "canvas_versions" ADD CONSTRAINT "canvas_versions_canvas_id_canvas_id_fk" FOREIGN KEY ("canvas_id") REFERENCES "public"."canvas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_members" ADD CONSTRAINT "channel_members_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_members" ADD CONSTRAINT "channel_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channels" ADD CONSTRAINT "channels_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channels" ADD CONSTRAINT "channels_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_exports" ADD CONSTRAINT "data_exports_requested_by_users_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "data_exports" ADD CONSTRAINT "data_exports_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dm_members" ADD CONSTRAINT "dm_members_dm_id_dms_id_fk" FOREIGN KEY ("dm_id") REFERENCES "public"."dms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dm_members" ADD CONSTRAINT "dm_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dms" ADD CONSTRAINT "dms_dissolved_by_users_id_fk" FOREIGN KEY ("dissolved_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_dm_id_dms_id_fk" FOREIGN KEY ("dm_id") REFERENCES "public"."dms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "files" ADD CONSTRAINT "files_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "link_previews" ADD CONSTRAINT "link_previews_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_comments" ADD CONSTRAINT "maintenance_comments_request_id_maintenance_requests_id_fk" FOREIGN KEY ("request_id") REFERENCES "public"."maintenance_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_comments" ADD CONSTRAINT "maintenance_comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "maintenance_requests" ADD CONSTRAINT "maintenance_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mentions" ADD CONSTRAINT "mentions_mentioned_user_id_users_id_fk" FOREIGN KEY ("mentioned_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_reactions" ADD CONSTRAINT "message_reactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_versions" ADD CONSTRAINT "message_versions_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message_versions" ADD CONSTRAINT "message_versions_edited_by_users_id_fk" FOREIGN KEY ("edited_by") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_dm_id_dms_id_fk" FOREIGN KEY ("dm_id") REFERENCES "public"."dms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_swaps" ADD CONSTRAINT "shift_swaps_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_swaps" ADD CONSTRAINT "shift_swaps_requester_user_id_users_id_fk" FOREIGN KEY ("requester_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_swaps" ADD CONSTRAINT "shift_swaps_target_user_id_users_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_swaps" ADD CONSTRAINT "shift_swaps_target_shift_id_shifts_id_fk" FOREIGN KEY ("target_shift_id") REFERENCES "public"."shifts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_sessions" ADD CONSTRAINT "user_sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_venues" ADD CONSTRAINT "user_venues_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_venues" ADD CONSTRAINT "user_venues_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venues" ADD CONSTRAINT "venues_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_announcement_ack" ON "announcement_acks" USING btree ("announcement_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_announcement_acks_announcement_id" ON "announcement_acks" USING btree ("announcement_id");--> statement-breakpoint
CREATE INDEX "idx_announcement_acks_user_id" ON "announcement_acks" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_announcement_acks_session_id" ON "announcement_acks" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "idx_announcement_reminders_announcement_user" ON "announcement_reminders" USING btree ("announcement_id","user_id");--> statement-breakpoint
CREATE INDEX "idx_announcement_reminders_user_id" ON "announcement_reminders" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_announcement_reminders_sent_at" ON "announcement_reminders" USING btree ("sent_at");--> statement-breakpoint
CREATE INDEX "idx_announcements_user_id" ON "announcements" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_announcements_scope" ON "announcements" USING btree ("scope");--> statement-breakpoint
CREATE INDEX "idx_announcements_venue_id" ON "announcements" USING btree ("venue_id");--> statement-breakpoint
CREATE INDEX "idx_announcements_channel_id" ON "announcements" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "idx_announcements_created_at" ON "announcements" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_api_keys_key_hash" ON "api_keys" USING btree ("key_hash");--> statement-breakpoint
CREATE INDEX "idx_api_keys_created_by" ON "api_keys" USING btree ("created_by");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_actor_id" ON "audit_logs" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_actor_type" ON "audit_logs" USING btree ("actor_type");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_action" ON "audit_logs" USING btree ("action");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_target_type_id" ON "audit_logs" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_target_id" ON "audit_logs" USING btree ("target_id");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_created_at" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_ip_address" ON "audit_logs" USING btree ("ip_address");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_actor_created" ON "audit_logs" USING btree ("actor_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_audit_logs_target_created" ON "audit_logs" USING btree ("target_type","target_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_deleted_vault_original_type" ON "deleted_vault" USING btree ("original_type");--> statement-breakpoint
CREATE INDEX "idx_deleted_vault_original_id" ON "deleted_vault" USING btree ("original_id");--> statement-breakpoint
CREATE INDEX "idx_deleted_vault_deleted_by" ON "deleted_vault" USING btree ("deleted_by");--> statement-breakpoint
CREATE INDEX "idx_deleted_vault_deleted_at" ON "deleted_vault" USING btree ("deleted_at");--> statement-breakpoint
CREATE INDEX "idx_deleted_vault_purge_after" ON "deleted_vault" USING btree ("purge_after");--> statement-breakpoint
CREATE INDEX "idx_canvas_channel_id" ON "canvas" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "idx_canvas_versions_canvas_id" ON "canvas_versions" USING btree ("canvas_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_channel_members_user_id" ON "channel_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_channel_members_channel_id" ON "channel_members" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "idx_channels_venue_id" ON "channels" USING btree ("venue_id");--> statement-breakpoint
CREATE INDEX "idx_channels_owner_user_id" ON "channels" USING btree ("owner_user_id");--> statement-breakpoint
CREATE INDEX "idx_channels_status" ON "channels" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_channels_scope" ON "channels" USING btree ("scope");--> statement-breakpoint
CREATE INDEX "idx_channels_type" ON "channels" USING btree ("type");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_channels_unique_org_name" ON "channels" USING btree ("name") WHERE "channels"."scope" = 'org' AND "channels"."status" = 'active';--> statement-breakpoint
CREATE UNIQUE INDEX "idx_channels_unique_venue_name" ON "channels" USING btree ("venue_id","name") WHERE "channels"."scope" = 'venue' AND "channels"."status" = 'active';--> statement-breakpoint
CREATE INDEX "idx_data_exports_requested_by" ON "data_exports" USING btree ("requested_by");--> statement-breakpoint
CREATE INDEX "idx_data_exports_status" ON "data_exports" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_data_exports_expires_at" ON "data_exports" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_dm_members_user_id" ON "dm_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_dm_members_dm_id" ON "dm_members" USING btree ("dm_id");--> statement-breakpoint
CREATE INDEX "idx_dms_type" ON "dms" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_files_user_id" ON "files" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_files_channel_id" ON "files" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "idx_files_dm_id" ON "files" USING btree ("dm_id");--> statement-breakpoint
CREATE INDEX "idx_files_message_id" ON "files" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "idx_invites_phone_hash" ON "invites" USING btree ("phone_hash");--> statement-breakpoint
CREATE INDEX "idx_invites_token_hash" ON "invites" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "idx_invites_invited_by" ON "invites" USING btree ("invited_by");--> statement-breakpoint
CREATE INDEX "idx_invites_expires_at" ON "invites" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_link_previews_message_id" ON "link_previews" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "idx_maintenance_comments_request_id" ON "maintenance_comments" USING btree ("request_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_maintenance_comments_user_id" ON "maintenance_comments" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_maintenance_requests_venue_id" ON "maintenance_requests" USING btree ("venue_id");--> statement-breakpoint
CREATE INDEX "idx_maintenance_requests_user_id" ON "maintenance_requests" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_maintenance_requests_status" ON "maintenance_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_maintenance_requests_priority" ON "maintenance_requests" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "idx_maintenance_requests_venue_status" ON "maintenance_requests" USING btree ("venue_id","status");--> statement-breakpoint
CREATE INDEX "idx_mentions_message_id" ON "mentions" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "idx_mentions_mentioned_user_id" ON "mentions" USING btree ("mentioned_user_id");--> statement-breakpoint
CREATE INDEX "idx_mentions_mention_type" ON "mentions" USING btree ("mention_type");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_reaction_per_user_emoji" ON "message_reactions" USING btree ("message_id","user_id","emoji");--> statement-breakpoint
CREATE INDEX "idx_message_reactions_message_id" ON "message_reactions" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "idx_message_reactions_user_id" ON "message_reactions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_message_versions_message_id" ON "message_versions" USING btree ("message_id","edited_at");--> statement-breakpoint
CREATE INDEX "idx_messages_channel_id" ON "messages" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "idx_messages_dm_id" ON "messages" USING btree ("dm_id");--> statement-breakpoint
CREATE INDEX "idx_messages_user_id" ON "messages" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_messages_parent_message_id" ON "messages" USING btree ("parent_message_id");--> statement-breakpoint
CREATE INDEX "idx_messages_channel_created" ON "messages" USING btree ("channel_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_messages_dm_created" ON "messages" USING btree ("dm_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_messages_thread" ON "messages" USING btree ("parent_message_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_otp_attempts_phone_hash" ON "otp_attempts" USING btree ("phone_hash");--> statement-breakpoint
CREATE INDEX "idx_otp_attempts_ip_address" ON "otp_attempts" USING btree ("ip_address");--> statement-breakpoint
CREATE INDEX "idx_otp_attempts_type" ON "otp_attempts" USING btree ("attempt_type");--> statement-breakpoint
CREATE INDEX "idx_otp_attempts_created_at" ON "otp_attempts" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_shift_swaps_shift_id" ON "shift_swaps" USING btree ("shift_id");--> statement-breakpoint
CREATE INDEX "idx_shift_swaps_requester" ON "shift_swaps" USING btree ("requester_user_id");--> statement-breakpoint
CREATE INDEX "idx_shift_swaps_target" ON "shift_swaps" USING btree ("target_user_id");--> statement-breakpoint
CREATE INDEX "idx_shift_swaps_status" ON "shift_swaps" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_shift_swaps_expires_at" ON "shift_swaps" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_shifts_venue_id" ON "shifts" USING btree ("venue_id");--> statement-breakpoint
CREATE INDEX "idx_shifts_user_id" ON "shifts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_shifts_start_time" ON "shifts" USING btree ("start_time");--> statement-breakpoint
CREATE INDEX "idx_shifts_external_id" ON "shifts" USING btree ("external_id");--> statement-breakpoint
CREATE INDEX "idx_shifts_locked_by_swap_id" ON "shifts" USING btree ("locked_by_swap_id");--> statement-breakpoint
CREATE INDEX "idx_shifts_user_upcoming" ON "shifts" USING btree ("user_id","start_time");--> statement-breakpoint
CREATE INDEX "idx_shifts_venue_time" ON "shifts" USING btree ("venue_id","start_time");--> statement-breakpoint
CREATE INDEX "idx_user_sessions_user_id" ON "user_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_sessions_expires_at" ON "user_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_user_sessions_token_hash" ON "user_sessions" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "idx_user_venues_venue_id" ON "user_venues" USING btree ("venue_id");--> statement-breakpoint
CREATE INDEX "idx_user_venues_user_id" ON "user_venues" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_venues_venue_role" ON "user_venues" USING btree ("venue_role");--> statement-breakpoint
CREATE INDEX "idx_users_status" ON "users" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_users_org_role" ON "users" USING btree ("org_role");--> statement-breakpoint
CREATE INDEX "idx_users_position_id" ON "users" USING btree ("position_id");--> statement-breakpoint
CREATE INDEX "idx_users_phone" ON "users" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "idx_venues_status" ON "venues" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_venues_created_by" ON "venues" USING btree ("created_by");