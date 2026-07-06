-- [023.11] activity_archetypes 加 synonyms 列（同义词/范围描述，用于标题→archetype 匹配）
-- 设计来源：docs/superpowers/specs/2026-07-06-023-11-timebox-action-optimization-design.md §10
-- 幂等：ADD COLUMN IF NOT EXISTS
BEGIN;
ALTER TABLE activity_archetypes
  ADD COLUMN IF NOT EXISTS synonyms jsonb NOT NULL DEFAULT '[]'::jsonb;
COMMIT;
