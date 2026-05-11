-- Enhancement: OKR 编号/优先级/半年度周期
ALTER TABLE "objectives" ADD COLUMN "objective_number" text;
ALTER TABLE "objectives" ADD COLUMN "priority" text NOT NULL DEFAULT 'P1';
