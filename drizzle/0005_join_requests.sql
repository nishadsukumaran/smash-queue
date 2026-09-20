ALTER TABLE "group_members" ADD COLUMN "note" text;--> statement-breakpoint
ALTER TABLE "group_members" ADD COLUMN "requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "group_members" ADD COLUMN "decided_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "group_members" ADD COLUMN "decided_by" text;--> statement-breakpoint
CREATE INDEX "gm_status_idx" ON "group_members" USING btree ("group_id","status");