# Data Model: Align Foundation Layer

**Feature**: 001-align-foundation
**Date**: 2026-05-02

## Entity Relationship Overview

```
users
  └── user_calibration (1:1, user_id unique)
  └── energy_logs (1:N)
  └── objectives (1:N)
  │     └── key_results (1:N)
  │           └── tasks (N:1 via key_result_id)
  │           └── habits (N:1 via key_result_id)
  └── tasks (1:N)
  │     └── timebox_tasks (N:M via junction)
  └── habits (1:N)
  │     └── habit_logs (1:N)
  │     └── timebox_habits (N:M via junction)
  └── timeboxes (1:N)
  │     └── timebox_tasks (junction)
  │     └── timebox_habits (junction)
  └── intentions (1:N)
  │     └── structured_intents (1:N)
  │           └── state_proposals (1:N)
  └── reviews (1:N)
  └── context_snapshots (1:N)
  │     └── system_events (N:1 via snapshot_id)
  │     └── action_surfaces (1:N)
  └── system_events (1:N)
  └── action_surfaces (1:N)
  └── derived_signals (1:1, user_id unique)
```

## Entity Definitions

### users

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK, default gen_random_uuid() | |
| email | text | NOT NULL, UNIQUE | |
| created_at | timestamptz | NOT NULL, default now() | |
| updated_at | timestamptz | NOT NULL, default now() | |

### user_calibration

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK | |
| user_id | uuid | FK users(id) CASCADE, UNIQUE | One row per user |
| afternoon_start | integer | NOT NULL, default 12 | |
| evening_start | integer | NOT NULL, default 18 | |
| night_start | integer | NOT NULL, default 22 | |
| peak_energy_start | integer | NOT NULL, default 9 | |
| peak_energy_end | integer | NOT NULL, default 12 | |
| energy_confidence | real | NOT NULL, default 0 | 0-1 |
| chronotype | text | NOT NULL, CHECK in ('morning_lark','night_owl','intermediate') | |
| energy_sensitivity | text | NOT NULL, CHECK in ('high','medium','low') | |
| baseline_curve | jsonb | NOT NULL, default '[]' | EnergyCurvePoint[] |
| comfortable_wip_limit | integer | NOT NULL, default 5 | |
| sustainable_deep_work_hours | real | NOT NULL, default 4 | |
| habit_risk_days | jsonb | NOT NULL, default '[]' | number[] |
| habit_preferred_time_slots | jsonb | NOT NULL, default '[]' | string[] |
| rule_override_history | jsonb | NOT NULL, default '{}' | Record<string, RuleOverrideEntry> |
| updated_at | timestamptz | NOT NULL, default now() | |
| schema_version | integer | NOT NULL, default 1 | |

### energy_logs

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK | |
| user_id | uuid | FK users(id) CASCADE | |
| level | integer | NOT NULL, CHECK 1-10 | |
| source | text | NOT NULL, CHECK in ('user','system') | |
| context | jsonb | NOT NULL, default '{}' | |
| logged_at | timestamptz | NOT NULL, default now() | |
| schema_version | integer | NOT NULL, default 1 | |

### objectives

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK | |
| user_id | uuid | FK users(id) CASCADE | |
| schema_version | integer | NOT NULL, default 1 | |
| status | text | NOT NULL, CHECK enum | draft/active/paused/completed/archived |
| title | text | NOT NULL | |
| description | text | | |
| period_type | text | NOT NULL, CHECK enum | daily/weekly/monthly/quarterly/annual |
| period_start | date | NOT NULL | |
| period_end | date | NOT NULL | CHECK > period_start |
| parent_id | uuid | FK objectives(id) SET NULL | Self-reference for hierarchy |
| tags | jsonb | NOT NULL, default '[]' | string[] |
| created_at | timestamptz | NOT NULL, default now() | |
| updated_at | timestamptz | NOT NULL, default now() | |
| completed_at | timestamptz | | |
| archived_at | timestamptz | | |

