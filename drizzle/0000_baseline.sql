CREATE TABLE "bookings" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"user_id" text NOT NULL,
	"status" text DEFAULT 'confirmed' NOT NULL,
	"waitlist_position" integer,
	"booked_at" timestamp with time zone NOT NULL,
	"cancelled_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "check_ins" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"user_id" text NOT NULL,
	"checked_in_at" timestamp with time zone NOT NULL,
	"method" text DEFAULT 'qr' NOT NULL,
	"availability" text DEFAULT 'available' NOT NULL,
	"left_at" timestamp with time zone,
	"last_finished_at" timestamp with time zone,
	"consecutive_games" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "group_members" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'player' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"joined_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "groups" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"owner_id" text NOT NULL,
	"location" text,
	"default_fee" double precision DEFAULT 40 NOT NULL,
	"currency" text DEFAULT 'AED' NOT NULL,
	"settings" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_players" (
	"id" text PRIMARY KEY NOT NULL,
	"match_id" text NOT NULL,
	"user_id" text NOT NULL,
	"team" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_scores" (
	"id" text PRIMARY KEY NOT NULL,
	"match_id" text NOT NULL,
	"team_a_score" integer NOT NULL,
	"team_b_score" integer NOT NULL,
	"winner" text NOT NULL,
	"entered_by" text,
	"entered_at" timestamp with time zone NOT NULL,
	"confirmed" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"court" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"mode" text DEFAULT 'assisted' NOT NULL,
	"game_type" text DEFAULT 'casual' NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"body" text NOT NULL,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "overrides" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"match_id" text,
	"recommended" jsonb NOT NULL,
	"final" jsonb NOT NULL,
	"added_ids" jsonb NOT NULL,
	"removed_ids" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"user_id" text NOT NULL,
	"amount" double precision NOT NULL,
	"status" text DEFAULT 'unpaid' NOT NULL,
	"method" text,
	"paid_at" timestamp with time zone,
	"recorded_by" text
);
--> statement-breakpoint
CREATE TABLE "preferences" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"kind" text NOT NULL,
	"user_a_id" text NOT NULL,
	"user_b_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session_costs" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"label" text NOT NULL,
	"amount" double precision NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"venue_id" text,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"date" text NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"court_count" integer DEFAULT 4 NOT NULL,
	"capacity" integer DEFAULT 24 NOT NULL,
	"fee" double precision DEFAULT 40 NOT NULL,
	"currency" text DEFAULT 'AED' NOT NULL,
	"notes" text,
	"coordinator_id" text,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"game_type" text DEFAULT 'casual' NOT NULL,
	"points_to" integer DEFAULT 30 NOT NULL,
	"queue_mode" text DEFAULT 'assisted' NOT NULL,
	"weights" jsonb NOT NULL,
	"created_at" timestamp with time zone NOT NULL,
	"closed_at" timestamp with time zone,
	CONSTRAINT "sessions_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"phone" text,
	"email" text,
	"avatar_color" text DEFAULT '#3DD9A4' NOT NULL,
	"rating" double precision DEFAULT 1200 NOT NULL,
	"rating_games" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "venues" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"court_count" integer DEFAULT 4 NOT NULL
);
--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "check_ins" ADD CONSTRAINT "check_ins_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_members" ADD CONSTRAINT "group_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "groups" ADD CONSTRAINT "groups_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_players" ADD CONSTRAINT "match_players_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_players" ADD CONSTRAINT "match_players_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_scores" ADD CONSTRAINT "match_scores_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_scores" ADD CONSTRAINT "match_scores_entered_by_users_id_fk" FOREIGN KEY ("entered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overrides" ADD CONSTRAINT "overrides_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "overrides" ADD CONSTRAINT "overrides_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_recorded_by_users_id_fk" FOREIGN KEY ("recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preferences" ADD CONSTRAINT "preferences_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preferences" ADD CONSTRAINT "preferences_user_a_id_users_id_fk" FOREIGN KEY ("user_a_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preferences" ADD CONSTRAINT "preferences_user_b_id_users_id_fk" FOREIGN KEY ("user_b_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session_costs" ADD CONSTRAINT "session_costs_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_coordinator_id_users_id_fk" FOREIGN KEY ("coordinator_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "venues" ADD CONSTRAINT "venues_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "bookings_unique" ON "bookings" USING btree ("session_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "checkins_unique" ON "check_ins" USING btree ("session_id","user_id");--> statement-breakpoint
CREATE INDEX "gm_group_idx" ON "group_members" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "gm_user_idx" ON "group_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "mp_match_idx" ON "match_players" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "mp_user_idx" ON "match_players" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "matches_session_idx" ON "matches" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "notif_user_idx" ON "notifications" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "overrides_session_idx" ON "overrides" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payments_unique" ON "payments" USING btree ("session_id","user_id");--> statement-breakpoint
CREATE INDEX "prefs_session_idx" ON "preferences" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "sessions_group_idx" ON "sessions" USING btree ("group_id");