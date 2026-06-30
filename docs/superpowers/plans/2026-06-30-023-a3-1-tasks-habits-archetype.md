# [023] A3.1 Implementation Plan — Tasks/Habits 接入 Activity Archetype + 删 energyProfile（DB 迁移 + 字段 + 类型清理）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 给 tasks/habits 加 `activityArchetypeId`（nullable FK→activity_archetypes），把 tasks 旧 `energyProfile` 5 值 enum 按 D4 映射 backfill 到 archetypeId，再删 energyProfile 列/类型/引用全清——完成 D11 B→C 破坏性迁移的数据层与类型层（无 UI，UI 接入留 A3.2）。

**Architecture:** 分两次迁移（D5）：M1 加列 + backfill（保留 energyProfile 以便核对），M2 验证命中率后删 energyProfile 列。代码层先加 activityArchetypeId 全链路（USOM/mapper/interface/repository，TDD），再同步删 energyProfile 全链路 + DB 列（schema 与迁移同 commit，避免运行时写已删列）。复用 A2 timebox 已落地的 archetype 外键范式（schema.ts:396 + mappers.ts:414/445）。

**Tech Stack:** Next.js 16 / React 19 / TypeScript 5 / Drizzle ORM 0.45.1 / vitest / 手写 SQL 迁移 + psql + 登记 `meta/_journal.json`

## Global Constraints

- **分支**：`feat/023-a3-archetype-integration`（已建，HEAD = design doc commit `9546e7f`）。
- **design doc SSOT**：`docs/superpowers/specs/2026-06-30-023-a3-archetype-integration-design.md`（决策 D1-D9）。
- **vitest 必须在 `frontend/` cwd 跑**（`@/` 映射，repo root 跑会假失败）；tsc 双验证（vitest 不做类型检查）。
- **Change Gate**：base/head 失败集合对比，别用硬编码失败数（记忆 [feedback_change-gate-baseline]）。
- **注释全简体中文**；每个新建/修改 TS 文件须有 `/** @file ... @brief ... */` 文件头（新建迁移 SQL 用 `-- [023] A3.1 ...` 头注释）。
- **drizzle 迁移手写**（`npm run db:generate/migrate` 跑不通，记忆 [project-drizzle-migrations-handwritten]）：SQL 手写 + `psql` + 登记 `frontend/src/lib/db/migrations/meta/_journal.json`。当前 journal 最大 idx=25（`0024_timebox_templates`），A3.1 用 idx 26（`0025`）+ idx 27（`0026`）。DB = `lifeware_dev@localhost:5432`。
- **范式参考**：A2 timebox 外键迁移 `migrations/0023_timebox_activity_archetype_fk.sql` + mapper 双向 `mappers.ts:400-449` + 测试 `mappers.test.ts:56-109`。
- **D2**：habits 从未有 energyProfile，本 plan 仅给 habits 加 activityArchetypeId，无删除。
- **D9/OQ-6**：不接 applyEvent 扣减；activityArchetypeId 存为对象自身字段，走正常 mutation。

## A3.1 File Structure

| 文件 | 动作 | 职责 |
|------|------|------|
| `frontend/src/lib/db/migrations/0025_a3_m1_tasks_habits_archetype_id.sql` | 新建 | M1：tasks+habits 加 `activity_archetype_id` FK + D4 backfill + 2 个 idx |
| `frontend/src/lib/db/migrations/0026_a3_m2_drop_tasks_energy_profile.sql` | 新建 | M2：DROP `idx_tasks_user_energy` + DROP `tasks.energy_profile` |
| `frontend/src/lib/db/migrations/meta/_journal.json` | 修改 | 登记 idx 26（0025）+ idx 27（0026） |
| `frontend/src/lib/db/schema.ts:200-263` | 修改 | tasks 加 `activityArchetypeId` 列；A3.1.3 删 `energyProfile` + `idx_tasks_user_energy` |
| `frontend/src/lib/db/schema.ts:266-300` | 修改 | habits 加 `activityArchetypeId` 列 |
| `frontend/src/lib/db/repositories/mappers.ts:61-76` | 修改 | TaskRow 加 `activityArchetypeId`；A3.1.3 删 `energyProfile`(:73) + import(:9) |
| `frontend/src/lib/db/repositories/mappers.ts:78-147` | 修改 | taskRowToUSOM/taskUSOMToRow 加 `activityArchetypeId`；A3.1.3 删 energyProfile(:106/:141) |
| `frontend/src/lib/db/repositories/mappers.ts:150-220` | 修改 | HabitRow + habitRowToUSOM/habitUSOMToRow 加 `activityArchetypeId` |
| `frontend/src/lib/db/repositories/__tests__/mappers.test.ts` | 修改 | 加 task/habit activityArchetypeId 双向测试（A3.1.2）；A3.1.3 删 energyProfile fixture |
| `frontend/src/usom/types/objects.ts:343-374` | 修改 | Task 加 `activityArchetypeId?`；A3.1.3 删 `energyProfile?`(:358) + import(:15) + @property(:327) |
| `frontend/src/usom/types/objects.ts:450-473` | 修改 | Habit 加 `activityArchetypeId?` |
| `frontend/src/usom/types/primitives.ts:320-328` | 修改 | A3.1.3 删 `type EnergyProfile`(:328) + 其上注释块(:320-327) |
| `frontend/src/usom/interfaces/irepository.ts:85-148` | 修改 | CreateTaskInput 加 `activityArchetypeId?`；A3.1.3 删 energyProfile(:97/:131) + import(:10) |
| `frontend/src/usom/interfaces/irepository.ts:516-546` | 修改 | CreateHabitInput 加 `activityArchetypeId?` |
| `frontend/src/domains/tasks/repository/task.ts:255-329` | 修改 | create/update 加 `activityArchetypeId`；A3.1.3 删 energyProfile(:283/:319) |
| `frontend/src/domains/habits/repository/habit.ts:55-115` | 修改 | create/update 加 `activityArchetypeId` |
| `frontend/src/domains/tasks/components/task-edit-zone.tsx` | 修改 | A3.1.3 删 ENERGY_ICONS(:39-45) + EnergyIcon(:277) + JSX(:283) + 5 icon import(:12) |
| `frontend/src/domains/tasks/__tests__/task.repository.test.ts` | 修改 | A3.1.3 删 energyProfile fixture（若有） |
| `docs/usom-design.md` | 修改 | §IX archetype 接入 tasks/habits |
| `docs/database-design.md` | 修改 | tasks/habits 加列 + 删 energy_profile |
| `manifest.md` | 修改 | 版本历史登记 |

