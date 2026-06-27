-- 0019: DROP objectives period 列 + cycle_id SET NOT NULL（[022] T17）
-- 防御性 backfill（幂等——UNIQUE 约束 skip 已存在；NULL 更新跳 id）
INSERT INTO cycles (id, user_id, cycle_type, name, period_start, period_end, status, created_at, updated_at)
  SELECT gen_random_uuid(), user_id, 'custom', period_start||'~'||period_end, period_start, period_end, 'ended', now(), now()
  FROM objectives WHERE cycle_id IS NULL GROUP BY user_id, period_start, period_end ON CONFLICT DO NOTHING;
UPDATE objectives SET cycle_id = c.id FROM cycles c
  WHERE objectives.cycle_id IS NULL AND c.user_id = objectives.user_id
    AND c.period_start = objectives.period_start AND c.period_end = objectives.period_end;

-- 断言无残留 NULL（有则 SET NOT NULL 失败并停在此）
DO $$ BEGIN
  PERFORM 1 FROM objectives WHERE cycle_id IS NULL LIMIT 1;
  IF FOUND THEN RAISE EXCEPTION 'T17 断言失败：仍有未回填的 cycle_id=NULL objectives'; END IF;
END $$;

-- 核心 DDL：先删依赖对象，再删列
ALTER TABLE objectives DROP CONSTRAINT IF EXISTS check_objectives_period_end_after_start;
DROP INDEX IF EXISTS idx_objectives_period;
ALTER TABLE objectives ALTER COLUMN cycle_id SET NOT NULL;
ALTER TABLE objectives DROP COLUMN period_type;
ALTER TABLE objectives DROP COLUMN period_start;
ALTER TABLE objectives DROP COLUMN period_end;

-- 替换旧单列 idx_objectives_cycle 为复合索引 (user_id, cycle_id)
DROP INDEX IF EXISTS idx_objectives_cycle;
CREATE INDEX idx_objectives_cycle ON objectives(user_id, cycle_id);
