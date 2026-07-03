-- [026] A1.2: itineraries 表（行程，D2 reversal: 5 态存储 + 4 transition 时间戳）
-- 镜像 OKR Cycle 模式：状态存 DB，SM 驱动 transition；时间驱动由 reconcile 懒推
-- 设计来源：docs/superpowers/specs/2026-07-03-026-itinerary.md §数据底座
-- 幂等：CREATE TABLE / CREATE INDEX 均用 IF NOT EXISTS，可安全重跑

BEGIN;

CREATE TABLE IF NOT EXISTS itineraries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  schema_version  integer NOT NULL DEFAULT 1,
  title           text NOT NULL,
  detail          text,
  start_time      timestamptz NOT NULL,
  duration_min    integer NOT NULL,
  people          jsonb NOT NULL DEFAULT '[]',
  status          text NOT NULL DEFAULT 'scheduled'
                    CHECK (status IN ('scheduled', 'in_progress', 'expired', 'cancelled', 'completed')),
  in_progress_at  timestamptz,
  expired_at      timestamptz,
  completed_at    timestamptz,
  cancelled_at    timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- reconcile 查询索引：未终态 + 起始日 ≤ 今天
CREATE INDEX IF NOT EXISTS idx_itineraries_user_status_start
  ON itineraries(user_id, status, start_time);
-- Page 列表索引：按 user + status 筛
CREATE INDEX IF NOT EXISTS idx_itineraries_user_status
  ON itineraries(user_id, status);

COMMIT;
