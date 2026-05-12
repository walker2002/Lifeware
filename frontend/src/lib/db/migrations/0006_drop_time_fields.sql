ALTER TABLE "projects" DROP COLUMN IF EXISTS "default_earliest_time";
ALTER TABLE "projects" DROP COLUMN IF EXISTS "default_latest_start_time";
ALTER TABLE "projects" DROP COLUMN IF EXISTS "default_duration";

ALTER TABLE "tasks" DROP COLUMN IF EXISTS "earliest_time";
ALTER TABLE "tasks" DROP COLUMN IF EXISTS "latest_start_time";
ALTER TABLE "tasks" DROP COLUMN IF EXISTS "default_time";
ALTER TABLE "tasks" DROP COLUMN IF EXISTS "default_duration";
