-- [023.05] PR2 rollback: appointments → itineraries 反向重命名（F5 codex Gap 4）
-- 注意：RENAME 无 IF EXISTS，不可重跑。

BEGIN;

ALTER TABLE appointments RENAME TO itineraries;
ALTER INDEX idx_appointments_user_status_start RENAME TO idx_itineraries_user_status_start;
ALTER INDEX idx_appointments_user_status RENAME TO idx_itineraries_user_status;

COMMIT;