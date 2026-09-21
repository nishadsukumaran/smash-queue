CREATE TABLE "group_invites" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"email" text,
	"name" text,
	"token_hash" text NOT NULL,
	"role" text DEFAULT 'player' NOT NULL,
	"invited_by" text,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by" text,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "visibility" text DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE "groups" ADD COLUMN "archived_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "platform_admin" boolean DEFAULT false NOT NULL;--> statement-breakpoint

-- slug and invite_code are NOT NULL and unique in the schema, but a database
-- with communities already in it has no values for them. Added nullable,
-- filled in, then tightened — the three-step dance any backfilled NOT NULL
-- column needs.
ALTER TABLE "groups" ADD COLUMN "slug" text;--> statement-breakpoint
UPDATE "groups" SET "slug" = trim(both '-' from regexp_replace(lower("name"), '[^a-z0-9]+', '-', 'g'));--> statement-breakpoint
UPDATE "groups" SET "slug" = 'community-' || substr("id", 1, 8) WHERE "slug" IS NULL OR "slug" = '';--> statement-breakpoint
-- Two communities called "Saturday Badminton" would otherwise both want the
-- same slug and the unique index below would refuse the whole migration.
UPDATE "groups" g SET "slug" = g."slug" || '-' || d.n
FROM (
  SELECT "id", row_number() OVER (PARTITION BY "slug" ORDER BY "created_at", "id") AS n
  FROM "groups"
) d
WHERE d."id" = g."id" AND d.n > 1;--> statement-breakpoint
ALTER TABLE "groups" ALTER COLUMN "slug" SET NOT NULL;--> statement-breakpoint

ALTER TABLE "groups" ADD COLUMN "invite_code" text;--> statement-breakpoint
-- Uppercase hex: eight characters, no letter that can be mistaken for a digit,
-- short enough to read down a phone line.
UPDATE "groups" SET "invite_code" = upper(substr(md5(random()::text || "id"), 1, 8)) WHERE "invite_code" IS NULL;--> statement-breakpoint
ALTER TABLE "groups" ALTER COLUMN "invite_code" SET NOT NULL;--> statement-breakpoint

ALTER TABLE "group_invites" ADD CONSTRAINT "group_invites_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_invites" ADD CONSTRAINT "group_invites_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_invites" ADD CONSTRAINT "group_invites_accepted_by_users_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invite_token_idx" ON "group_invites" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "invite_group_idx" ON "group_invites" USING btree ("group_id");--> statement-breakpoint
CREATE UNIQUE INDEX "groups_slug_idx" ON "groups" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "groups_invite_code_idx" ON "groups" USING btree ("invite_code");
