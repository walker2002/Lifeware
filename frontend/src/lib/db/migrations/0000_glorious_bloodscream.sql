CREATE TABLE "action_surfaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"snapshot_id" uuid NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"guide" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tiles" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"cues" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "context_snapshots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"generated_by" text DEFAULT 'state_machine' NOT NULL,
	"current_time" timestamp with time zone NOT NULL,
	"current_date" date NOT NULL,
	"day_of_week" integer NOT NULL,
	"time_of_day" text NOT NULL,
	"energy_state" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"active_objectives" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active_key_results" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"active_tasks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pending_habits" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"current_timebox" jsonb,
	"upcoming_timeboxes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"pending_intentions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "check_context_snapshots_day_of_week" CHECK ("context_snapshots"."day_of_week" >= 0 AND "context_snapshots"."day_of_week" <= 6)
);
--> statement-breakpoint
CREATE TABLE "derived_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"energy_pattern" jsonb,
	"active_task_count" integer DEFAULT 0 NOT NULL,
	"avg_completion_rate_7d" real DEFAULT 0 NOT NULL,
	"avg_completion_rate_30d" real DEFAULT 0 NOT NULL,
	"habit_streaks" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"habit_completion_rates" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"timebox_adherence_7d" real DEFAULT 0 NOT NULL,
	"is_overcommitted" boolean DEFAULT false NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"data_window_days" integer DEFAULT 30 NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "energy_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"level" integer NOT NULL,
	"source" text NOT NULL,
	"context" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"logged_at" timestamp with time zone DEFAULT now() NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	CONSTRAINT "check_energy_logs_level" CHECK ("energy_logs"."level" >= 1 AND "energy_logs"."level" <= 10)
);
--> statement-breakpoint
CREATE TABLE "habit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"habit_id" uuid NOT NULL,
	"date" date NOT NULL,
	"status" text NOT NULL,
	"actual_duration" integer,
	"note" text,
	"logged_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "habits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"status" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"frequency_type" text NOT NULL,
	"scheduled_time" text NOT NULL,
	"duration" integer NOT NULL,
	"key_result_id" uuid,
	"streak" integer DEFAULT 0 NOT NULL,
	"longest_streak" integer DEFAULT 0 NOT NULL,
	"completion_rate_7d" real DEFAULT 0 NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"days_of_week" jsonb,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"suspended_at" timestamp with time zone,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "intentions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"status" text NOT NULL,
	"raw_input" text NOT NULL,
	"input_mode" text NOT NULL,
	"source_snapshot_id" uuid,
	"notes" text,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dissolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "key_results" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"status" text NOT NULL,
	"objective_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"target_value" numeric(10, 2) NOT NULL,
	"current_value" numeric(10, 2) DEFAULT '0' NOT NULL,
	"unit" text NOT NULL,
	"progress_rate" numeric(10, 4) DEFAULT '0' NOT NULL,
	"due_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	CONSTRAINT "check_key_results_target_positive" CHECK ("key_results"."target_value" > 0),
	CONSTRAINT "check_key_results_current_within_target" CHECK ("key_results"."current_value" >= 0 AND "key_results"."current_value" <= "key_results"."target_value")
);
--> statement-breakpoint
CREATE TABLE "objectives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"status" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"period_type" text NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"parent_id" uuid,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	CONSTRAINT "check_objectives_period_end_after_start" CHECK ("objectives"."period_end" > "objectives"."period_start")
);
--> statement-breakpoint
CREATE TABLE "reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"status" text NOT NULL,
	"type" text NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"generated_by" text NOT NULL,
	"sections" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"metrics" jsonb DEFAULT '{"tasksCompleted":0,"tasksTotal":0,"habitsCompleted":0,"habitsTotal":0,"timeboxedHours":0}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "state_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"intent_id" uuid NOT NULL,
	"target_object_type" text NOT NULL,
	"target_object_id" uuid,
	"action" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"approved_at" timestamp with time zone NOT NULL,
	"approved_by" text DEFAULT 'rule_engine' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "structured_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"intention_id" uuid NOT NULL,
	"target_domain" text NOT NULL,
	"action" text NOT NULL,
	"fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"confidence" real NOT NULL,
	"resolved_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "system_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"type" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"triggered_by" text NOT NULL,
	"snapshot_id" uuid,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"processed" boolean DEFAULT false NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"status" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"priority" text NOT NULL,
	"energy_required" text NOT NULL,
	"estimated_duration" integer NOT NULL,
	"actual_duration" integer,
	"key_result_id" uuid,
	"timebox_id" uuid,
	"due_date" date,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"recurrence" jsonb,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "timebox_habits" (
	"timebox_id" uuid NOT NULL,
	"habit_id" uuid NOT NULL,
	CONSTRAINT "timebox_habits_timebox_id_habit_id_pk" PRIMARY KEY("timebox_id","habit_id")
);
--> statement-breakpoint
CREATE TABLE "timebox_tasks" (
	"timebox_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	CONSTRAINT "timebox_tasks_timebox_id_task_id_pk" PRIMARY KEY("timebox_id","task_id")
);
--> statement-breakpoint
CREATE TABLE "timeboxes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"status" text NOT NULL,
	"title" text NOT NULL,
	"start_time" timestamp with time zone NOT NULL,
	"end_time" timestamp with time zone NOT NULL,
	"is_recurring" boolean DEFAULT false NOT NULL,
	"recurrence_rule" jsonb,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"paused_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"logged_at" timestamp with time zone,
	CONSTRAINT "check_timeboxes_end_after_start" CHECK ("timeboxes"."end_time" > "timeboxes"."start_time")
);
--> statement-breakpoint
CREATE TABLE "user_calibration" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"afternoon_start" integer DEFAULT 12 NOT NULL,
	"evening_start" integer DEFAULT 18 NOT NULL,
	"night_start" integer DEFAULT 22 NOT NULL,
	"peak_energy_start" integer DEFAULT 9 NOT NULL,
	"peak_energy_end" integer DEFAULT 12 NOT NULL,
	"energy_confidence" real DEFAULT 0 NOT NULL,
	"chronotype" text DEFAULT 'intermediate' NOT NULL,
	"energy_sensitivity" text DEFAULT 'medium' NOT NULL,
	"baseline_curve" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"comfortable_wip_limit" integer DEFAULT 5 NOT NULL,
	"sustainable_deep_work_hours" real DEFAULT 4 NOT NULL,
	"habit_risk_days" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"habit_preferred_time_slots" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"rule_override_history" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "action_surfaces" ADD CONSTRAINT "action_surfaces_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "action_surfaces" ADD CONSTRAINT "action_surfaces_snapshot_id_context_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."context_snapshots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "context_snapshots" ADD CONSTRAINT "context_snapshots_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "derived_signals" ADD CONSTRAINT "derived_signals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "energy_logs" ADD CONSTRAINT "energy_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_logs" ADD CONSTRAINT "habit_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habit_logs" ADD CONSTRAINT "habit_logs_habit_id_habits_id_fk" FOREIGN KEY ("habit_id") REFERENCES "public"."habits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habits" ADD CONSTRAINT "habits_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "habits" ADD CONSTRAINT "habits_key_result_id_key_results_id_fk" FOREIGN KEY ("key_result_id") REFERENCES "public"."key_results"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "intentions" ADD CONSTRAINT "intentions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "key_results" ADD CONSTRAINT "key_results_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "key_results" ADD CONSTRAINT "key_results_objective_id_objectives_id_fk" FOREIGN KEY ("objective_id") REFERENCES "public"."objectives"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "objectives" ADD CONSTRAINT "objectives_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "state_proposals" ADD CONSTRAINT "state_proposals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "state_proposals" ADD CONSTRAINT "state_proposals_intent_id_structured_intents_id_fk" FOREIGN KEY ("intent_id") REFERENCES "public"."structured_intents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "structured_intents" ADD CONSTRAINT "structured_intents_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "structured_intents" ADD CONSTRAINT "structured_intents_intention_id_intentions_id_fk" FOREIGN KEY ("intention_id") REFERENCES "public"."intentions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_events" ADD CONSTRAINT "system_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "system_events" ADD CONSTRAINT "system_events_snapshot_id_context_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."context_snapshots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_key_result_id_key_results_id_fk" FOREIGN KEY ("key_result_id") REFERENCES "public"."key_results"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timebox_habits" ADD CONSTRAINT "timebox_habits_timebox_id_timeboxes_id_fk" FOREIGN KEY ("timebox_id") REFERENCES "public"."timeboxes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timebox_habits" ADD CONSTRAINT "timebox_habits_habit_id_habits_id_fk" FOREIGN KEY ("habit_id") REFERENCES "public"."habits"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timebox_tasks" ADD CONSTRAINT "timebox_tasks_timebox_id_timeboxes_id_fk" FOREIGN KEY ("timebox_id") REFERENCES "public"."timeboxes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timebox_tasks" ADD CONSTRAINT "timebox_tasks_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timeboxes" ADD CONSTRAINT "timeboxes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_calibration" ADD CONSTRAINT "user_calibration_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_action_surfaces_user" ON "action_surfaces" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_action_surfaces_snapshot" ON "action_surfaces" USING btree ("snapshot_id");--> statement-breakpoint
