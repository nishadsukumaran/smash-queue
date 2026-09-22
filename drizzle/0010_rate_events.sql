CREATE TABLE "rate_events" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"created_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE INDEX "rate_events_key_idx" ON "rate_events" USING btree ("key","created_at");