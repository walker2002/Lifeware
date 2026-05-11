-- Previous migration: 0002_habit_enhancements
-- This migration adds OKR core fields: discarded status, okr_type, discarded_at

-- Update status enum for objectives: add 'discarded'
ALTER TABLE "objectives" ADD COLUMN IF NOT EXISTS "okr_type" text DEFAULT 'committed' NOT NULL;
ALTER TABLE "objectives" ADD COLUMN IF NOT EXISTS "discarded_at" timestamp with time zone;

-- Update status enum for key_results: add 'discarded'
ALTER TABLE "key_results" ADD COLUMN IF NOT EXISTS "discarded_at" timestamp with time zone;
