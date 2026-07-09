-- [026.02.3.1] T2 — TD-025 v_running_timeboxes view stale filter 修复
--
-- [023.12] (2026-07-06) timebox.status 6→3 态收敛: 删 'running'/'overtime'/'ended'
-- 改读时派生 (derive-display-status.ts)。原 v_running_timeboxes view WHERE status IN
-- ('running', 'overtime') 永远空集, 实际 production 已无人调用但 doc stale。
--
-- 修复: 派生「当前运行中」→ planned AND now ∈ [start_time, end_time]
-- 触发替代: 时间态 'overtime' (logged + 已过 end) 不在本 view; 由 application
-- derive-display-status.ts 派生 'overtime' badge。
--
-- DDL: DROP IF EXISTS + CREATE OR REPLACE (跨 PG 版本幂等)
DROP VIEW IF EXISTS public.v_running_timeboxes;

CREATE OR REPLACE VIEW public.v_running_timeboxes AS
SELECT id, user_id, title, status, start_time, end_time, tags
FROM public.timeboxes
WHERE status = 'planned'
  AND start_time <= NOW()
  AND end_time >= NOW();

COMMENT ON VIEW public.v_running_timeboxes IS
  '[026.02.3.1] TD-025 fix: derive running timeboxes as planned + now ∈ [start,end]';