---

## Task A3.1.1: M1 迁移 — tasks + habits 加 activity_archetype_id + D4 backfill

**Files:**
- Create: `frontend/src/lib/db/migrations/0025_a3_m1_tasks_habits_archetype_id.sql`
- Modify: `frontend/src/lib/db/schema.ts:200-263`（tasks 加列）+ `frontend/src/lib/db/schema.ts:266-300`（habits 加列）
- Modify: `frontend/src/lib/db/migrations/meta/_journal.json`（追加 idx 26）

**Interfaces:**
- Consumes: `activityArchetypes` 表（`schema.ts:710`，A1 落地）；D4 映射表（design doc §3 D4）
- Produces: DB 列 `tasks.activity_archetype_id` + `habits.activity_archetype_id`（nullable FK ON DELETE SET NULL）；schema.ts 对应 drizzle 列定义（供 A3.1.2 mapper 引用）

- [ ] **Step 1: 写 M1 迁移 SQL**

新建 `frontend/src/lib/db/migrations/0025_a3_m1_tasks_habits_archetype_id.sql`:

```sql
-- [023] A3.1 M1: tasks + habits 加 activity_archetype_id 外键（nullable，ON DELETE SET NULL）
-- 关联 A1 的 activity_archetypes 表。对齐 timeboxes:396 外键范式（0023 迁移）。
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS activity_archetype_id uuid
  REFERENCES activity_archetypes(id) ON DELETE SET NULL;
ALTER TABLE habits ADD COLUMN IF NOT EXISTS activity_archetype_id uuid
  REFERENCES activity_archetypes(id) ON DELETE SET NULL;

-- D4 backfill：tasks.energy_profile enum → activity_archetype_id
-- archetype 是 per-user 且无 slug/id 常量，必须按 (user_id, l1='工作', l2_name) 子查询匹配。
-- 映射（design D4，修正父 plan light→响应式 为 light→日常事务）：
--   deep→深度专注 / creative→方案设计 / admin→日常事务 / light→日常事务 / reactive→响应式工作
UPDATE tasks t SET activity_archetype_id = (
  SELECT a.id FROM activity_archetypes a
  WHERE a.user_id = t.user_id
    AND a.l1_category = '工作'
    AND a.l2_name = CASE t.energy_profile
      WHEN 'deep'     THEN '深度专注'
      WHEN 'creative' THEN '方案设计'
      WHEN 'admin'    THEN '日常事务'
      WHEN 'light'    THEN '日常事务'
      WHEN 'reactive' THEN '响应式工作'
    END
) WHERE t.energy_profile IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_tasks_user_archetype  ON tasks(user_id, activity_archetype_id);
CREATE INDEX IF NOT EXISTS idx_habits_user_archetype ON habits(user_id, activity_archetype_id);
```

- [ ] **Step 2: schema.ts tasks 加 activityArchetypeId 列定义**

在 `frontend/src/lib/db/schema.ts` 第 244 行（`tracking` 列）之后、第 246 行（`// AI 辅助扩展数据` 注释）之前插入：

```typescript
  tracking: text('tracking', { enum: ['none', 'check_in', 'log', 'review'] }).notNull().default('check_in'),

  // [023] A3: 关联 Activity Archetype（nullable，ON DELETE SET NULL，对齐 timeboxes:396）
  activityArchetypeId: uuid('activity_archetype_id').references(() => activityArchetypes.id, { onDelete: 'set null' }),

  // AI 辅助扩展数据
```

- [ ] **Step 3: schema.ts habits 加 activityArchetypeId 列定义**

在 `frontend/src/lib/db/schema.ts` 第 290 行（`tags` 列）之后、第 292 行（`notes` 列）之前插入：

```typescript
  tags: jsonb('tags').notNull().$type<string[]>().default([]),

  // [023] A3: 关联 Activity Archetype（nullable，ON DELETE SET NULL）
  activityArchetypeId: uuid('activity_archetype_id').references(() => activityArchetypes.id, { onDelete: 'set null' }),

  notes: text('notes'),
```

- [ ] **Step 4: 登记 journal idx 26**

在 `frontend/src/lib/db/migrations/meta/_journal.json` 的 `entries` 数组末尾（idx 25 `0024_timebox_templates` 之后）追加：

```json
    ,
    {
      "idx": 26,
      "version": "7",
      "when": 1782900000000,
      "tag": "0025_a3_m1_tasks_habits_archetype_id",
      "breakpoints": false
    }
```

- [ ] **Step 5: 跑 M1 迁移（dev 库）**

Run:
```bash
cd frontend && set -a && source .env.local && set +a && psql "$DATABASE_URL" -f src/lib/db/migrations/0025_a3_m1_tasks_habits_archetype_id.sql
```
Expected: `ALTER TABLE` ×2 + `UPDATE` ×1 + `CREATE INDEX` ×2 全部 `CREATE`/`UPDATE N`（无 error）。

> 若 `activity_archetypes` 表为空（A1 seed 未跑），backfill 的 `UPDATE` 命中 0 行（可接受，archetype optional）。先跑 `npm run seed` 或 A1 seedDefaults 再 backfill 可提高命中率。

- [ ] **Step 6: 观测 backfill 命中率**

Run:
```bash
cd frontend && set -a && source .env.local && set +a && psql "$DATABASE_URL" -c "
SELECT
  (SELECT count(*) FROM tasks WHERE energy_profile IS NOT NULL) AS has_profile,
  (SELECT count(*) FROM tasks WHERE energy_profile IS NOT NULL AND activity_archetype_id IS NOT NULL) AS backfilled,
  (SELECT count(*) FROM tasks WHERE energy_profile IS NOT NULL AND activity_archetype_id IS NULL) AS missed;"
```
Expected: `missed` 应为 0（或仅当该用户缺 archetype seed 时 >0，记录数值写入 commit message）。

- [ ] **Step 7: tsc 验证（schema 加列不破坏类型）**

Run: `cd frontend && npx tsc --noEmit 2>&1 | tail -5`
Expected: 零新增错误（加列是纯增量，不改既有字段类型）。

- [ ] **Step 8: commit**

