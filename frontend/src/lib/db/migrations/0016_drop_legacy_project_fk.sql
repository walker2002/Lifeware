-- 删除残留的旧外键约束
-- 0013 重构时 RENAME COLUMN project_id → thread_id，但遗漏了原 FK 约束
-- 旧约束仍引用 projects 表，导致插入/更新 thread_id 时触发外键检查
ALTER TABLE "tasks" DROP CONSTRAINT IF EXISTS "tasks_project_id_projects_id_fk";
