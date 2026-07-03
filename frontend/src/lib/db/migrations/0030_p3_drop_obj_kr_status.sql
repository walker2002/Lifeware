-- [022.01] Phase 3：移除 objectives/key_results 的 status 列
-- 软删除语义上移到归档/丢弃/完成三个时间戳字段；status 字段含义已由 cycle 状态机承载
-- See: docs/superpowers/specs/2026-07-02-022-01-okr-cycle-governance-design.md §数据迁移计划

-- ════════════════════════════════════════════════════════════════
-- Up migration（本文件仅含 up，down 见同 tag 的 .down.sql）
-- 1. 软删除语义落地（COALESCE 保已有时间戳）
-- 2. DROP 索引（基于 status 列，已无用）
-- 3. DROP 列
--
-- 幂等性：UPDATEs 用 DO $$ 守卫，先检查 status 列是否存在；
--   第二次运行本文件时（DB 已迁移）守卫短路，UPDATEs 跳过，
--   DROP INDEX/COLUMN IF EXISTS 也会 no-op，从而可安全重跑。
-- ════════════════════════════════════════════════════════════════

BEGIN;

-- 1. 软删除语义落地（COALESCE 保已有时间戳）—— 守卫 status 列是否存在，确保重跑安全
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'objectives' AND column_name = 'status'
  ) THEN
    UPDATE objectives SET archived_at  = COALESCE(archived_at,  now()) WHERE status = 'archived';
    UPDATE objectives SET discarded_at = COALESCE(discarded_at, now()) WHERE status = 'discarded';
    UPDATE objectives SET completed_at = COALESCE(completed_at, now()) WHERE status = 'completed';
    UPDATE key_results SET archived_at  = COALESCE(archived_at,  now()) WHERE status = 'archived';
    UPDATE key_results SET discarded_at = COALESCE(discarded_at, now()) WHERE status = 'discarded';
    UPDATE key_results SET completed_at = COALESCE(completed_at, now()) WHERE status = 'completed';
  END IF;
END $$;

-- 2. DROP 索引（基于 status 列，已无用）—— IF EXISTS 保幂等
DROP INDEX IF EXISTS idx_objectives_user_status;
DROP INDEX IF EXISTS idx_key_results_user_status;

-- 3. DROP 列 —— IF EXISTS 保幂等
ALTER TABLE objectives  DROP COLUMN IF EXISTS status;
ALTER TABLE key_results DROP COLUMN IF EXISTS status;

COMMIT;