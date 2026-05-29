-- Migration: 0011_l1_messages
-- Create l1_messages table for Memory Framework L1 message persistence
-- Add deleted_at to ai_sessions for soft delete support

CREATE TABLE IF NOT EXISTS "l1_messages" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "session_id" uuid NOT NULL REFERENCES "ai_sessions"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "role" text NOT NULL CHECK ("role" IN ('user', 'assistant', 'system')),
  "content" text NOT NULL,
  "intent_ref" text,
  "cnui_surface" jsonb,
  "deleted_at" timestamptz,
  "created_at" timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "idx_l1_messages_session" ON "l1_messages" ("session_id", "created_at");
CREATE INDEX IF NOT EXISTS "idx_l1_messages_user" ON "l1_messages" ("user_id");
CREATE INDEX IF NOT EXISTS "idx_l1_messages_cleanup" ON "l1_messages" ("deleted_at", "created_at");

ALTER TABLE "ai_sessions" ADD COLUMN IF NOT EXISTS "deleted_at" timestamptz;
