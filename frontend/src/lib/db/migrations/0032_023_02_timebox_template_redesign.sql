-- [023-02] 时间盒模板数据模型重构：rows + days_of_week，移除 7 段 + 3 订阅
-- 设计来源：docs/superpowers/specs/2026-07-03-023-02-timebox-template-design.md §3
-- 幂等：所有 DDL 均 IF NOT EXISTS / IF EXISTS / IF [NOT] EXISTS ON column

BEGIN;

-- 1) 加新列
ALTER TABLE timebox_templates
  ADD COLUMN IF NOT EXISTS rows         jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS days_of_week jsonb NOT NULL DEFAULT '[0,1,2,3,4,5,6]'::jsonb;

-- 2) 旧 7 段 → 7 条 custom 行（用固定段名 key→中文 activityName，id 用 md5 稳定生成）
-- KEEP IN SYNC WITH frontend/src/domains/timebox/lib/template-row-helpers.ts:DEFAULT_SEGMENT_SEED
--    segment order 固定：wake, morning, workAm, noon, workPm, evening, sleep
--    若列已不存在（幂等重跑），UPDATE 会影响 0 行，安全。
DO $$
DECLARE
  v_default jsonb := jsonb_build_array(
    jsonb_build_object('id', md5('seg-wake')::text,    'activityName', '起床',    'start', '07:00', 'end', '07:30', 'source', 'custom'),
    jsonb_build_object('id', md5('seg-morning')::text,  'activityName', '晨间',    'start', '07:30', 'end', '09:00', 'source', 'custom'),
    jsonb_build_object('id', md5('seg-workAm')::text,   'activityName', '上午上班','start', '09:00', 'end', '12:00', 'source', 'custom'),
    jsonb_build_object('id', md5('seg-noon')::text,     'activityName', '午间',    'start', '12:00', 'end', '13:30', 'source', 'custom'),
    jsonb_build_object('id', md5('seg-workPm')::text,   'activityName', '下午上班','start', '13:30', 'end', '18:00', 'source', 'custom'),
    jsonb_build_object('id', md5('seg-evening')::text,  'activityName', '晚间',    'start', '18:00', 'end', '23:00', 'source', 'custom'),
    jsonb_build_object('id', md5('seg-sleep')::text,    'activityName', '睡眠',    'start', '23:00', 'end', '07:00', 'source', 'custom')
  );
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'timebox_templates' AND column_name = 'survival_segments'
  ) THEN
    -- 仅对尚无 rows 的行回填（防止重跑时覆盖用户已编辑的 rows）
    UPDATE timebox_templates
       SET rows = v_default
     WHERE rows = '[]'::jsonb OR rows IS NULL;
  END IF;
END $$;

-- 3) DROP 旧列（已无下游消费者，spec §0 已确认）
ALTER TABLE timebox_templates
  DROP COLUMN IF EXISTS survival_segments,
  DROP COLUMN IF EXISTS subscribed_habits,
  DROP COLUMN IF EXISTS subscribed_tasks,
  DROP COLUMN IF EXISTS subscribed_threads;

COMMIT;