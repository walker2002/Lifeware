-- [029] 逻辑日：logical_days 表 + timebox/appointment logical_day_id + v_schedule_slots 视图
-- 设计来源：docs/superpowers/specs/2026-07-14-029-logical-day-design.md
-- PR1: 仅 logical_days + 事件 FK + 视图（habit LDM 列迁移 = PR2，NOT IN THIS MIGRATION）

-- 1. logical_days 表
CREATE TABLE IF NOT EXISTS logical_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  schema_version integer NOT NULL DEFAULT 1,
  day_label date NOT NULL,
  wake_time timestamp with time zone,
  sleep_duration_minutes integer,
  energy_baseline integer,
  review_rating smallint,
  review_notes text,
  created_at timestamp with time zone NOT NULL DEFAULT NOW(),
  updated_at timestamp with time zone NOT NULL DEFAULT NOW(),
  CONSTRAINT uniq_logical_days_user_label UNIQUE (user_id, day_label),
  CONSTRAINT check_logical_days_energy CHECK (energy_baseline IS NULL OR energy_baseline BETWEEN 1 AND 10),
  CONSTRAINT check_logical_days_rating CHECK (review_rating IS NULL OR review_rating BETWEEN 1 AND 5)
);
CREATE INDEX IF NOT EXISTS idx_logical_days_user_label ON logical_days(user_id, day_label);

-- 2. timeboxes + logical_day_id
ALTER TABLE timeboxes ADD COLUMN IF NOT EXISTS logical_day_id uuid REFERENCES logical_days(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_timeboxes_user_logical_day ON timeboxes(user_id, logical_day_id);

-- 3. appointments + logical_day_id
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS logical_day_id uuid REFERENCES logical_days(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_appointments_user_logical_day ON appointments(user_id, logical_day_id);

-- 4. v_schedule_slots 统计视图（PR1 视图）
CREATE OR REPLACE VIEW public.v_schedule_slots AS
SELECT id, user_id, logical_day_id, title, start_time, end_time,
       activity_archetype_id, source_type, source_status, slot_state, people, tags
FROM (
  SELECT id, user_id, logical_day_id, title, start_time, end_time,
         activity_archetype_id, tags,
         'timebox'::text    AS source_type,
         status             AS source_status,
         CASE status WHEN 'logged'    THEN 'completed'
                     WHEN 'cancelled' THEN 'cancelled'
                     ELSE 'scheduled' END AS slot_state,
         NULL::jsonb AS people
  FROM timeboxes
  UNION ALL
  SELECT id, user_id, logical_day_id, title, start_time,
         start_time + (duration_min * interval '1 minute') AS end_time,
         activity_archetype_id, NULL::jsonb AS tags,
         'appointment'::text AS source_type,
         status              AS source_status,
         CASE status WHEN 'completed' THEN 'completed'
                     WHEN 'cancelled' THEN 'cancelled'
                     ELSE 'scheduled' END AS slot_state,
         people
  FROM appointments
) s;

COMMENT ON VIEW v_schedule_slots IS
  '[029] 统一 schedule 统计入口。IRON RULE: 统计/聚合必须查本视图，禁止裸查 timeboxes 或 appointments。appointment.end_time 派生不可索引，范围查询按 logical_day_id 过滤。';
