-- Memory Episodes 表：Session 归档时自动生成摘要
CREATE TABLE IF NOT EXISTS "memory_episodes" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "session_id" uuid REFERENCES "ai_sessions"("id") ON DELETE SET NULL,
  "domain_id" text,
  "action" text,
  "episode_type" text NOT NULL DEFAULT 'session_summary',
  "summary" text NOT NULL,
  "metadata" jsonb NOT NULL DEFAULT '{}',
  "created_at" timestamp with time zone NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_memory_episodes_user_created" ON "memory_episodes"("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "idx_memory_episodes_session" ON "memory_episodes"("session_id");
