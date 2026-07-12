-- [TD-003] T1: 为 timeboxes 表加 occ_version 列做 OCC 乐观并发控制
--
-- 列名用 occ_version 而非 version，避免与已有 schema_version（USOM schema 迁移用）命名冲突。
-- DEFAULT 1：现有 16 行（dev DB 实测）迁移时自动填 1，老 row 不破坏。
-- NOT NULL：写入层必须显式提供（Task 2 repository 层 WHERE 谓词会用到）。
ALTER TABLE timeboxes ADD COLUMN occ_version integer NOT NULL DEFAULT 1;
