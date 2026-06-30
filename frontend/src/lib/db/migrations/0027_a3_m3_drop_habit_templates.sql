-- [023] A3.3: 硬删 habit_templates（已被 /timebox-templates 取代）
-- 顺序：先 index → junction（template_habits）→ 主表（habit_templates）
--   原因：template_habits.template_id FK → habit_templates(id)，
--   先 DROP 主表会被依赖约束阻断（§4.3 / R4）。
-- 守护：DROP 前先 SELECT count 暴露存量（dev 预期 0；prod 走 prod.sh --migrate 时人工确认）。

SELECT 'template_habits count before DROP:' AS info, COUNT(*) AS cnt FROM template_habits;
SELECT 'habit_templates count before DROP:' AS info, COUNT(*) AS cnt FROM habit_templates;

DROP INDEX IF EXISTS idx_habit_templates_user_status;
DROP TABLE IF EXISTS template_habits;
DROP TABLE IF EXISTS habit_templates;