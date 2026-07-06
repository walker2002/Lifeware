-- 反向：恢复废弃列 + cycle 列 rename 回
-- 顺序：先 TRUNCATE 清状态合法值集合外的旧数据，再 ADD COLUMN
TRUNCATE timeboxes CASCADE;
TRUNCATE cycles CASCADE;
TRUNCATE appointments CASCADE;

ALTER TABLE timeboxes ADD COLUMN IF NOT EXISTS started_at timestamp with time zone;
ALTER TABLE timeboxes ADD COLUMN IF NOT EXISTS ended_at timestamp with time zone;
ALTER TABLE timeboxes ADD COLUMN IF NOT EXISTS overtime_at timestamp with time zone;

ALTER TABLE cycles RENAME COLUMN approved_at TO started_at;
ALTER TABLE cycles RENAME COLUMN finished_at TO ended_at;

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS in_progress_at timestamp with time zone;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS expired_at timestamp with time zone;