```bash
cd frontend
git add src/lib/db/migrations/0025_a3_m1_tasks_habits_archetype_id.sql \
        src/lib/db/migrations/meta/_journal.json \
        src/lib/db/schema.ts
git commit -m "feat(db): [023] A3.1.1 M1 迁移 — tasks/habits 加 activity_archetype_id + D4 backfill

tasks + habits 加 activity_archetype_id（nullable FK→activity_archetypes，
ON DELETE SET NULL，对齐 timeboxes:396）。tasks.energy_profile 5 值 enum
按 D4 映射 backfill（deep→深度专注/creative→方案设计/admin→日常事务/
light→日常事务/reactive→响应式工作），按 (user_id, l1, l2_name) 子查询。
schema.ts 同步加列定义。M2 删 energy_profile 留 A3.1.3。

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task A3.1.2: USOM + mapper + interface + repository 加 activityArchetypeId（tasks+habits，TDD）

**Files:**
- Test: `frontend/src/lib/db/repositories/__tests__/mappers.test.ts`（加 task/habit 双向测试）
- Modify: `frontend/src/usom/types/objects.ts`（Task:358 + Habit:472）
- Modify: `frontend/src/lib/db/repositories/mappers.ts`（TaskRow:73 + taskRowToUSOM:106 + taskUSOMToRow:141 + HabitRow:160 + habitRowToUSOM:191 + habitUSOMToRow:216）
- Modify: `frontend/src/usom/interfaces/irepository.ts`（CreateTaskInput:131 + CreateHabitInput:542）
- Modify: `frontend/src/domains/tasks/repository/task.ts`（create:283 + update:319）
- Modify: `frontend/src/domains/habits/repository/habit.ts`（create:78 + update:109）

**Interfaces:**
- Consumes: schema.ts 新列 `activityArchetypeId`（Task A3.1.1）；`USOM_ID` 类型
- Produces: `Task.activityArchetypeId?: USOM_ID` / `Habit.activityArchetypeId?: USOM_ID` + mapper 双向 + CreateTaskInput/CreateHabitInput 字段 + repository create/update 读写

- [ ] **Step 1: 写失败测试（task + habit activityArchetypeId 双向，仿 A2 范式 mappers.test.ts:56-109）**

在 `frontend/src/lib/db/repositories/__tests__/mappers.test.ts` 末尾追加（import 行第 9 行追加 `taskRowToUSOM, taskUSOMToRow, habitRowToUSOM, habitUSOMToRow`）：

```typescript
// ── [023] A3.1.2: Task / Habit activityArchetypeId 双向映射 ──

import { taskRowToUSOM, taskUSOMToRow, habitRowToUSOM, habitUSOMToRow } from '../mappers'

describe('task mapper — activityArchetypeId ([023] A3.1)', () => {
  const baseTaskRow = {
    id: 'task-1', userId: 'u-1', schemaVersion: 1,
    parentId: null, threadId: null,
    status: 'todo', title: '写文档', description: null,
    priority: 'medium', energyRequired: 'medium',
    estimatedDuration: null, actualDuration: null,
    dueDate: null, startDate: null, endDate: null,
    recurrence: null, tags: [], notes: null,
    createdAt: new Date('2026-06-30T00:00:00Z'), updatedAt: new Date('2026-06-30T00:00:00Z'),
    completedAt: null, archivedAt: null,
    clarity: 'fuzzy', complexity: [], decomposition: null,
    captureMode: 'ad_hoc', energyProfile: null,
    schedulingConstraint: null, tracking: 'check_in',
    aiTags: {},
    activityArchetypeId: null,
  }

  it('row 有 archetypeId → USOM 带上', () => {
    const t = taskRowToUSOM({ ...baseTaskRow, activityArchetypeId: 'arch-1' } as any)
    expect(t.activityArchetypeId).toBe('arch-1')
  })

  it('row archetypeId 为 null → USOM undefined', () => {
    const t = taskRowToUSOM({ ...baseTaskRow, activityArchetypeId: null } as any)
    expect(t.activityArchetypeId).toBeUndefined()
  })

  it('USOM → row：undefined → null', () => {
    const usom = {
      id: 'task-1', status: 'todo', title: 'x', priority: 'medium',
      energyRequired: 'medium', clarity: 'fuzzy', complexity: [],
      captureMode: 'ad_hoc', tracking: 'check_in', aiTags: {}, tags: [],
      createdAt: 'x' as any, updatedAt: 'x' as any,
    } as any
    const row = taskUSOMToRow(usom, 'u-1')
    expect(row.activityArchetypeId).toBeNull()
  })
})

describe('habit mapper — activityArchetypeId ([023] A3.1)', () => {
  const baseHabitRow = {
    id: 'habit-1', userId: 'u-1', schemaVersion: 1,
    status: 'active', title: '冥想', description: null,
    frequencyType: 'daily', defaultTime: '07:00',
    earliestTime: '06:00', latestStartTime: '08:00',
    defaultDuration: 15, minDuration: 5, trackable: true,
    streak: 0, longestStreak: 0, completionRate7d: 0,
    startDate: '2026-06-30', endDate: null,
    daysOfWeek: null, tags: [], notes: null,
    createdAt: new Date('2026-06-30T00:00:00Z'), updatedAt: new Date('2026-06-30T00:00:00Z'),
    suspendedAt: null, archivedAt: null,
    activityArchetypeId: null,
  }

  it('row 有 archetypeId → USOM 带上', () => {
    const h = habitRowToUSOM({ ...baseHabitRow, activityArchetypeId: 'arch-2' } as any)
    expect(h.activityArchetypeId).toBe('arch-2')
  })

  it('row archetypeId 为 null → USOM undefined', () => {
    const h = habitRowToUSOM({ ...baseHabitRow, activityArchetypeId: null } as any)
    expect(h.activityArchetypeId).toBeUndefined()
  })

  it('USOM → row：undefined → null', () => {
    const usom = {
      id: 'habit-1', status: 'active', title: 'x',
      frequency: { type: 'daily' }, defaultTime: '07:00',
      earliestTime: '06:00', latestStartTime: '08:00',
      defaultDuration: 15, minDuration: 5, trackable: true,
      streak: 0, longestStreak: 0, completionRate7d: 0,
      startDate: '2026-06-30', tags: [],
      createdAt: 'x' as any, updatedAt: 'x' as any,
    } as any
    const row = habitUSOMToRow(usom, 'u-1')
    expect(row.activityArchetypeId).toBeNull()
  })
})
```

> 注：import 已在第 9 行（`import { keyResultRowToUSOM, ... timeboxUSOMToRow } from '../mappers'`）。本步把该行扩展为含 task/habit 4 个 mapper；同时上面新增的局部 `import { taskRowToUSOM, ... } from '../mappers'` 是冗余的——**实际操作：删除新增的局部 import 行，改为把 4 个 mapper 追加到第 9 行的现有 import**。最终第 9 行应为：`import { keyResultRowToUSOM, keyResultUSOMToRow, timeboxRowToUSOM, timeboxUSOMToRow, taskRowToUSOM, taskUSOMToRow, habitRowToUSOM, habitUSOMToRow } from '../mappers'`

- [ ] **Step 2: 跑测试确认失败**

Run: `cd frontend && npx vitest run src/lib/db/repositories/__tests__/mappers.test.ts`
Expected: FAIL — `taskRowToUSOM({...activityArchetypeId:'arch-1'})` 返回的 `t.activityArchetypeId` 为 undefined（mapper 尚未映射该字段）。

- [ ] **Step 3: objects.ts Task + Habit 加 activityArchetypeId**

3a. `frontend/src/usom/types/objects.ts` 第 358 行（`energyProfile?: EnergyProfile`）后追加一行：

```typescript
  energyProfile?: EnergyProfile
  /** [023] A3: 关联 Activity Archetype（nullable，对齐 timebox.activityArchetypeId） */
  activityArchetypeId?: USOM_ID
