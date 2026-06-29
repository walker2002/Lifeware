-- [023] A2: timebox_templates 表（时间盒模板，配置类不走 Nexus）
-- 7 段生存时间 + pull 订阅 habits/tasks/threads
CREATE TABLE IF NOT EXISTS timebox_templates (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  schema_version      integer NOT NULL DEFAULT 1,
  name                text NOT NULL,
  survival_segments   jsonb NOT NULL,
  subscribed_habits   jsonb NOT NULL DEFAULT '[]',
  subscribed_tasks    jsonb NOT NULL DEFAULT '[]',
  subscribed_threads  jsonb NOT NULL DEFAULT '[]',
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_timebox_templates_user ON timebox_templates(user_id);
