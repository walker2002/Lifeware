-- [023.05] PR2: itineraries → appointments 重命名（表 + 2 索引）
-- 设计来源：~/.gstack/projects/walker2002-lifeware/walker-main-design-20260704-itinerary-rename.md §2.1（目标词 schedule→appointment 覆盖，eng-review 期用户决议）
-- OQ-1 决议：RENAME（保数据）；itineraries 无 FK 被引用，RENAME 安全。
-- 注意：ALTER ... RENAME TO 无 IF EXISTS，不可重跑；靠 __drizzle_migrations hash 一次性应用。

BEGIN;

ALTER TABLE itineraries RENAME TO appointments;
ALTER INDEX idx_itineraries_user_status_start RENAME TO idx_appointments_user_status_start;
ALTER INDEX idx_itineraries_user_status RENAME TO idx_appointments_user_status;

COMMIT;