```

3b. 第 472 行（Habit 的 `notes?: Notes`）前追加（即在 `archivedAt?: Timestamp` 之后）：

```typescript
  archivedAt?: Timestamp
  /** [023] A3: 关联 Activity Archetype（nullable） */
  activityArchetypeId?: USOM_ID
  notes?: Notes
```

- [ ] **Step 4: mappers.ts TaskRow + taskRowToUSOM + taskUSOMToRow 加 activityArchetypeId**

4a. 第 73 行（`captureMode: string; energyProfile: string | null;`）改为：

```typescript
  captureMode: string; energyProfile: string | null;
  activityArchetypeId: string | null;
```

4b. 第 106 行（`energyProfile: (row.energyProfile as EnergyProfile) ?? undefined,`）后追加：

```typescript
    energyProfile: (row.energyProfile as EnergyProfile) ?? undefined,
    activityArchetypeId: row.activityArchetypeId ?? undefined,
```

4c. 第 141 行（`energyProfile: task.energyProfile ?? null,`）后追加：

```typescript
    energyProfile: task.energyProfile ?? null,
    activityArchetypeId: task.activityArchetypeId ?? null,
```

- [ ] **Step 5: mappers.ts HabitRow + habitRowToUSOM + habitUSOMToRow 加 activityArchetypeId**

5a. 第 160 行（`notes: string | null;`）前追加（即在 `daysOfWeek: number[] | null; tags: string[];` 之后）：

```typescript
  daysOfWeek: number[] | null; tags: string[];
  activityArchetypeId: string | null;
  notes: string | null;
```

5b. 第 191 行（habitRowToUSOM 的 `notes: row.notes ?? undefined,`）前追加（即在 `archivedAt: toISO(row.archivedAt),` 之后）：

```typescript
    archivedAt: toISO(row.archivedAt),
    activityArchetypeId: row.activityArchetypeId ?? undefined,
    notes: row.notes ?? undefined,
```

5c. 第 216 行（habitUSOMToRow 的 `notes: habit.notes ?? null,`）前追加（即在 `tags: habit.tags,` 之后）：

```typescript
    tags: habit.tags,
    activityArchetypeId: habit.activityArchetypeId ?? null,
    notes: habit.notes ?? null,
```

- [ ] **Step 6: irepository.ts CreateTaskInput + CreateHabitInput 加 activityArchetypeId**

6a. 第 131 行（`energyProfile?: EnergyProfile`）后追加：

```typescript
  /** 能量画像 */
  energyProfile?: EnergyProfile
  /** [023] A3: 关联 Activity Archetype */
  activityArchetypeId?: USOM_ID
```

6b. 第 542 行（CreateHabitInput 的 `tags?: string[]`）后追加（即 interface 闭合 `}` 前）：

```typescript
  /** 标签列表 */
  tags?: string[]
  /** [023] A3: 关联 Activity Archetype */
  activityArchetypeId?: USOM_ID
}
```

> `UpdateTaskInput`(:151) 与 `UpdateHabitInput`(:546) 均为 `Partial<CreateXxxInput>`，自动获得新字段，无需改。

- [ ] **Step 7: tasks/repository/task.ts create + update 加 activityArchetypeId**

7a. 第 283 行（create 的 `energyProfile: data.energyProfile,`）后追加：

```typescript
      energyProfile: data.energyProfile,
      activityArchetypeId: data.activityArchetypeId,
```

7b. 第 319 行（update 的 `...(data.energyProfile !== undefined && { energyProfile: data.energyProfile }),`）后追加：

```typescript
      ...(data.energyProfile !== undefined && { energyProfile: data.energyProfile }),
      ...(data.activityArchetypeId !== undefined && { activityArchetypeId: data.activityArchetypeId }),
```

- [ ] **Step 8: habits/repository/habit.ts create + update 加 activityArchetypeId**

8a. 第 78 行（create 的 `tags: data.tags ?? [],`）后追加（即 `createdAt: now,` 之前）：

```typescript
      tags: data.tags ?? [],
      activityArchetypeId: data.activityArchetypeId,
```

8b. 第 109 行（update 的 `...(data.tags !== undefined && { tags: data.tags }),`）后追加（即 `updatedAt: ...` 之前）：

```typescript
      ...(data.tags !== undefined && { tags: data.tags }),
      ...(data.activityArchetypeId !== undefined && { activityArchetypeId: data.activityArchetypeId }),
```

- [ ] **Step 9: 跑测试确认通过**

Run: `cd frontend && npx vitest run src/lib/db/repositories/__tests__/mappers.test.ts`
Expected: PASS（原有 KeyResult + Timebox 测试 + 新增 6 个 task/habit archetypeId 测试全绿）。

- [ ] **Step 10: tsc 验证**

Run: `cd frontend && npx tsc --noEmit 2>&1 | tail -5`
Expected: 零新增错误。

- [ ] **Step 11: 跑 tasks + habits 既有测试零回归**

Run: `cd frontend && npx vitest run src/domains/tasks src/domains/habits 2>&1 | tail -15`
Expected: 全 PASS（base 失败集合对比，零新增）。

- [ ] **Step 12: commit**

```bash
cd frontend
git add src/lib/db/repositories/__tests__/mappers.test.ts \
        src/lib/db/repositories/mappers.ts \
        src/usom/types/objects.ts \
        src/usom/interfaces/irepository.ts \
        src/domains/tasks/repository/task.ts \
        src/domains/habits/repository/habit.ts
git commit -m "refactor(usom): [023] A3.1.2 tasks/habits 全链路加 activityArchetypeId

