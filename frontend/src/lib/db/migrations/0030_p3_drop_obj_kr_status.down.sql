-- [022.01] Phase 3：移除 objectives/key_results 的 status 列 —— Down（手工回滚脚本）
-- 与同 tag 的 0030_p3_drop_obj_kr_status.sql（up）配套使用
--
-- ⚠️ 不可单独执行：必须同步回滚代码（USOM 类型 / mappers / repositories / server actions / hook / UI）
-- 默认值 'draft' 仅恢复列结构与索引，无法恢复精确 status 值（archived/discarded/paused 等丢失）
-- ⚠️ 此文件不在 journal 登记：drizzle migrate 不会自动执行；操作员须按需手工 psql -f 调用

-- ════════════════════════════════════════════════════════════════
-- Down migration
-- 1. 恢复列（text NOT NULL，默认 draft 匹配原始 schema 约束）
-- 2. 恢复索引
-- ════════════════════════════════════════════════════════════════

BEGIN;

-- 1. 恢复列（text NOT NULL，默认 draft 匹配原始 schema 约束）
ALTER TABLE key_results ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft';
ALTER TABLE objectives  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft';

-- 2. 恢复索引
CREATE INDEX IF NOT EXISTS idx_objectives_user_status  ON objectives(user_id, status);
CREATE INDEX IF NOT EXISTS idx_key_results_user_status ON key_results(user_id, status);

COMMIT;