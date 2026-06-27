-- [022] OKR Domain 重组 Phase 1 Task 2：cycles 表 + objectives.cycle_id
-- cycles 承载 OKR 周期元数据；objectives.cycle_id 可空（回填前 NULL，1C Task 17 SET NOT NULL）。
-- objectives.period_* 三列放开 NOT NULL（mapper 自 Task 5 起不再写 period），
-- 列本身暂留，1C Task 17 再 DROP。
-- 注：本项目迁移一直手写 + 手动执行；drizzle-kit generate 因历史 snapshot 债无法干净运行。

-- ─── cycles ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "cycles" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "schema_version" integer NOT NULL DEFAULT 1,
  "cycle_type" text NOT NULL,
  "name" text NOT NULL,
  "period_start" date NOT NULL,
  "period_end" date NOT NULL,
  "status" text NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  "started_at" timestamp with time zone,
  "ended_at" timestamp with time zone,
  "reviewed_at" timestamp with time zone,
  CONSTRAINT "check_cycles_period_end_after_start" CHECK ("period_end" > "period_start")
);

CREATE INDEX IF NOT EXISTS "idx_cycles_user_status" ON "cycles" ("user_id", "status");
CREATE INDEX IF NOT EXISTS "idx_cycles_period" ON "cycles" ("user_id", "period_start", "period_end");

-- ─── objectives.cycle_id（可空，回填前 NULL）──────────────────
ALTER TABLE "objectives" ADD COLUMN IF NOT EXISTS "cycle_id" uuid REFERENCES "cycles"("id") ON DELETE RESTRICT;
CREATE INDEX IF NOT EXISTS "idx_objectives_cycle" ON "objectives" ("cycle_id");

-- ─── objectives.period_* 放开 NOT NULL（列暂留，1C Task 17 DROP）───
ALTER TABLE "objectives" ALTER COLUMN "period_type" DROP NOT NULL;
ALTER TABLE "objectives" ALTER COLUMN "period_start" DROP NOT NULL;
ALTER TABLE "objectives" ALTER COLUMN "period_end" DROP NOT NULL;