Task/Habit interface + TaskRow/HabitRow + mapper 双向 + CreateTaskInput/
CreateHabitInput + TaskRepository/HabitRepository create/update 全部加
activityArchetypeId（nullable USOM_ID，对齐 timebox A2 范式）。
mappers.test.ts 补 6 个 task/habit archetypeId 双向测试。energyProfile
暂保留（M2 删留 A3.1.3）。

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task A3.1.3: 删 energyProfile 全清 + M2 迁移（schema 与代码与 DB 同步）

**Files:**
- Modify: `frontend/src/lib/db/schema.ts:242,258`（删列 + 删 idx）
- Create: `frontend/src/lib/db/migrations/0026_a3_m2_drop_tasks_energy_profile.sql`
- Modify: `frontend/src/lib/db/migrations/meta/_journal.json`（追加 idx 27）
- Modify: `frontend/src/usom/types/primitives.ts:320-328`（删 type + 注释）
- Modify: `frontend/src/usom/types/objects.ts:15,327,358`（删 import + @property + 字段）
- Modify: `frontend/src/usom/interfaces/irepository.ts:10,97,131`（删 import + TaskFilters + CreateTaskInput）
- Modify: `frontend/src/lib/db/repositories/mappers.ts:9,73,106,141`（删 import + TaskRow + 双向）
- Modify: `frontend/src/domains/tasks/repository/task.ts:283,319`（删 create/update）
- Modify: `frontend/src/domains/tasks/components/task-edit-zone.tsx:12,39-45,277,283`（删 ENERGY_ICONS + 渲染 + import）
- Modify: `frontend/src/lib/db/repositories/__tests__/mappers.test.ts`（删 baseTaskRow.energyProfile）
- Modify: `frontend/src/domains/tasks/__tests__/task.repository.test.ts`（删 energyProfile fixture，若有）

**Interfaces:**
- Consumes: Task A3.1.1（DB 已有 activity_archetype_id + backfill 完成）+ Task A3.1.2（代码已加 activityArchetypeId）
- Produces: `energyProfile` / `EnergyProfile` / `idx_tasks_user_energy` 从代码与 DB 完全移除；tasks 表不再有 energy_profile 列

> **顺序约束**：Step 1-2（schema 删列 + M2 迁移）与 Step 3-9（代码删引用）必须在同一 task 内完成同一 commit——否则中间态代码仍写 `energy_profile` 列但 DB 已删，运行时 insert/update 会报 `column "energy_profile" does not exist`。tsc 不报（drizzle schema 与代码同步删），但运行时崩，故必须原子提交。

- [ ] **Step 1: schema.ts 删 tasks.energyProfile 列 + idx**

1a. 删 `frontend/src/lib/db/schema.ts` 第 242 行：

```typescript
  energyProfile: text('energy_profile', { enum: ['light', 'deep', 'admin', 'creative', 'reactive'] }),
```
（整行删除）

1b. 删第 258 行：

```typescript
  index('idx_tasks_user_energy').on(table.userId, table.energyProfile),
```
（整行删除）

- [ ] **Step 2: 写 M2 迁移 SQL + 登记 journal**

新建 `frontend/src/lib/db/migrations/0026_a3_m2_drop_tasks_energy_profile.sql`:

```sql
-- [023] A3.1 M2: 删 tasks.energy_profile（D11 B→C 迁移完成）
-- 语义已 backfill 至 activity_archetype_id（M1/0025），energy_profile 列退役。
-- 分两次迁移的第二次（D5）：M1 加+backfill 已验证命中率后，本迁移删列。
DROP INDEX IF EXISTS idx_tasks_user_energy;
ALTER TABLE tasks DROP COLUMN IF EXISTS energy_profile;
```

在 `meta/_journal.json` entries 末尾（idx 26 之后）追加：

```json
    ,
    {
      "idx": 27,
      "version": "7",
      "when": 1783000000000,
      "tag": "0026_a3_m2_drop_tasks_energy_profile",
      "breakpoints": false
    }
```

- [ ] **Step 3: primitives.ts 删 EnergyProfile type + 注释**

删 `frontend/src/usom/types/primitives.ts` 第 320-328 行（整个 EnergyProfile 注释块 + type）：

```typescript
/**
 * 能量画像
 * - light: 轻量任务，低认知负荷
 * - deep: 深度任务，需要专注
 * - admin: 行政事务
 * - creative: 创造性工作
 * - reactive: 响应式工作
 */
export type EnergyProfile = 'light' | 'deep' | 'admin' | 'creative' | 'reactive'
```
（整块删除）

- [ ] **Step 4: objects.ts 删 Task.energyProfile + import + @property**

4a. 第 15 行（import 行）删 `EnergyProfile,`：

把
```typescript
  EnergyProfile, SchedulingConstraint, TrackingMode,
```
改为
```typescript
  SchedulingConstraint, TrackingMode,
```

4b. 第 327 行删 `* @property energyProfile - 能量画像`（整行）。

4c. 第 358 行删 `energyProfile?: EnergyProfile`（整行；A3.1.2 在其后加的 `activityArchetypeId?: USOM_ID` 保留）。

- [ ] **Step 5: irepository.ts 删 import + TaskFilters + CreateTaskInput 的 energyProfile**

5a. 第 10 行（import 行）删 `EnergyProfile,`。

5b. 第 96-97 行删 TaskFilters 的 energyProfile：

```typescript
  /** 能量画像 */
  energyProfile?: EnergyProfile
```
（两行整删）

5c. 第 130-131 行删 CreateTaskInput 的 energyProfile：

```typescript
  /** 能量画像 */
  energyProfile?: EnergyProfile
```
（两行整删；A3.1.2 在其后加的 `activityArchetypeId?: USOM_ID` 保留）

- [ ] **Step 6: mappers.ts 删 import + TaskRow + 双向 energyProfile**

6a. 第 9 行（import 行）删 `EnergyProfile,`。

6b. 第 73 行 TaskRow 删 `energyProfile: string | null;`（A3.1.2 加的 `activityArchetypeId: string | null;` 保留）。

6c. 第 106 行 taskRowToUSOM 删 `energyProfile: (row.energyProfile as EnergyProfile) ?? undefined,`（A3.1.2 加的 activityArchetypeId 行保留）。

6d. 第 141 行 taskUSOMToRow 删 `energyProfile: task.energyProfile ?? null,`（activityArchetypeId 行保留）。

- [ ] **Step 7: tasks/repository/task.ts 删 create + update 的 energyProfile**

