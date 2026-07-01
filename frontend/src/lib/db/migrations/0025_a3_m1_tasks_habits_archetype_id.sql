-- [023] A3.1 M1: tasks + habits 加 activity_archetype_id 外键（nullable，ON DELETE SET NULL）
-- 关联 A1 的 activity_archetypes 表。对齐 timeboxes:396 外键范式（0023 迁移）。
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS activity_archetype_id uuid
  REFERENCES activity_archetypes(id) ON DELETE SET NULL;
ALTER TABLE habits ADD COLUMN IF NOT EXISTS activity_archetype_id uuid
  REFERENCES activity_archetypes(id) ON DELETE SET NULL;

-- D4 backfill：tasks.energy_profile enum → activity_archetype_id
-- archetype 是 per-user 且无 slug/id 常量，必须按 (user_id, l1='工作', l2_name) 子查询匹配。
-- 映射（design D4，修正父 plan light→响应式 为 light→日常事务）：
--   deep→深度专注 / creative→方案设计 / admin→日常事务 / light→日常事务 / reactive→响应式工作
-- [/review 加固] activity_archetypes 无 (user_id, l1, l2_name) UNIQUE 约束，子查询加
--   ORDER BY + LIMIT 1 保证确定性（取最早创建那条），避免重复行触发
--   "more than one row returned by a subquery" 硬错崩掉整个迁移。
-- [/review 加固 2026-07-01] 幂等守卫：dev/prod 演进中 tasks.energy_profile 可能已被 drop
--   （schema.ts 演变为 energy_required；某次 prod 修补中手工 drop 列），重跑时缺列撞错。
--   用 information_schema 守卫：列存在才跑 backfill，缺列则视为 D11 B→C 迁移已完成，跳过即可。
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tasks'
      AND column_name = 'energy_profile'
  ) THEN
    UPDATE tasks t SET activity_archetype_id = (
      SELECT a.id FROM activity_archetypes a
      WHERE a.user_id = t.user_id
        AND a.l1_category = '工作'
        AND a.l2_name = CASE t.energy_profile
          WHEN 'deep'     THEN '深度专注'
          WHEN 'creative' THEN '方案设计'
          WHEN 'admin'    THEN '日常事务'
          WHEN 'light'    THEN '日常事务'
          WHEN 'reactive' THEN '响应式工作'
        END
      ORDER BY a.created_at, a.id
      LIMIT 1
    ) WHERE t.energy_profile IS NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_tasks_user_archetype  ON tasks(user_id, activity_archetype_id);
CREATE INDEX IF NOT EXISTS idx_habits_user_archetype ON habits(user_id, activity_archetype_id);