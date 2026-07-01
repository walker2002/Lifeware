-- [023] A3.1 M2: 删 tasks.energy_profile（D11 B→C 迁移完成）
-- 语义已 backfill 至 activity_archetype_id（M1/0025），energy_profile 列退役。
-- 分两次迁移的第二次（D5）：M1 加+backfill 已验证命中率后，本迁移删列。
-- [/review 加固] 删列是不可逆操作。删列前强制断言：所有 energy_profile 非空行都已
--   backfill 到 activity_archetype_id，否则 RAISE EXCEPTION 中止（防 archetype seed
--   漏跑导致的静默永久丢语义）。若运维已明确接受部分丢失（archetype optional，D3），
--   可临时注释掉本 DO 块再重跑——但必须是有意识的决定，而非静默通过。
-- [/review 加固 2026-07-01] 幂等守卫：dev/prod 演进中 tasks.energy_profile 可能已先被 drop
--   （schema.ts 演变为 energy_required；某次 prod 修补中手工 drop 列），重跑时缺列撞错。
--   用 information_schema 守卫：列存在才跑断言+drop，缺列则视为 D11 B→C 迁移已完成，跳过即可。
DO $$
DECLARE
  unbackfilled integer;
  col_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'tasks'
      AND column_name = 'energy_profile'
  ) INTO col_exists;

  IF col_exists THEN
    SELECT count(*) INTO unbackfilled FROM tasks
      WHERE energy_profile IS NOT NULL AND activity_archetype_id IS NULL;
    IF unbackfilled > 0 THEN
      RAISE EXCEPTION 'A3.1 M2 中止：% 行 tasks.energy_profile 未 backfill 到 activity_archetype_id。先跑 A1 archetype seedDefaults（/config/activity-archetypes 页 seedArchetypes，或 seed-prod 补 seed）再重试；若明确接受丢失，注释本 DO 块后重跑。', unbackfilled
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
END $$;

DROP INDEX IF EXISTS idx_tasks_user_energy;
ALTER TABLE tasks DROP COLUMN IF EXISTS energy_profile;