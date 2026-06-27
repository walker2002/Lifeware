-- [022] Phase 2：contributions 表 + habits.key_result_id 迁移
-- 1. 建 contributions 表
CREATE TABLE IF NOT EXISTS contributions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  schema_version   integer NOT NULL DEFAULT 1,
  key_result_id    uuid NOT NULL REFERENCES key_results(id) ON DELETE CASCADE,
  contributor_type text NOT NULL CHECK (contributor_type IN ('task', 'habit', 'manual')),
  contributor_id   uuid NOT NULL,
  delta            numeric(10,2),
  weight           numeric(3,2) DEFAULT 1.0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_contributions_kr_source UNIQUE(key_result_id, contributor_type, contributor_id)
);

CREATE INDEX IF NOT EXISTS idx_contributions_kr ON contributions(user_id, key_result_id);
CREATE INDEX IF NOT EXISTS idx_contributions_source ON contributions(contributor_type, contributor_id);

-- 2. 迁移 habits.key_result_id → contributions
INSERT INTO contributions (user_id, key_result_id, contributor_type, contributor_id)
SELECT user_id, key_result_id, 'habit', id
FROM habits
WHERE key_result_id IS NOT NULL
ON CONFLICT (key_result_id, contributor_type, contributor_id) DO NOTHING;

-- 3. 验证迁移完整性
DO $$
DECLARE
  orphan_count integer;
BEGIN
  SELECT COUNT(*) INTO orphan_count
  FROM habits h
  WHERE h.key_result_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM contributions c
      WHERE c.key_result_id = h.key_result_id
        AND c.contributor_type = 'habit'
        AND c.contributor_id = h.id
    );
  IF orphan_count > 0 THEN
    RAISE WARNING 'orphan habits with key_result_id not in contributions: %', orphan_count;
  END IF;
END $$;

-- 4. 删除 habits.key_result_id 列
DROP INDEX IF EXISTS idx_habits_key_result;
ALTER TABLE habits DROP CONSTRAINT IF EXISTS habits_key_result_id_key_results_id_fk;
ALTER TABLE habits DROP COLUMN IF EXISTS key_result_id;
