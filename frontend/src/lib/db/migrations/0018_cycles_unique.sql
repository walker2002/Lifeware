-- 为 cycle 按自然键 (user_id, period_start, period_end) 去重创建唯一索引，
-- 供 022-migrate-period-to-cycle.ts 的 ON CONFLICT 用。
--
-- 前置去重（T4 CycleRepository 在无 UNIQUE 约束期间产生了重复行）：
--   1) 将重复行上的 objectives 重指向各组的 keeper（obj 最多的那行）；
--   2) 删除无 objectives 引用的重复行。
-- 已执行完毕（2026-06-26），此处仅留注释供审计。
--
-- 幂等：IF NOT EXISTS 确保重复执行不会失败。
CREATE UNIQUE INDEX IF NOT EXISTS uq_cycles_user_period
  ON cycles (user_id, period_start, period_end);