7a. 第 283 行删 `energyProfile: data.energyProfile,`（activityArchetypeId 行保留）。

7b. 第 319 行删 `...(data.energyProfile !== undefined && { energyProfile: data.energyProfile }),`（activityArchetypeId 行保留）。

- [ ] **Step 8: task-edit-zone.tsx 删 ENERGY_ICONS + 渲染 + import**

8a. 第 12 行 import 删 5 个 icon（保留 Pencil/Check/X）：

把
```typescript
import { Brain, Cloud, ClipboardList, Sparkles, Flame, Pencil, Check, X } from 'lucide-react'
```
改为
```typescript
import { Pencil, Check, X } from 'lucide-react'
```

8b. 第 38-45 行删 ENERGY_ICONS 常量（含其上注释 `/** 能量画像 → 图标映射 */`）：

```typescript
/** 能量画像 → 图标映射 */
const ENERGY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  deep: Brain,
  light: Cloud,
  admin: ClipboardList,
  creative: Sparkles,
  reactive: Flame,
}
```
（整块删除）

8c. 第 277 行删 EnergyIcon 计算：

```typescript
  const EnergyIcon = task.energyProfile ? ENERGY_ICONS[task.energyProfile] : null
```
（整行删除）

8d. 第 283 行删 JSX 渲染：

```typescript
        {EnergyIcon && <EnergyIcon className="size-5 mt-1 text-muted-soft shrink-0" />}
```
（整行删除。若该行所在 flex 容器因此留空隙，可接受——A3.2 会在详情/表单接 ArchetypePicker 填充）

> 若 `React` 命名空间在删 ENERGY_ICONS 后不再被本文件使用（`React.ComponentType` 是唯一引用），检查文件顶 `useState, useCallback` 等 React import 是否还需 `React`。当前第 11 行 `import { useState, useCallback } from 'react'` 未引 `React` 默认/命名空间，ENERGY_ICONS 的 `React.ComponentType` 是唯一 `React.` 引用——删除后无需补 import（`React` 未被引）。

- [ ] **Step 9: 清测试里的 energyProfile fixture**

9a. `mappers.test.ts` 的 `baseTaskRow`（A3.1.2 Step 1 新增）删 `energyProfile: null,` 一行（activityArchetypeId 保留）。

9b. Run: `cd frontend && grep -rn "energyProfile\|EnergyProfile" src/domains/tasks/__tests__ src/domains/habits/__tests__ src/lib/db/repositories/__tests__`
若有命中（如 `task.repository.test.ts` 的 fixture），逐个删除该字段。预期：删除后无 energyProfile 测试引用。

- [ ] **Step 10: grep 零残留（非测试 + 测试全覆盖）**

Run: `cd frontend && grep -rn "energyProfile\|EnergyProfile\|energy_profile\|ENERGY_ICONS\|EnergyIcon" src --include="*.ts" --include="*.tsx"`
Expected: **零命中**。若命中，逐一清除。

- [ ] **Step 11: 跑 M2 迁移（dev 库）**

Run:
```bash
cd frontend && set -a && source .env.local && set +a && psql "$DATABASE_URL" -f src/lib/db/migrations/0026_a3_m2_drop_tasks_energy_profile.sql
```
Expected: `DROP INDEX` + `ALTER TABLE`（无 error）。

- [ ] **Step 12: tsc 全量验证**

Run: `cd frontend && npx tsc --noEmit 2>&1 | tail -5`
Expected: 零错误（所有 EnergyProfile 引用已清，activityArchetypeId 全链路就位）。

- [ ] **Step 13: 全量 vitest 基线**

Run: `cd frontend && npx vitest run 2>&1 | tail -15`
Expected: 全 PASS（base/head 失败集合对比，零新增）。

- [ ] **Step 14: commit**

```bash
cd frontend
git add src/lib/db/schema.ts \
        src/lib/db/migrations/0026_a3_m2_drop_tasks_energy_profile.sql \
        src/lib/db/migrations/meta/_journal.json \
        src/usom/types/primitives.ts \
        src/usom/types/objects.ts \
        src/usom/interfaces/irepository.ts \
        src/lib/db/repositories/mappers.ts \
        src/lib/db/repositories/__tests__/mappers.test.ts \
        src/domains/tasks/repository/task.ts \
        src/domains/tasks/components/task-edit-zone.tsx \
        src/domains/tasks/__tests__/task.repository.test.ts
git commit -m "refactor(tasks): [023] A3.1.3 删 energyProfile 全清 + M2 迁移

D11 B→C 破坏性迁移收尾：删 type EnergyProfile / Task.energyProfile /
CreateTaskInput+TaskFilters.energyProfile / mapper 双向 / TaskRepository
create+update / task-edit-zone ENERGY_ICONS+渲染+5 icon import。
schema.ts 删 tasks.energy_profile 列 + idx_tasks_user_energy。
M2 迁移 DROP INDEX + DROP COLUMN（与代码同 commit，避免运行时写已删列）。
grep 零残留。语义已由 activity_archetype_id 承接（A3.1.1 backfill）。

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task A3.1.4: §IX 文档同步 + 全量基线（A3.1 收尾）

**Files:**
- Modify: `docs/usom-design.md`（§IX archetype 接入 tasks/habits）
- Modify: `docs/database-design.md`（tasks/habits 加列 + 删 energy_profile + 删 idx）
- Modify: `manifest.md`（版本历史）

**Interfaces:** 无新代码接口；本任务为文档同步 + 收尾验证。

- [ ] **Step 1: docs/database-design.md 同步**

在 tasks 表定义处：删 `energy_profile` 列 + `idx_tasks_user_energy` 索引；加 `activity_archetype_id uuid NULL REFERENCES activity_archetypes(id) ON DELETE SET NULL` + `idx_tasks_user_archetype`。
在 habits 表定义处：加 `activity_archetype_id uuid NULL REFERENCES activity_archetypes(id) ON DELETE SET NULL` + `idx_habits_user_archetype`。
登记迁移 0025（M1）+ 0026（M2）。

- [ ] **Step 2: docs/usom-design.md §IX 同步**

§IX 数据层章节补：Task/Habit 接入 `activityArchetypeId?: USOM_ID`（D3 ContentField，optional，不进 onValidate），取代旧 `energyProfile`（D11 B→C 迁移，D4 映射表）。引用 design doc §3 D2-D4。

- [ ] **Step 3: manifest.md 版本历史登记**

在版本历史追加 A3.1 条目：含 design doc + 本 plan 路径 + 0025/0026 迁移 + 「tasks/habits 接入 archetype + 删 energyProfile」摘要。

- [ ] **Step 4: 全量基线（Change Gate）**

Run: `cd frontend && npx vitest run 2>&1 | tail -15`
Expected: 全 PASS（base/head 失败集合对比，零新增）。

Run: `cd frontend && npx tsc --noEmit 2>&1 | tail -5`
Expected: 零错误。

- [ ] **Step 5: A3.1 完成验收核对（design doc §8 验收 #1/#2/#7）**

- [ ] `tasks/habits.activity_archetype_id` 外键就位；5 种 energyProfile 全部按 D4 backfill（A3.1.1 Step 6 命中率已记录）
- [ ] `grep -rn "energyProfile\|EnergyProfile" src` 零残留（A3.1.3 Step 10）
- [ ] EnergyState 未被扣减（D9，A3.1 未触 applyEvent，符合预期）

- [ ] **Step 6: commit**

```bash
git add docs/usom-design.md docs/database-design.md manifest.md
git commit -m "docs: [023] A3.1 §IX 文档同步 — tasks/habits archetype 接入 + 删 energyProfile

