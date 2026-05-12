-- Task Management: projects, templates, task extensions
CREATE TABLE "projects" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "schema_version" integer DEFAULT 1 NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "status" text NOT NULL,
  "start_date" date,
  "end_date" date,
  "default_earliest_time" text,
  "default_latest_start_time" text,
  "default_duration" integer,
  "priority" text,
  "color" text,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "notes" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  "archived_at" timestamp with time zone
);

CREATE INDEX "idx_projects_user_status" ON "projects" USING btree ("user_id","status");
CREATE INDEX "idx_projects_user_start_date" ON "projects" USING btree ("user_id","start_date");

CREATE TABLE "project_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE cascade,
  "name" text NOT NULL,
  "description" text,
  "default_earliest_time" text,
  "default_latest_start_time" text,
  "default_duration" integer,
  "priority" text,
  "color" text,
  "tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX "idx_project_templates_user" ON "project_templates" USING btree ("user_id");

CREATE TABLE "task_templates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "project_template_id" uuid REFERENCES "project_templates"("id") ON DELETE cascade,
  "parent_template_id" uuid,
  "title" text NOT NULL,
  "description" text,
  "priority" text,
  "energy_required" text,
  "estimated_duration" integer,
  "earliest_time" text,
  "latest_start_time" text,
  "default_time" text,
  "default_duration" integer,
  "frequency_type" text,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX "idx_task_templates_project" ON "task_templates" USING btree ("project_template_id");
CREATE INDEX "idx_task_templates_parent" ON "task_templates" USING btree ("parent_template_id");

ALTER TABLE "task_templates" ADD CONSTRAINT "task_templates_parent_template_id_task_templates_id_fk" FOREIGN KEY ("parent_template_id") REFERENCES "task_templates"("id") ON DELETE set null;

-- Extend tasks table
ALTER TABLE "tasks" ADD COLUMN "parent_id" uuid;
ALTER TABLE "tasks" ADD COLUMN "project_id" uuid;
ALTER TABLE "tasks" ADD COLUMN "earliest_time" text;
ALTER TABLE "tasks" ADD COLUMN "latest_start_time" text;
ALTER TABLE "tasks" ADD COLUMN "default_time" text;
ALTER TABLE "tasks" ADD COLUMN "default_duration" integer;
ALTER TABLE "tasks" ADD COLUMN "frequency_type" text;
ALTER TABLE "tasks" ADD COLUMN "days_of_week" jsonb;
ALTER TABLE "tasks" ADD COLUMN "start_date" date;
ALTER TABLE "tasks" ADD COLUMN "end_date" date;

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_parent_id_tasks_id_fk" FOREIGN KEY ("parent_id") REFERENCES "tasks"("id") ON DELETE set null;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE set null;

CREATE INDEX "idx_tasks_user_project" ON "tasks" USING btree ("user_id","project_id");
CREATE INDEX "idx_tasks_user_parent" ON "tasks" USING btree ("user_id","parent_id");
CREATE INDEX "idx_tasks_project_status" ON "tasks" USING btree ("project_id","status");
