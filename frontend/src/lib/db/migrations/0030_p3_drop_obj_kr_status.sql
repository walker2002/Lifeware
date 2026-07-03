-- [022.01] Phase 3：移除 objectives/key_results 的 status 列
-- 软删除语义上移到归档/丢弃/完成三个时间戳字段；status 字段含义已由 cycle 状态机承载
-- See: docs/superpowers/specs/2026-07-02-022-01-okr-cycle-governance-design.md §数据迁移计划

-- ════════════════════════════════════════════════════════════════
-- Up migration
-- 1. 软删除语义落地（COALESCE 保已有时间戳）
-- 2. DROP 索引（基于 status 列，已无用）
-- 3. DROP 列
-- ════════════════════════════════════════════════════════════════

BEGIN;

-- 1. 软删除语义落地（COALESCE 保已有时间戳）
UPDATE objectives SET archived_at  = COALESCE(archived_at,  now()) WHERE status = 'archived';
UPDATE objectives SET discarded_at = COALESCE(discarded_at, now()) WHERE status = 'discarded';
UPDATE objectives SET completed_at = COALESCE(completed_at, now()) WHERE status = 'completed';
UPDATE key_results SET archived_at  = COALESCE(archived_at,  now()) WHERE status = 'archived';
UPDATE key_results SET discarded_at = COALESCE(discarded_at, now()) WHERE status = 'discarded';
UPDATE key_results SET completed_at = COALESCE(completed_at, now()) WHERE status = 'completed';

-- 2. DROP 索引（基于 status 列，已无用）
DROP INDEX IF EXISTS idx_objectives_user_status;
DROP INDEX IF EXISTS idx_key_results_user_status;

-- 3. DROP 列
ALTER TABLE objectives  DROP COLUMN IF EXISTS status;
ALTER TABLE key_results DROP COLUMN IF EXISTS status;

COMMIT;

-- ════════════════════════════════════════════════════════════════
-- Down migration
-- ⚠️ 不可单独执行：必须同步回滚代码（USOM 类型 / mappers / repositories / server actions / hook / UI）
-- 默认值 'draft' 仅恢复列结构与索引，无法恢复精确 status 值（archived/discarded/paused 等丢失）
-- ════════════════════════════════════════════════════════════════

BEGIN;

-- 1. 恢复列（text NOT NULL，默认 draft 匹配原始 schema 约束）
ALTER TABLE key_results ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft';
ALTER TABLE objectives  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'draft';

-- 2. 恢复索引
CREATE INDEX IF NOT EXISTS idx_objectives_user_status  ON objectives(user_id, status);
CREATE INDEX IF NOT EXISTS idx_key_results_user_status ON key_results(user_id, status);

COMMIT;
