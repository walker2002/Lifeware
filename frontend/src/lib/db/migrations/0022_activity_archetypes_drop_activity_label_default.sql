-- [023] A1 post-review I-3: 移除 activity_label 的 DEFAULT '{}'::jsonb
-- 原因：ActivityLabel interface 有 6 个必填字段，空对象 {} 违反类型契约。
-- impl (schema.ts) 已无 default，本迁移使 DB 与 impl 一致——裸 SQL 插入不提供
-- activity_label 将在 DB 层失败（NOT NULL 无 default），defense-in-depth。
ALTER TABLE activity_archetypes ALTER COLUMN activity_label DROP DEFAULT;