### key_results

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK | |
| user_id | uuid | FK users(id) CASCADE | |
| schema_version | integer | NOT NULL, default 1 | |
| status | text | NOT NULL, CHECK enum | |
| objective_id | uuid | FK objectives(id) CASCADE | |
| title | text | NOT NULL | |
| description | text | | |
| target_value | numeric | NOT NULL, CHECK > 0 | |
| current_value | numeric | NOT NULL, default 0, CHECK 0..target | |
| unit | text | NOT NULL | |
| progress_rate | numeric | NOT NULL, default 0 | Redundant for sorting |
| due_date | date | | |
| created_at | timestamptz | NOT NULL | |
| updated_at | timestamptz | NOT NULL | |
| completed_at | timestamptz | | |
| archived_at | timestamptz | | |

### tasks

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK | |
| user_id | uuid | FK users(id) CASCADE | |
| schema_version | integer | NOT NULL, default 1 | |
| status | text | NOT NULL, CHECK enum | draft/active/scheduled/completed/archived |
| title | text | NOT NULL | |
| description | text | | |
| priority | text | NOT NULL, CHECK enum | critical/high/medium/low |
| energy_required | text | NOT NULL, CHECK enum | high/medium/low |
| estimated_duration | integer | NOT NULL | Minutes |
| actual_duration | integer | | Minutes |
| key_result_id | uuid | FK key_results(id) SET NULL | |
| timebox_id | uuid | Soft reference, no FK | Derived from junction table |
| due_date | date | | |
| tags | jsonb | NOT NULL, default '[]' | |
| recurrence | jsonb | | RecurrenceRule, MVP stub |
| notes | text | | |
| created_at | timestamptz | NOT NULL | |
| updated_at | timestamptz | NOT NULL | |
| completed_at | timestamptz | | |
| archived_at | timestamptz | | |

### habits

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK | |
| user_id | uuid | FK users(id) CASCADE | |
| schema_version | integer | NOT NULL, default 1 | |
| status | text | NOT NULL, CHECK enum | draft/active/suspended/archived |
| title | text | NOT NULL | |
| description | text | | |
| frequency_type | text | NOT NULL, CHECK enum | daily/weekly/custom |
| scheduled_time | text | NOT NULL, regex HH:MM | |
| duration | integer | NOT NULL | Minutes |
| key_result_id | uuid | FK key_results(id) SET NULL | |
| streak | integer | NOT NULL, default 0 | |
| longest_streak | integer | NOT NULL, default 0 | |
| completion_rate_7d | real | NOT NULL, default 0 | |
| start_date | date | NOT NULL | |
| end_date | date | | |
| days_of_week | jsonb | | number[], null for daily |
| tags | jsonb | NOT NULL, default '[]' | |
| notes | text | | |
| created_at | timestamptz | NOT NULL | |
| updated_at | timestamptz | NOT NULL | |
| suspended_at | timestamptz | | |
| archived_at | timestamptz | | |

### habit_logs

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK | |
| user_id | uuid | FK users(id) CASCADE | |
| schema_version | integer | NOT NULL, default 1 | |
| habit_id | uuid | FK habits(id) CASCADE | |
| date | date | NOT NULL | |
| status | text | NOT NULL, CHECK enum | completed/skipped/partial |
| actual_duration | integer | | Minutes |
| note | text | | |
| logged_at | timestamptz | NOT NULL, default now() | |
| source | text | NOT NULL, CHECK enum, default 'manual' | manual/connector |

**Unique**: `(habit_id, date)` — one log per habit per day.

### timeboxes

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK | |
| user_id | uuid | FK users(id) CASCADE | |
| schema_version | integer | NOT NULL, default 1 | |
| status | text | NOT NULL, CHECK enum | planned/running/paused/ended/logged |
| title | text | NOT NULL | |
| start_time | timestamptz | NOT NULL | |
| end_time | timestamptz | NOT NULL, CHECK > start_time | |
| is_recurring | boolean | NOT NULL, default false | |
| recurrence_rule | jsonb | | MVP stub |
| tags | jsonb | NOT NULL, default '[]' | |
| notes | text | | |
| created_at | timestamptz | NOT NULL | |
| updated_at | timestamptz | NOT NULL | |
| started_at | timestamptz | | |
| paused_at | timestamptz | | |
| ended_at | timestamptz | | |
| logged_at | timestamptz | | |

