-- [023] A3.3: 硬删 habit_templates（已被 /timebox-templates 取代）
-- 顺序：先 index → junction（template_habits）→ 主表（habit_templates）
--   原因：template_habits.template_id FK → habit_templates(id)，
--   先 DROP 主表会被依赖约束阻断（§4.3 / R4）。
-- 守护：DROP 前先 SELECT count 暴露存量（dev 预期 0；prod 走 prod.sh --migrate 时人工确认）。
-- [/review 加固 2026-07-01] 幂等守卫：dev/prod 演进中 habit_templates / template_habits 可能已
--   先被 drop（dev 在 06-30 A3.3 ff-merge 期间已手工 DROP；prod 修补时也可能有类似情况），
--   重跑时 SELECT count 撞"relation does not exist"。用 information_schema 守卫：表存在才
--   跑存量 SELECT + DROP，缺表则视为 A3.3 迁移已完成，跳过即可。

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'template_habits'
  ) THEN
    RAISE NOTICE 'template_habits count before DROP: %', (SELECT COUNT(*) FROM template_habits);
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'habit_templates'
  ) THEN
    RAISE NOTICE 'habit_templates count before DROP: %', (SELECT COUNT(*) FROM habit_templates);
  END IF;
END $$;

DROP INDEX IF EXISTS idx_habit_templates_user_status;
DROP TABLE IF EXISTS template_habits;
DROP TABLE IF EXISTS habit_templates;