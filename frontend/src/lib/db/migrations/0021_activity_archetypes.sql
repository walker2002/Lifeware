-- [023] A1: activity_archetypes + user_audit_log 表
-- 1. 建 activity_archetypes 表（Activity Archetype 跨域共享本体）
CREATE TABLE IF NOT EXISTS activity_archetypes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  schema_version  integer NOT NULL DEFAULT 1,
  l1_category     text NOT NULL,
  l2_name         text NOT NULL,
  energy_cost     jsonb NOT NULL,
  activity_label  jsonb NOT NULL DEFAULT '{}',
  is_system       boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_archetypes_user_l1
  ON activity_archetypes(user_id, l1_category);

CREATE INDEX IF NOT EXISTS idx_activity_archetypes_user_system
  ON activity_archetypes(user_id, is_system);

-- 2. 建 user_audit_log 表（配置变更审计日志，OQ-7）
CREATE TABLE IF NOT EXISTS user_audit_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  table_name      text NOT NULL,
  record_id       uuid NOT NULL,
  action          text NOT NULL CHECK (action IN ('create', 'update', 'delete')),
  changed_fields  jsonb,
  old_values      jsonb,
  new_values      jsonb,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_audit_log_user_table
  ON user_audit_log(user_id, table_name, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_audit_log_user_time
  ON user_audit_log(user_id, created_at DESC);