docs/database-design.md：tasks 删 energy_profile+idx、加 activity_archetype_id
FK；habits 加 activity_archetype_id FK；登记迁移 0025(M1)/0026(M2)。
docs/usom-design.md §IX：Task/Habit activityArchetypeId（D3 ContentField）
取代 energyProfile（D11 B→C，D4 映射）。manifest.md 版本历史登记。

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Self-Review（writing-plans 内置检查）

**1. Spec coverage**（design doc §6 A3.1 File Structure + §8 验收逐条 → task）:
- M1 迁移加 tasks/habits.activityArchetypeId + backfill → A3.1.1 ✓
- schema/mapper/USOM/irepository 双向加 activityArchetypeId → A3.1.2 ✓
- M2 删 energyProfile 列+索引 → A3.1.3 Step 1-2/11 ✓
- 删 EnergyProfile type/mapper/UI ENERGY_ICONS/TaskFilters → A3.1.3 Step 3-9 ✓
- 登记 journal → A3.1.1 Step 4 + A3.1.3 Step 2 ✓
- §IX 文档同步 → A3.1.4 ✓
- vitest/tsc 零新增 → 每个 task 末尾 + A3.1.4 Step 4 ✓
- 验收 #1(backfill)/#2(零残留)/#7(不扣减) → A3.1.4 Step 5 ✓

**2. Placeholder scan**: 无 TBD/TODO/"similar to Task N"。每步含实际 SQL/TS 代码 + 精确行号 + grep 命令。✓

**3. Type consistency**:
- `activityArchetypeId?: USOM_ID`（objects.ts A3.1.2 定义）→ mapper/interface/repository 引用一致 ✓
- `activityArchetypeId: string | null`（TaskRow/HabitRow）↔ `row.activityArchetypeId ?? undefined`（row→USOM）↔ `task.activityArchetypeId ?? null`（USOM→row），与 timebox 范式（mappers.ts:414/445）一致 ✓
- CreateTaskInput/CreateHabitInput `activityArchetypeId?: USOM_ID` → UpdateXxxInput（Partial）自动获得 ✓
- D4 映射表（design §3）= A3.1.1 Step 1 backfill CASE = A3.1.1 commit message，三处一致 ✓

**4. 已知风险/开放点**（实现期关注）:
- A3.1.3 顺序约束：schema 删列 + 代码删引用 + M2 迁移必须同 commit（Step 1-11 同 task），否则运行时写已删列崩 ✓（已在 task 开头注明）
- A3.1.1 backfill 命中率依赖 activity_archetypes 已 seedDefaults（A1）；若 dev/prod 库 archetype 表空，先跑 seed（Step 5 注明）
- A3.1.3 Step 8d 删 EnergyIcon JSX 后布局空隙由 A3.2 ArchetypePicker 填充（design §6 注明中间态可接受）
- A3.1.2 Step 1 import 整合（避免重复 import 行）已在 step 内注明操作
- habits/repository 是否还有其他写 energyProfile 的入口：grep（A3.1.3 Step 10）兜底，D2 已确认 habits 从未有 energyProfile

**5. Change Gate 基线**：每个 task 末尾 vitest/tsc 用 base/head 失败集合对比，不用硬编码失败数（记忆 [feedback_change-gate-baseline]）。✓

---

## Review 修订清单（plan-eng-review + outside voice）

本 plan 经 plan-eng-review（4 section + Claude subagent outside voice，codex 超时 fallback）评审，产生以下修订 overlay。**实现时以本清单为准**（覆盖前文对应 step 的原始描述）。

### NOT in scope（review 确认）
- UI 接入（ArchetypePicker 表单 + 详情只读）→ A3.2
- lifecycle-configs require 债（N-5）→ 保持 defer neat
- applyEvent 能量扣减（D9/OQ-6）→ 不接
- habitsTemplates 硬删 → A3.3

### What already exists（复用，不重建）
- A1 activity_archetypes 表 + Repository + seed（backfill 目标 + archetype 本体）
- A2 timebox archetype 接入范式（schema FK:396 + mapper 双向:400-449 + ArchetypePicker）→ tasks/habits 照抄
- [025] mutation 范式 + drizzle 手写迁移约定

### R1 — Finding 1：prod 迁移验证 step（prior learning [drizzle-migrate-state-desync-fix]）
**覆盖**：A3.1.1 Step 5 后 + A3.1.3 Step 11 后
**改动**：各加一步 prod 迁移验证——`to_regclass`/信息_schema查列存在 + 命中率 SQL 重跑；plan Global Constraints 追加「prod 部署必走 prod.sh（含 pg_dump 备份）+ 验证」ship checklist。理由：M1 是 5 条语句 breakpoints:false 迁移，drizzle migrate 偶发状态紊乱（hash 记了 DDL 没落），prod 部署需显式验证。

### R2 — Finding 2：backfill 前置 archetype seed 强制验证
**覆盖**：A3.1.1 Step 5 前
**改动**：加前置 `SELECT count(*) FROM activity_archetypes`，为 0 则 abort 并提示先跑 A1 seedDefaults，非零才进 backfill。

### R3 — Finding 3：A3.1.2 Step 1 测试 import 写法清晰化
**覆盖**：A3.1.2 Step 1
**改动**：删除自相矛盾的"局部 import + 注明删掉"写法。直接给：① 第 9 行扩展为单行 import（含 8 个 mapper：keyResultRowToUSOM/keyResultUSOMToRow/timeboxRowToUSOM/timeboxUSOMToRow/taskRowToUSOM/taskUSOMToRow/habitRowToUSOM/habitUSOMToRow）；② 测试块**不含**任何局部 import。implementer 照抄即对，避免重复 import 的 TS/lint error。

