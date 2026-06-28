-- [024] G2：KeyResult 增加 confidence 字段（达成信心度，0-100 百分比，默认 50）
ALTER TABLE key_results
  ADD COLUMN IF NOT EXISTS confidence integer NOT NULL DEFAULT 50;

ALTER TABLE key_results
  ADD CONSTRAINT check_key_results_confidence_range
  CHECK (confidence BETWEEN 0 AND 100);
