-- Custom SQL migration
CREATE TABLE IF NOT EXISTS "user_activities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "activity_type" text NOT NULL,
  "source" text NOT NULL,
  "target_domain" text,
  "target_action" text,
  "metadata" jsonb DEFAULT '{}',
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_user_activities_user_time" ON "user_activities" ("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "idx_user_activities_type" ON "user_activities" ("user_id", "activity_type", "created_at");
