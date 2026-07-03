-- [023-02] 时间盒模板重构的反向迁移（仅防 schema 漂移，不回填旧数据）
-- 设计来源：docs/superpowers/specs/2026-07-03-023-02-timebox-template-design.md §3
-- 幂等：所有 DDL 均 IF NOT EXISTS / IF EXISTS
-- 注意：rows / days_of_week 中的数据若需恢复旧 survival_segments 形状需业务层处理；本迁移仅重建 4 个旧列（默认空），DROP 新列，让 schema 可回到 0024 状态。

BEGIN;

-- 1) DROP 新列
ALTER TABLE timebox_templates
  DROP COLUMN IF EXISTS rows,
  DROP COLUMN IF EXISTS days_of_week;

-- 2) 重建 4 个旧列（默认空，不回填数据）
ALTER TABLE timebox_templates
  ADD COLUMN IF NOT EXISTS survival_segments jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS subscribed_habits jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS subscribed_tasks jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS subscribed_threads jsonb NOT NULL DEFAULT '[]';

-- 3) 重建索引（若之前被 DROP，0024 未 DROP 这里，幂等保护）
CREATE INDEX IF NOT EXISTS idx_timebox_templates_user ON timebox_templates(user_id);

COMMIT;