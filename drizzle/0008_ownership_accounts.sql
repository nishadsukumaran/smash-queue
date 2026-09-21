CREATE SEQUENCE "public"."player_no_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1001 CACHE 1;--> statement-breakpoint
CREATE TABLE "community_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"requester_id" text NOT NULL,
	"name" text NOT NULL,
	"location" text,
	"description" text,
	"details" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"decision_note" text,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"group_id" text,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "role_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"note" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"decided_by" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "trusted_devices" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"pin_hash" text,
	"pin_salt" text,
	"failed_attempts" integer DEFAULT 0 NOT NULL,
	"user_agent" text,
	"created_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "group_invites" ADD COLUMN "user_id" text;--> statement-breakpoint
ALTER TABLE "group_members" ADD COLUMN "rating" double precision DEFAULT 1200 NOT NULL;--> statement-breakpoint
ALTER TABLE "group_members" ADD COLUMN "rating_games" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "owner_accepted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "deleted_by" text;--> statement-breakpoint
-- Existing players are numbered in the order they joined, so the people who
-- were there first get the low numbers. A volatile DEFAULT would number them
-- in whatever order Postgres happens to scan the table.
ALTER TABLE "users" ADD COLUMN "player_no" integer;--> statement-breakpoint
UPDATE "users" u SET "player_no" = 1000 + o.n
FROM (SELECT "id", row_number() OVER (ORDER BY "created_at", "id") AS n FROM "users") o
WHERE o."id" = u."id";--> statement-breakpoint
-- Carry the sequence on from the last number handed out above.
SELECT setval('player_no_seq', GREATEST(1000, COALESCE((SELECT max("player_no") FROM "users"), 1000)));--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "player_no" SET DEFAULT nextval('player_no_seq');--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "player_no" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "onboarded_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "community_requests" ADD CONSTRAINT "community_requests_requester_id_users_id_fk" FOREIGN KEY ("requester_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_requests" ADD CONSTRAINT "community_requests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "community_requests" ADD CONSTRAINT "community_requests_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_requests" ADD CONSTRAINT "role_requests_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_requests" ADD CONSTRAINT "role_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "role_requests" ADD CONSTRAINT "role_requests_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "trusted_devices" ADD CONSTRAINT "trusted_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "creq_status_idx" ON "community_requests" USING btree ("status");--> statement-breakpoint
CREATE INDEX "creq_requester_idx" ON "community_requests" USING btree ("requester_id");--> statement-breakpoint
CREATE INDEX "rreq_group_idx" ON "role_requests" USING btree ("group_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "device_token_idx" ON "trusted_devices" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "device_user_idx" ON "trusted_devices" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "group_invites" ADD CONSTRAINT "group_invites_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "users_player_no_idx" ON "users" USING btree ("player_no");--> statement-breakpoint
-- Ratings become per community. Everyone starts in each community they already
-- belong to at the rating they had, since until now every game they played
-- happened in the one community that existed.
UPDATE "group_members" gm SET "rating" = u."rating", "rating_games" = u."rating_games"
FROM "users" u WHERE u."id" = gm."user_id";--> statement-breakpoint
-- Whoever created a community owns it.
UPDATE "group_members" gm SET "role" = 'owner'
FROM "groups" g WHERE g."id" = gm."group_id" AND g."owner_id" = gm."user_id";--> statement-breakpoint
INSERT INTO "group_members" ("id", "group_id", "user_id", "role", "status", "joined_at", "rating", "rating_games")
SELECT 'gm_own_' || substr(md5(g."id" || g."owner_id"), 1, 20), g."id", g."owner_id", 'owner', 'active', g."created_at", 1200, 0
FROM "groups" g
WHERE NOT EXISTS (SELECT 1 FROM "group_members" gm WHERE gm."group_id" = g."id" AND gm."user_id" = g."owner_id");
