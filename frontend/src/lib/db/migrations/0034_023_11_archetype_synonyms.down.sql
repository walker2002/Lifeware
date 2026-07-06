BEGIN;
ALTER TABLE activity_archetypes DROP COLUMN IF EXISTS synonyms;
COMMIT;
