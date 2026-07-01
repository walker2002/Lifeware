-- [024] G2：KeyResult 增加 confidence 字段（达成信心度，0-100 百分比，默认 50）
ALTER TABLE key_results
  ADD COLUMN IF NOT EXISTS confidence integer NOT NULL DEFAULT 50;

-- [/review 加固 2026-07-01] 幂等守卫：PG 的 ADD CONSTRAINT 不支持 IF NOT EXISTS，
--   约束已存在时重跑会撞 "constraint ... already exists"。用 information_schema 守卫：
--   约束不存在才 ADD，缺则视为迁移已完成，跳过即可。
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'public'
      AND table_name = 'key_results'
      AND constraint_name = 'check_key_results_confidence_range'
  ) THEN
    ALTER TABLE key_results
      ADD CONSTRAINT check_key_results_confidence_range
      CHECK (confidence BETWEEN 0 AND 100);
  END IF;
END $$;
