-- [026.01] 给 appointments 加 activity_archetype_id 列 + FK + 索引
-- 设计来源：docs/superpowers/specs/2026-07-05-026-01-appointment-cnui-optimization-design.md
-- 幂等（IF NOT EXISTS），nullable，ON DELETE SET NULL（archetype 被删时 appointment 保留）
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS activity_archetype_id uuid
    REFERENCES activity_archetypes(id) ON DELETE SET NULL;

-- 索引：archetype 反向查询「哪些 appointment 用这个原型」（普通索引，量级小）
CREATE INDEX IF NOT EXISTS idx_appointments_archetype
  ON appointments(activity_archetype_id);