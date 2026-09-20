CREATE TABLE "auth_emails" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "auth_emails" ADD CONSTRAINT "auth_emails_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auth_email_idx" ON "auth_emails" USING btree ("email");--> statement-breakpoint
CREATE INDEX "auth_email_user_idx" ON "auth_emails" USING btree ("user_id");--> statement-breakpoint
-- Backfill: every existing account keeps signing in with the address it
-- already had. Written here rather than in application code so a fresh clone
-- and a live database end up in the same state.
INSERT INTO "auth_emails" ("id", "user_id", "email", "created_at")
SELECT 'aem_' || replace(gen_random_uuid()::text, '-', ''), "id", lower("email"), now()
FROM "users"
WHERE "email" IS NOT NULL
ON CONFLICT ("email") DO NOTHING;
