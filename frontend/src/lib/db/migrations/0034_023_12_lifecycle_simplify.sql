-- [023.12] 三域生命周期简化
-- status 列是 plain TEXT（drizzle text+enum 仅 app 层 union），无 PG enum type 要重建。
-- 数据可弃（dev 测试数据 + prod 未录入）→ TRUNCATE 清旧值，免行迁移。

-- timeboxes: drop 3 个时间戳列
TRUNCATE timeboxes CASCADE;
ALTER TABLE timeboxes DROP COLUMN IF EXISTS started_at;
ALTER TABLE timeboxes DROP COLUMN IF EXISTS ended_at;
ALTER TABLE timeboxes DROP COLUMN IF EXISTS overtime_at;

-- cycles: rename 2 列（AM6）
-- 顺序：rename first, then TRUNCATE（无所谓顺序；先 TRUNCATE 也行）
ALTER TABLE cycles RENAME COLUMN started_at TO approved_at;
ALTER TABLE cycles RENAME COLUMN ended_at TO finished_at;
TRUNCATE cycles CASCADE;

-- appointments: drop 2 个时间戳列
TRUNCATE appointments CASCADE;
ALTER TABLE appointments DROP COLUMN IF EXISTS in_progress_at;
ALTER TABLE appointments DROP COLUMN IF EXISTS expired_at;