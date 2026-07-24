CREATE TABLE "user_state" (
	"id" text PRIMARY KEY,
	"state" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
