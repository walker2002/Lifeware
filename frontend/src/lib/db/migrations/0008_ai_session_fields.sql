-- AI Session 扩展字段：domain_id, action, session_mode, status enum 扩展
ALTER TABLE "ai_sessions" ADD COLUMN IF NOT EXISTS "domain_id" text;
ALTER TABLE "ai_sessions" ADD COLUMN IF NOT EXISTS "action" text;
ALTER TABLE "ai_sessions" ADD COLUMN IF NOT EXISTS "session_mode" text NOT NULL DEFAULT 'single_shot';
ALTER TABLE "ai_sessions" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "ai_sessions" ALTER COLUMN "status" SET DEFAULT 'created';
