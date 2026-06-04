-- Custom SQL migration
-- Task Domain 重构：Project → Thread，新增 AI/用户标签列

-- 1. 创建 threads 表
CREATE TABLE IF NOT EXISTS "threads" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "schema_version" integer NOT NULL DEFAULT 1,
  "name" text NOT NULL,
  "description" text,
  "color" text,
  "status" text NOT NULL,
  "start_date" date,
  "end_date" date,
  "priority" text,
  "tags" jsonb NOT NULL DEFAULT '[]',
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "completed_at" timestamp with time zone,
  "archived_at" timestamp with time zone
);

CREATE INDEX IF NOT EXISTS "idx_threads_user_status" ON "threads" ("user_id", "status");
CREATE INDEX IF NOT EXISTS "idx_threads_user_start" ON "threads" ("user_id", "start_date");

-- 2. 迁移现有 projects 数据到 threads（如果 projects 表存在）
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'projects') THEN
    INSERT INTO "threads" ("id", "user_id", "schema_version", "name", "description", "color", "status", "start_date", "end_date", "priority", "tags", "created_at", "updated_at", "completed_at", "archived_at")
    SELECT "id", "user_id", "schema_version", "name", "description", "color", "status", "start_date", "end_date", "priority", "tags", "created_at", "updated_at", "completed_at", "archived_at"
    FROM "projects"
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- 3. 迁移 tasks 表：project_id → thread_id
ALTER TABLE "tasks" RENAME COLUMN "project_id" TO "thread_id";

-- 4. 清理孤儿引用：将不存在于 threads 中的 thread_id 置为 NULL
UPDATE "tasks" SET "thread_id" = NULL
WHERE "thread_id" IS NOT NULL
  AND "thread_id" NOT IN (SELECT "id" FROM "threads");

-- 5. 现在 FK 约束安全了
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_thread_id_threads_id_fk"
  FOREIGN KEY ("thread_id") REFERENCES "threads"("id") ON DELETE set null ON UPDATE no action;

-- 6. 新增 AI 维护标签列
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "clarity" text NOT NULL DEFAULT 'fuzzy';
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "complexity" jsonb NOT NULL DEFAULT '[]';
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "decomposition" text;

-- 7. 新增用户管理标签列
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "capture_mode" text NOT NULL DEFAULT 'ad_hoc';
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "energy_profile" text;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "scheduling_constraint" text;
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "tracking" text NOT NULL DEFAULT 'check_in';

-- 8. 新增 AI 辅助扩展数据列
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "ai_tags" jsonb NOT NULL DEFAULT '{}';

-- 9. 新增索引
CREATE INDEX IF NOT EXISTS "idx_tasks_user_clarity" ON "tasks" ("user_id", "clarity");
CREATE INDEX IF NOT EXISTS "idx_tasks_user_thread" ON "tasks" ("user_id", "thread_id");
CREATE INDEX IF NOT EXISTS "idx_tasks_user_priority" ON "tasks" ("user_id", "priority");
CREATE INDEX IF NOT EXISTS "idx_tasks_user_energy" ON "tasks" ("user_id", "energy_profile");
CREATE INDEX IF NOT EXISTS "idx_tasks_user_constraint" ON "tasks" ("user_id", "scheduling_constraint");
CREATE INDEX IF NOT EXISTS "idx_tasks_user_tracking" ON "tasks" ("user_id", "tracking");
CREATE INDEX IF NOT EXISTS "idx_tasks_due_date" ON "tasks" ("user_id", "due_date");

-- 10. 旧索引清理（如果存在基于 project_id 的旧索引）
DROP INDEX IF EXISTS "idx_tasks_user_project";
