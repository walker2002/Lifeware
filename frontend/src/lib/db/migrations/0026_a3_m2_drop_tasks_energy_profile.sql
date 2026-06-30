-- [023] A3.1 M2: 删 tasks.energy_profile（D11 B→C 迁移完成）
-- 语义已 backfill 至 activity_archetype_id（M1/0025），energy_profile 列退役。
-- 分两次迁移的第二次（D5）：M1 加+backfill 已验证命中率后，本迁移删列。
DROP INDEX IF EXISTS idx_tasks_user_energy;
ALTER TABLE tasks DROP COLUMN IF EXISTS energy_profile;