### timebox_tasks (Junction)

| Column | Type | Constraints |
|---|---|---|
| timebox_id | uuid | FK timeboxes(id) CASCADE, PK component |
| task_id | uuid | FK tasks(id) CASCADE, PK component |

### timebox_habits (Junction)

| Column | Type | Constraints |
|---|---|---|
| timebox_id | uuid | FK timeboxes(id) CASCADE, PK component |
| habit_id | uuid | FK habits(id) CASCADE, PK component |

### intentions

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK | |
| user_id | uuid | FK users(id) CASCADE | |
| schema_version | integer | NOT NULL, default 1 | |
| status | text | NOT NULL, CHECK enum | captured/clarified/routed/dissolved |
| raw_input | text | NOT NULL | |
| input_mode | text | NOT NULL, CHECK enum | natural_language/template_form/slash_command |
| source_snapshot_id | uuid | Soft reference | |
| notes | text | | |
| captured_at | timestamptz | NOT NULL, default now() | |
| dissolved_at | timestamptz | | |

### structured_intents

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK | |
| user_id | uuid | FK users(id) CASCADE | |
| schema_version | integer | NOT NULL, default 1 | |
| intention_id | uuid | FK intentions(id) CASCADE | |
| target_domain | text | NOT NULL | |
| action | text | NOT NULL | |
| fields | jsonb | NOT NULL, default '{}' | |
| confidence | real | NOT NULL | |
| resolved_by | text | NOT NULL, CHECK enum | ai/template_form |
| created_at | timestamptz | NOT NULL | |

### state_proposals (MVP optional)

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK | |
| user_id | uuid | FK users(id) CASCADE | |
| schema_version | integer | NOT NULL, default 1 | |
| intent_id | uuid | FK structured_intents(id) CASCADE | |
| target_object_type | text | NOT NULL | |
| target_object_id | uuid | | Null = new object |
| action | text | NOT NULL | |
| payload | jsonb | NOT NULL, default '{}' | |
| approved_at | timestamptz | NOT NULL | |
| approved_by | text | NOT NULL, default 'rule_engine' | |

### reviews

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK | |
| user_id | uuid | FK users(id) CASCADE | |
| schema_version | integer | NOT NULL, default 1 | |
| status | text | NOT NULL, CHECK enum | draft/in_progress/completed/archived |
| type | text | NOT NULL, CHECK enum | daily/weekly/monthly/quarterly/annual |
| period_start | date | NOT NULL | |
| period_end | date | NOT NULL | |
| generated_by | text | NOT NULL, CHECK enum | ai/manual |
| sections | jsonb | NOT NULL, default '[]' | ReviewSection[] |
| metrics | jsonb | NOT NULL, default '{}' | ReviewMetrics |
| created_at | timestamptz | NOT NULL | |
| updated_at | timestamptz | NOT NULL | |
| completed_at | timestamptz | | |
| archived_at | timestamptz | | |

### context_snapshots

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK | |
| user_id | uuid | FK users(id) CASCADE | |
| generated_at | timestamptz | NOT NULL, default now() | |
| generated_by | text | NOT NULL, default 'state_machine' | |
| current_time | timestamptz | NOT NULL | |
| current_date | date | NOT NULL | |
| day_of_week | integer | NOT NULL, CHECK 0-6 | |
| time_of_day | text | NOT NULL, CHECK enum | morning/afternoon/evening/night |
| energy_state | jsonb | NOT NULL, default '{}' | EnergyState |
| active_objectives | jsonb | NOT NULL, default '[]' | ObjectiveSummary[] |
| active_key_results | jsonb | NOT NULL, default '[]' | KeyResultSummary[] |
| active_tasks | jsonb | NOT NULL, default '[]' | TaskSummary[] |
| pending_habits | jsonb | NOT NULL, default '[]' | HabitSummary[] |
| current_timebox | jsonb | | TimeboxSummary |
| upcoming_timeboxes | jsonb | NOT NULL, default '[]' | TimeboxSummary[] |
| pending_intentions | jsonb | NOT NULL, default '[]' | IntentionSummary[] |