### R4 — Finding 4：task-edit-zone 父容器布局验证
**覆盖**：A3.1.3 Step 8
**改动**：Step 8 加一步——Read task-edit-zone.tsx :277-283 父容器结构，确认删 :283 的 `{EnergyIcon && ...}` 后无 dangling wrapper / 空隙；必要时清空父容器。明示「A3.1 ship 后到 A3.2 ship 前，task 详情区能量图标位置留白」为已知中间态（非 bug）。

### R5 — Finding 5：repository archetypeId 专项 case
**覆盖**：A3.1.2 Step 1
**改动**：在 `task.repository.test.ts` + habits repository 测试各加 1 个轻量 case——`create({..., activityArchetypeId: 'arch-x'})` → 验证返回 Task 含该字段（透传落库语义）。对齐用户「too many tests」偏好。

### R6 — OV1（P1 必纳）：grep pattern 精确化
**覆盖**：A3.1.3 Step 10
**改动**：grep pattern **去掉裸词 `EnergyIcon`**，改为 `grep -rn "energyProfile\|EnergyProfile\|energy_profile\|ENERGY_ICONS" src --include="*.ts" --include="*.tsx"`。明示白名单：`task-tree-view.tsx` 的 `ENERGY_ICON`（**单数**，:187/529/830，用 `task.energyRequired`）**不在删除范围，必须忽略**。原 pattern 含裸词 `EnergyIcon` 会误命中 task-tree-view 7 处无关代码，机械清除会破坏 energyRequired 图标逻辑（outside voice 已验证）。

### R7 — OV2：seed l2_name 核对 + abort 判据
**覆盖**：A3.1.1 Step 1 前 + Step 6
**改动**：Step 1 前加 `SELECT DISTINCT l2_name FROM activity_archetypes WHERE l1_category='工作'` 核对 5 个目标字符串（深度专注/方案设计/日常事务/响应式工作）逐字存在（防简繁/空格不符）；Step 6 加 abort 判据——`missed / has_profile` 比例超阈值（如 >10%）则 abort 不进 A3.1.3 删列，人工排查 seed。调研阶段 Agent 1 已确认 seed 工作 L2 含这 4 个名称，本步为防御性显式核对。

### R8 — OV3：prod 命中率 gate
**覆盖**：A3.1.1/A3.1.3 prod 验证（扩展 R1）
**改动**：plan 显式 prod gate——**prod M1（0025）跑后、prod M2（0026）跑前**，必须执行命中率 SQL（Step 6 同款），`missed=0`（或可解释的 seed 缺失）才允许 prod 跑 0026。否则 M2 删列后 energy_profile→archetype 映射无法回查。dev 命中率 100% 不代表 prod 100%（prod 可能多用户/seed 漏跑/脏值）。

### R9 — OV4：D4 映射表永久记录
**覆盖**：A3.1.4 Step 1
**改动**：`docs/database-design.md` 迁移历史段**永久嵌入 D4 映射表**（5 行：deep→深度专注/creative→方案设计/admin→日常事务/light→日常事务/reactive→响应式工作），不只引用 design doc。M2 删列后 admin+light 合并不可逆，需永久可追溯。

### R10 — OV5：baseTaskRow fixture 补全
**覆盖**：A3.1.2 Step 1
**改动**：`baseTaskRow` fixture 补 `schedulingConstraint: null` + `decomposition: null` 等 TaskRow 字段；或在测试块注明「fixture 用 `as any` 是刻意简化（对齐 timebox 范式 :56-109），非生产类型契约」。

### Failure modes（review 核查）
- backfill 子查询 NULL → activity_archetype_id NULL：archetype optional，可接受（已覆盖）✓
- A3.1.1→A3.1.2 中间态 insert 不带 archetype key → DB 列默认 null：不崩（drizzle schema 有列、mapper 未带 key 时省略落默认）✓
- M2 删列后代码漏清 → tsc 即报（同 commit 内修复）✓
- prod backfill 静默失败 → R1+R8 prod gate 覆盖 ✓
- 0 critical gap（无"无测试 + 无错误处理 + 静默失败"三无路径）

### Worktree parallelization
Sequential implementation, no parallelization opportunity——A3.1.1→A3.1.2→A3.1.3→A3.1.4 严格顺序（M1 先于 mapper 加字段先于 M2 删列先于文档），共享同一批文件（schema/mapper/objects/irepository），不可并行。

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review`（outside voice，codex exec 超时 290s EXIT 124） | Independent 2nd opinion | 0 (fallback) | — | —（codex 超时，Claude subagent 替补） |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | clean | 10 issues（Arch 2 + CodeQuality 2 + Test 1 + Outside voice 5），全部 fold 为 R1-R10 修订 overlay，0 unresolved |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | —（A3.1 无 UI，留 A3.2） |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

- **OUTSIDE VOICE:** Claude subagent（codex 超时 fallback）实际 Read 代码核对，确认 6 项无问题（save 自动带 archetypeId / TaskFilters.energyProfile 无消费方 / journal when 无冲突 / backfill CASE 完备 / mapper import 无漏清 / 中间态 insert 落 null 安全），抓到 review 漏的 1 个 **P1**（grep 裸词 EnergyIcon 误命中 task-tree-view → R6）+ 2 P2（seed l2_name 未核对 → R7 / prod 命中率 gate → R8）+ 1 P2（D4 映射表永久记录 → R9）+ 1 P3（fixture 不全 → R10）。全部 verify 真实，5 项采纳。
- **CROSS-MODEL:** 无 tension。outside voice 与 4-section review 同向（都是加强 plan），非反对。OV1 是 review 真正漏掉的 P1，outside voice 补充价值兑现。
- **PRIOR LEARNINGS applied:** [drizzle-migrate-state-desync-fix]（confidence 9）→ R1；[drizzle-journal-must-register-every-sql]（confidence 9）→ journal 登记 step 已遵守，R1 强化 prod 验证。
- **VERDICT:** ENG CLEARED（outside voice via Claude subagent）— A3.1 plan 经 plan-eng-review 4 section + Claude subagent outside voice，10 个 finding 全部落入修订清单 R1-R10，0 unresolved / 0 critical gap，可进入实现。Step 0 scope proceed as-is（12 文件是删字段必然 ripple，0 新类）。

NO UNRESOLVED DECISIONS
