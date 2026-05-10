-- 改进 [003]: latestEndTime → latestStartTime 语义重命名
-- Migration: 0003_latest_start_time

ALTER TABLE habits RENAME COLUMN latest_end_time TO latest_start_time;
