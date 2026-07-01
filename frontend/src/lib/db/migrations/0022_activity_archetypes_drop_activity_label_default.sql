-- [023] A1 post-review I-3: 移除 activity_label 的 DEFAULT '{}'::jsonb
-- 原因：ActivityLabel interface 有 6 个必填字段，空对象 {} 违反类型契约。
-- impl (schema.ts) 已无 default，本迁移使 DB 与 impl 一致——裸 SQL 插入不提供
-- activity_label 将在 DB 层失败（NOT NULL 无 default），defense-in-depth。
-- [/review 加固 2026-07-01] 幂等守卫：PG 的 DROP DEFAULT 严格说是幂等的（无 default 时 no-op），
--   但为了与本仓库其他迁移"显式 information_schema 守卫"风格一致，加探活：列还有 default
--   才 DROP，缺则视为迁移已完成。
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'activity_archetypes'
      AND column_name = 'activity_label'
      AND column_default IS NOT NULL
  ) THEN
    ALTER TABLE activity_archetypes ALTER COLUMN activity_label DROP DEFAULT;
  END IF;
END $$;