CREATE INDEX "idx_action_surfaces_generated" ON "action_surfaces" USING btree ("user_id","generated_at");--> statement-breakpoint
CREATE INDEX "idx_context_snapshots_user_generated" ON "context_snapshots" USING btree ("user_id","generated_at");--> statement-breakpoint
CREATE INDEX "idx_context_snapshots_user_date" ON "context_snapshots" USING btree ("user_id","current_date");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_derived_signals_user" ON "derived_signals" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_energy_logs_user_logged" ON "energy_logs" USING btree ("user_id","logged_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_habit_logs_habit_date" ON "habit_logs" USING btree ("habit_id","date");--> statement-breakpoint
CREATE INDEX "idx_habit_logs_user_date" ON "habit_logs" USING btree ("user_id","date");--> statement-breakpoint
CREATE INDEX "idx_habit_logs_habit_id" ON "habit_logs" USING btree ("habit_id");--> statement-breakpoint
CREATE INDEX "idx_habits_user_status" ON "habits" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "idx_habits_start_date" ON "habits" USING btree ("user_id","start_date");--> statement-breakpoint
CREATE INDEX "idx_habits_key_result" ON "habits" USING btree ("key_result_id");--> statement-breakpoint
CREATE INDEX "idx_intentions_user_status" ON "intentions" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "idx_intentions_captured_at" ON "intentions" USING btree ("user_id","captured_at");--> statement-breakpoint
CREATE INDEX "idx_key_results_user_status" ON "key_results" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "idx_key_results_objective" ON "key_results" USING btree ("objective_id");--> statement-breakpoint
CREATE INDEX "idx_key_results_due_date" ON "key_results" USING btree ("user_id","due_date");--> statement-breakpoint
CREATE INDEX "idx_objectives_user_status" ON "objectives" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "idx_objectives_period" ON "objectives" USING btree ("user_id","period_start","period_end");--> statement-breakpoint
CREATE INDEX "idx_objectives_parent" ON "objectives" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "idx_reviews_user_status" ON "reviews" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "idx_reviews_user_period" ON "reviews" USING btree ("user_id","period_start","period_end");--> statement-breakpoint
CREATE INDEX "idx_reviews_user_type" ON "reviews" USING btree ("user_id","type");--> statement-breakpoint
CREATE INDEX "idx_state_proposals_user" ON "state_proposals" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_state_proposals_intent" ON "state_proposals" USING btree ("intent_id");--> statement-breakpoint
CREATE INDEX "idx_structured_intents_user" ON "structured_intents" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_structured_intents_intention" ON "structured_intents" USING btree ("intention_id");--> statement-breakpoint
CREATE INDEX "idx_system_events_user_occurred" ON "system_events" USING btree ("user_id","occurred_at");--> statement-breakpoint
CREATE INDEX "idx_system_events_user_type" ON "system_events" USING btree ("user_id","type");--> statement-breakpoint
CREATE INDEX "idx_system_events_unprocessed" ON "system_events" USING btree ("user_id","processed");--> statement-breakpoint
CREATE INDEX "idx_tasks_user_status" ON "tasks" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "idx_tasks_priority" ON "tasks" USING btree ("user_id","priority");--> statement-breakpoint
CREATE INDEX "idx_tasks_due_date" ON "tasks" USING btree ("user_id","due_date");--> statement-breakpoint
CREATE INDEX "idx_tasks_key_result" ON "tasks" USING btree ("key_result_id");--> statement-breakpoint
CREATE INDEX "idx_tasks_timebox" ON "tasks" USING btree ("timebox_id");--> statement-breakpoint
CREATE INDEX "idx_timebox_habits_habit" ON "timebox_habits" USING btree ("habit_id");--> statement-breakpoint
CREATE INDEX "idx_timebox_tasks_task" ON "timebox_tasks" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "idx_timeboxes_user_status" ON "timeboxes" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "idx_timeboxes_user_start" ON "timeboxes" USING btree ("user_id","start_time");--> statement-breakpoint
CREATE INDEX "idx_timeboxes_user_end" ON "timeboxes" USING btree ("user_id","end_time");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_user_calibration_user" ON "user_calibration" USING btree ("user_id");