-- 习惯管理切片: 字段重命名 + 新增字段 + 新增模板表
-- Migration: 0002_habit_enhancements

-- 1. 重命名字段
ALTER TABLE habits RENAME COLUMN scheduled_time TO default_time;
ALTER TABLE habits RENAME COLUMN duration TO default_duration;

-- 2. 新增字段
ALTER TABLE habits ADD COLUMN trackable boolean NOT NULL DEFAULT true;
ALTER TABLE habits ADD COLUMN earliest_time text;
ALTER TABLE habits ADD COLUMN latest_end_time text;
ALTER TABLE habits ADD COLUMN min_duration integer;

-- 3. 回填新字段（使用计算公式）
UPDATE habits SET
  earliest_time = default_time,
  latest_end_time = default_time,
  min_duration = default_duration
WHERE earliest_time IS NULL;

-- 4. 设置 NOT NULL 约束（回填后）
ALTER TABLE habits ALTER COLUMN earliest_time SET NOT NULL;
ALTER TABLE habits ALTER COLUMN latest_end_time SET NOT NULL;
ALTER TABLE habits ALTER COLUMN min_duration SET NOT NULL;

-- 5. 创建习惯模板表
CREATE TABLE habit_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  schema_version integer NOT NULL DEFAULT 1,
  name text NOT NULL,
  description text,
  icon text,
  status text NOT NULL DEFAULT 'draft',
  applicable_days jsonb NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_habit_templates_user_status ON habit_templates(user_id, status);

-- 6. 创建模板-习惯关联表
CREATE TABLE template_habits (
  template_id uuid NOT NULL REFERENCES habit_templates(id) ON DELETE CASCADE,
  habit_id uuid NOT NULL REFERENCES habits(id) ON DELETE RESTRICT,
  sort_order integer NOT NULL DEFAULT 0,
  time_override text,
  duration_override integer,
  PRIMARY KEY (template_id, habit_id)
);
