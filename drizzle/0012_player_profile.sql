CREATE TABLE "preferred_partners" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"partner_id" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "gender" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "birth_year" integer;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "level" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "nationality" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "handedness" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "profile_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "preferred_partners" ADD CONSTRAINT "preferred_partners_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preferred_partners" ADD CONSTRAINT "preferred_partners_partner_id_users_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pref_partner_pair_idx" ON "preferred_partners" USING btree ("user_id","partner_id");