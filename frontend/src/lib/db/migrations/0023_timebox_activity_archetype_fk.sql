-- [023] A2: timeboxes 加 activity_archetype_id 外键（nullable，ON DELETE SET NULL）
-- 关联 A1 的 activity_archetypes 表。logTimebox 时带入活动原型，能量消耗从 archetype 读取。
ALTER TABLE timeboxes ADD COLUMN IF NOT EXISTS activity_archetype_id uuid
  REFERENCES activity_archetypes(id) ON DELETE SET NULL;

-- [023] A2 OV#P1-#2: USOM Timebox.taskIds/habitIds 落库列（D7 LinkPicker 依赖）
ALTER TABLE timeboxes ADD COLUMN IF NOT EXISTS task_ids uuid[] NOT NULL DEFAULT '{}';
ALTER TABLE timeboxes ADD COLUMN IF NOT EXISTS habit_ids uuid[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_timeboxes_user_archetype
  ON timeboxes(user_id, activity_archetype_id);