### system_events

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK | |
| user_id | uuid | FK users(id) CASCADE | |
| schema_version | integer | NOT NULL, default 1 | |
| type | text | NOT NULL | SystemEventType |
| occurred_at | timestamptz | NOT NULL, default now() | |
| triggered_by | text | NOT NULL, CHECK enum | state_machine/time_trigger |
| snapshot_id | uuid | FK context_snapshots(id) SET NULL | |
| payload | jsonb | NOT NULL, default '{}' | |
| processed | boolean | NOT NULL, default false | |
| processed_at | timestamptz | | |

**Append-only**: Repository exposes only `insert`, never `update` or `delete`.

### action_surfaces

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK | |
| user_id | uuid | FK users(id) CASCADE | |
| snapshot_id | uuid | FK context_snapshots(id) CASCADE | |
| generated_at | timestamptz | NOT NULL, default now() | |
| guide | jsonb | NOT NULL, default '[]' | ActionCandidate[] |
| tiles | jsonb | NOT NULL, default '[]' | ActionCandidate[] |
| cues | jsonb | NOT NULL, default '[]' | ActionCandidate[] |

### derived_signals

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | uuid | PK | |
| user_id | uuid | FK users(id) CASCADE, UNIQUE | One row per user |
| energy_pattern | jsonb | | {peakHours, lowHours, confidence} or null |
| active_task_count | integer | NOT NULL, default 0 | |
| avg_completion_rate_7d | real | NOT NULL, default 0 | |
| avg_completion_rate_30d | real | NOT NULL, default 0 | |
| habit_streaks | jsonb | NOT NULL, default '{}' | Record<USOM_ID, number> |
| habit_completion_rates | jsonb | NOT NULL, default '{}' | Record<USOM_ID, number> |
| timebox_adherence_7d | real | NOT NULL, default 0 | |
| is_overcommitted | boolean | NOT NULL, default false | |
| computed_at | timestamptz | NOT NULL, default now() | |
| data_window_days | integer | NOT NULL, default 30 | |
| schema_version | integer | NOT NULL, default 1 | |

## USOM-DB Mapping Rules

| USOM Type | DB Storage | Mapping Logic |
|---|---|---|
| `Timestamp` (string) | `timestamptz` | Mapper: `new Date(iso)` on write, `.toISOString()` on read |
| `DateOnly` (string) | `date` | Mapper: string passthrough (YYYY-MM-DD) |
| `Objective.keyResultIds` (USOM_ID[]) | Not stored in table | Mapper: query `key_results.objective_id`, aggregate into array |
| `Timebox.taskIds` (USOM_ID[]) | `timebox_tasks` junction | Mapper: query junction, aggregate into array |
| `Timebox.habitIds` (USOM_ID[]) | `timebox_habits` junction | Mapper: query junction, aggregate into array |
| `Habit.frequency` (HabitFrequency) | `frequency_type` + `days_of_week` columns | Mapper: destructure on write, reassemble on read |
| `Task.tags` (Tag[]) | `jsonb` | Mapper: JSON.parse/stringify |
| `Review.sections` (ReviewSection[]) | `jsonb` | Mapper: JSON.parse/stringify |
| `Review.metrics` (ReviewMetrics) | `jsonb` | Mapper: JSON.parse/stringify |
| `UserCalibration.baselineCurve` (EnergyCurvePoint[]) | `jsonb` | Mapper: JSON.parse/stringify |
| `KeyResult.progressRate` (number) | `numeric` column | Mapper: Number() conversion |
| `user_id` | FK column on all tables | Mapper: inject on write, omit from USOM object; present in snapshots |
