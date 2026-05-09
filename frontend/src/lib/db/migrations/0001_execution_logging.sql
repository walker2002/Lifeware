-- 时间盒执行记录 migration
-- 1. 移除 paused_at 字段（不再需要暂停功能）
-- 2. 新增 overtime_at 字段（超时自动标记时间）
-- 3. 新增 execution_record JSONB 字段（执行记录数据）
-- 注意：status 是 TEXT 类型，无需 ALTER ENUM

ALTER TABLE "timeboxes" DROP COLUMN IF EXISTS "paused_at";
--> statement-breakpoint
ALTER TABLE "timeboxes" ADD COLUMN "overtime_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "timeboxes" ADD COLUMN "execution_record" jsonb;
