-- 0022: 重命名 habits.latest_end_time → latest_start_time（对齐 schema）
-- 背景：0002 迁移创建了 latest_end_time，后续 schema 演变为 latest_start_time，
-- 但重命名迁移遗漏了。本迁移条件执行，已重命名的库（dev）安全跳过。

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'habits' AND column_name = 'latest_end_time'
  ) THEN
    ALTER TABLE habits RENAME COLUMN latest_end_time TO latest_start_time;
  END IF;
END $$;
