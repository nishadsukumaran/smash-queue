CREATE TABLE "tournament_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"tournament_id" text NOT NULL,
	"name" text NOT NULL,
	"gender" text DEFAULT 'open' NOT NULL,
	"team_size" integer DEFAULT 2 NOT NULL,
	"level" text,
	"format" text DEFAULT 'knockout' NOT NULL,
	"group_size" integer DEFAULT 4 NOT NULL,
	"advance_per_group" integer DEFAULT 2 NOT NULL,
	"max_entries" integer,
	"fee" double precision DEFAULT 0 NOT NULL,
	"fee_basis" text DEFAULT 'player' NOT NULL,
	"points_to" integer DEFAULT 21 NOT NULL,
	"best_of" integer DEFAULT 1 NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"drawn_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tournament_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"tournament_id" text NOT NULL,
	"category_id" text NOT NULL,
	"player1_id" text NOT NULL,
	"player2_id" text,
	"team_name" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"seed" integer,
	"note" text,
	"amount_due" double precision DEFAULT 0 NOT NULL,
	"payment_status" text DEFAULT 'unpaid' NOT NULL,
	"payment_method" text,
	"paid_at" timestamp with time zone,
	"payment_recorded_by" text,
	"created_by" text,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tournament_matches" (
	"id" text PRIMARY KEY NOT NULL,
	"tournament_id" text NOT NULL,
	"category_id" text NOT NULL,
	"stage" text NOT NULL,
	"group_label" text,
	"round" integer NOT NULL,
	"slot" integer NOT NULL,
	"entry_a_id" text,
	"entry_b_id" text,
	"scores" jsonb,
	"winner_entry_id" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"next_match_id" text,
	"next_side" text,
	"court" text,
	"scheduled_at" text,
	"entered_by" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tournament_prizes" (
	"id" text PRIMARY KEY NOT NULL,
	"tournament_id" text NOT NULL,
	"category_id" text,
	"place" integer,
	"title" text,
	"kind" text DEFAULT 'cash' NOT NULL,
	"amount" double precision,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tournaments" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"venue_id" text,
	"venue_text" text,
	"start_date" text NOT NULL,
	"end_date" text NOT NULL,
	"start_time" text,
	"entry_deadline" text,
	"visibility" text DEFAULT 'community' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"approval" text DEFAULT 'manual' NOT NULL,
	"currency" text DEFAULT 'AED' NOT NULL,
	"payment_note" text,
	"rules" text,
	"contact" text,
	"created_by" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tournament_categories" ADD CONSTRAINT "tournament_categories_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_entries" ADD CONSTRAINT "tournament_entries_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_entries" ADD CONSTRAINT "tournament_entries_category_id_tournament_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."tournament_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_entries" ADD CONSTRAINT "tournament_entries_player1_id_users_id_fk" FOREIGN KEY ("player1_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_entries" ADD CONSTRAINT "tournament_entries_player2_id_users_id_fk" FOREIGN KEY ("player2_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_entries" ADD CONSTRAINT "tournament_entries_payment_recorded_by_users_id_fk" FOREIGN KEY ("payment_recorded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_entries" ADD CONSTRAINT "tournament_entries_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_entries" ADD CONSTRAINT "tournament_entries_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_category_id_tournament_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."tournament_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_entry_a_id_tournament_entries_id_fk" FOREIGN KEY ("entry_a_id") REFERENCES "public"."tournament_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_entry_b_id_tournament_entries_id_fk" FOREIGN KEY ("entry_b_id") REFERENCES "public"."tournament_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_winner_entry_id_tournament_entries_id_fk" FOREIGN KEY ("winner_entry_id") REFERENCES "public"."tournament_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_matches" ADD CONSTRAINT "tournament_matches_entered_by_users_id_fk" FOREIGN KEY ("entered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_prizes" ADD CONSTRAINT "tournament_prizes_tournament_id_tournaments_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournaments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournament_prizes" ADD CONSTRAINT "tournament_prizes_category_id_tournament_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."tournament_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_venue_id_venues_id_fk" FOREIGN KEY ("venue_id") REFERENCES "public"."venues"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tournaments" ADD CONSTRAINT "tournaments_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tcat_tournament_idx" ON "tournament_categories" USING btree ("tournament_id");--> statement-breakpoint
CREATE INDEX "tentry_category_idx" ON "tournament_entries" USING btree ("category_id","status");--> statement-breakpoint
CREATE INDEX "tentry_tournament_idx" ON "tournament_entries" USING btree ("tournament_id");--> statement-breakpoint
CREATE INDEX "tentry_p1_idx" ON "tournament_entries" USING btree ("player1_id");--> statement-breakpoint
CREATE INDEX "tentry_p2_idx" ON "tournament_entries" USING btree ("player2_id");--> statement-breakpoint
CREATE INDEX "tmatch_category_idx" ON "tournament_matches" USING btree ("category_id","stage","round");--> statement-breakpoint
CREATE INDEX "tmatch_tournament_idx" ON "tournament_matches" USING btree ("tournament_id");--> statement-breakpoint
CREATE INDEX "tprize_tournament_idx" ON "tournament_prizes" USING btree ("tournament_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tournaments_code_idx" ON "tournaments" USING btree ("code");--> statement-breakpoint
CREATE INDEX "tournaments_group_idx" ON "tournaments" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "tournaments_visibility_idx" ON "tournaments" USING btree ("visibility","status");