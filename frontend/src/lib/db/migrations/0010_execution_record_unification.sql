-- 0010: 统一执行记录模型
-- habit_logs: status→completion_status, 新增字段, source 扩展
-- 新增 task_execution_logs 表

-- 1. habit_logs: 重命名 status → completion_status
ALTER TABLE habit_logs RENAME COLUMN status TO completion_status;

-- 2. habit_logs: 更新值域映射
UPDATE habit_logs SET completion_status = 'not_completed' WHERE completion_status = 'skipped';
UPDATE habit_logs SET completion_status = 'partially_completed' WHERE completion_status = 'partial';

-- 3. habit_logs: 新增字段
ALTER TABLE habit_logs ADD COLUMN planned_duration INTEGER;
ALTER TABLE habit_logs ADD COLUMN deviation_minutes INTEGER;
ALTER TABLE habit_logs ADD COLUMN completion_rating INTEGER;
ALTER TABLE habit_logs ADD COLUMN energy_level INTEGER;

-- 4. habit_logs: source 枚举扩展（通过 ALTER TYPE 或直接修改 check）
-- Drizzle 使用 text enum，直接用 ALTER TYPE
ALTER TYPE habit_logs_source_enum ADD VALUE IF NOT EXISTS 'timebox_sync';

-- 5. 新增 task_execution_logs 表
CREATE TABLE task_execution_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  schema_version INTEGER NOT NULL DEFAULT 1,

  task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  timebox_id UUID REFERENCES timeboxes(id) ON DELETE SET NULL,
  completion_status TEXT NOT NULL,
  actual_duration INTEGER,
  planned_duration INTEGER,
  deviation_minutes INTEGER,
  completion_rating INTEGER,
  actual_output TEXT,
  deviation_reasons TEXT,
  energy_level INTEGER,
  note TEXT,
  logged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT NOT NULL DEFAULT 'manual'
);

-- 6. 索引
CREATE INDEX idx_task_exec_logs_user_task ON task_execution_logs(user_id, task_id);
CREATE INDEX idx_task_exec_logs_timebox ON task_execution_logs(timebox_id);
CREATE INDEX idx_task_exec_logs_user_logged ON task_execution_logs(user_id, logged_at);
