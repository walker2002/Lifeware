CREATE TABLE IF NOT EXISTS "ai_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "title" text NOT NULL DEFAULT '新对话',
  "status" text NOT NULL DEFAULT 'active',
  "messages" jsonb NOT NULL DEFAULT '[]',
  "state_snapshot" jsonb NOT NULL DEFAULT '{}',
  "referenced_object_ids" jsonb NOT NULL DEFAULT '[]',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "archived_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "idx_ai_sessions_user_status" ON "ai_sessions" ("user_id", "status");
CREATE INDEX IF NOT EXISTS "idx_ai_sessions_updated" ON "ai_sessions" ("user_id", "updated_at");

CREATE TABLE IF NOT EXISTS "user_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "timezone" text NOT NULL DEFAULT 'Asia/Shanghai',
  "llm_config" jsonb,
  "ui_prefs" jsonb,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_user_settings_user" ON "user_settings" ("user_id");
