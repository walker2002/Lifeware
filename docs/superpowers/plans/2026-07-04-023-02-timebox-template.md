# [023-02] 时间盒模板功能优化 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 重构时间盒模板（`TimeboxTemplate`）的数据模型与 UI——从固定 7 段 + 三订阅数组改为「有序行列表 + 模板级星期 + 抽屉编辑 + 习惯风卡片列表」，符合 `docs/UI-DESIGN-SPEC.md`。

**Architecture:** 配置类直写 DB（不走 Nexus）。后端：仓储层换 shape + A3 owner-check 遍历 `rows`；server action 入参随型。DB：手写 SQL 迁移，加 `rows` / `days_of_week`，DROP 旧 4 列，旧 7 段回填为 `custom` 行。前端：编辑器拆为纯函数（seed/blank/sort）+ 视图组件（`TemplateCard` / `Sheet` 抽屉）。

**Tech Stack:** Next.js 16 + React 19 + TypeScript 5 + Tailwind 4 + shadcn/ui (`Sheet` / `Card` / `Badge` / `Popover` / `Select`) + Drizzle ORM + PostgreSQL + Vitest。

---

## Global Constraints

- **代码语言**：所有注释、UI 文案、commit message、文档**简体中文**（CLAUDE.md 强约束）。
- **文档归属**：USOM/DB 变更**先改 `docs/` 再改代码**；`docs/usom-design.md` §3.12、`docs/database-design.md` §7.8、`CHANGELOG.md` 必须同步（Tier 2 强制）。
- **文件头注释**：每个新建/修改的 TS/JS 文件必须有 `/** @file ... @brief ... */` 头。
- **CSS 颜色**：仅用 CSS 变量令牌（`bg-canvas` / `text-ink` / `border-hairline` / `bg-surface-card` / `text-body` / `text-muted-foreground` / `bg-primary` / `bg-destructive` / `bg-error-soft` 等），禁用 Tailwind 默认色（`bg-white` / `text-gray-500` 等）。
- **DB 迁移**：本仓一律手写 SQL + psql + 登记 `src/lib/db/migrations/meta/_journal.json`；不跑 `db:generate/migrate`。DB = `lifeware_dev@localhost:5432`。迁移文件**幂等**（`IF NOT EXISTS` / `IF EXISTS`）。
- **MVP 固定用户**：`'00000000-0000-0000-0000-000000000001' as USOM_ID`（沿用）。
- **Next.js 'use server' 限制**：`app/actions/*.ts` 只能 `export async function`，禁止 `export const`。
- **测试运行**：必须在 `frontend/` 目录下跑（`@/` 映射），用 `npm test -- <pattern>`。tsc 须 `npx tsc --noEmit` 在 `frontend/` 跑。
- **commit 频率**：每个任务独立 commit；`Co-Authored-By: Claude <noreply@anthropic.com>`。
- **commit 规范**：`<type>(<scope>): [<ticket-id>] <subject>`（`feat` / `fix` / `chore` / `refactor` / `test` / `docs`）。

---

## File Structure（本次实现新增/修改文件清单）

| 文件 | 变更类型 | 职责 |
|---|---|---|
| `src/lib/db/migrations/0032_023_02_timebox_template_redesign.sql` | 新建 | 迁移 SQL（加 2 列 + 回填 + DROP 4 列） |
| `src/lib/db/migrations/meta/_journal.json` | 修改 | 登记 idx=32 |
| `src/lib/db/schema.ts` | 修改 | `timeboxTemplates` 换列 |
| `src/lib/db/repositories/timebox-template.ts` | 修改 | 换 shape + owner-check 遍历 rows |
| `src/lib/db/repositories/__tests__/timebox-template.repository.test.ts` | 修改 | 夹具 + 新 owner-check 用例 |
| `src/app/actions/timebox-templates.ts` | 修改 | 入参 + `fetchSubscriptionSources` 给 habit 带回 start/end |
| `src/domains/timebox/lib/template-row-helpers.ts` | 新建 | 纯函数：`WEEKDAY_LABELS` / `seedTemplateRows` / `blankTemplateRow` / `sortRowsByStart` / `genRowId` |
| `src/domains/timebox/lib/__tests__/template-row-helpers.test.ts` | 新建 | 纯函数单测 |
| `src/domains/timebox/components/template-card.tsx` | 新建 | 卡片：顶栏 + 星期 chips + 截断 + hover 完整列表 |
| `src/domains/timebox/components/__tests__/template-card.test.tsx` | 新建 | 渲染/截断/空/不限用例 |
| `src/domains/timebox/components/timebox-template-editor.tsx` | 修改 | 容器宽度 + PageBanner + Sheet 抽屉 + 行编辑器（用 helper） |
| `frontend/src/domains/timebox/pages/TimeboxTemplatesPage.tsx` | 修改 | 容器 |
| `frontend/src/app/timebox-templates/page.tsx` | 修改 | 容器 |
| `docs/usom-design.md` | 修改 | §3.12 TimeboxTemplate shape 改写 |
| `docs/database-design.md` | 修改 | §7.8 timebox_templates 改写 |
| `CHANGELOG.md` | 修改 | 新增 [023-02] 条目 |
| `docs/superpowers/specs/2026-07-03-023-02-timebox-template-design.md` | 不改 | SSOT |

**关注点**：
- `template-row-helpers.ts` 是纯函数文件，与 `template-card.tsx` 分离——便于单测与后续复用。
- 模板仍为「写入即存」纯配置，不接入排程（spec §9 已确认）；不动 `scheduling-handler.ts` / `providers/`。

---

## Task 1: 同步 Tier 2 文档（USOM/DB/CHANGELOG）

**Files:**
- Modify: `docs/usom-design.md`（§3.12）
- Modify: `docs/database-design.md`（§7.8）
- Modify: `CHANGELOG.md`

**Interfaces:** 无（纯文档）。

### Steps

- [ ] **Step 1.1: 改 `docs/usom-design.md` §3.12**

定位 `§3.12` TimeboxTemplate 章节，把现有定义替换为：

```ts
// ─── 3.12 TimeboxTemplate ─────────────────────────────────────
/**
 * 时间盒模板（[023-02]：行列表 + 模板级星期，配置类不走 Nexus）
 *
 * @property daysOfWeek - 应用范围，0=周日..6=周六；空数组=不限
 * @property rows       - 有序行列表（用户编辑顺序）
 */
type TemplateRowSource = 'habit' | 'task' | 'thread' | 'custom'

interface TemplateRow {
  id: string              // 稳定行 key（前端生成，随 jsonb 持久化）
  activityName: string
  start: string           // HH:MM
  end: string             // HH:MM
  source: TemplateRowSource
  sourceId?: string       // habit/task/thread 的 USOM_ID；custom 时为空
}

interface TimeboxTemplate {
  id: USOM_ID
  userId: USOM_ID
  schemaVersion: number
  name: string
  daysOfWeek: number[]
  rows: TemplateRow[]
  createdAt: Timestamp
  updatedAt: Timestamp
}
```

- [ ] **Step 1.2: 改 `docs/database-design.md` §7.8**

定位 `§7.8 timebox_templates` 章节，列定义替换为：

```sql
-- [023-02] 0032：rows 列表 + 模板级 days_of_week，移除 survival_segments + 3 订阅列
CREATE TABLE timebox_templates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  schema_version  integer NOT NULL DEFAULT 1,
  name            text NOT NULL,
  days_of_week    jsonb NOT NULL DEFAULT '[0,1,2,3,4,5,6]'::jsonb,
  rows            jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_timebox_templates_user ON timebox_templates(user_id);
```

附一段"迁移说明"小节，描述回填策略（旧 7 段→7 custom 行，旧 subscribed_* 丢弃）。

- [ ] **Step 1.3: 在 `CHANGELOG.md` 顶部新增条目**

```markdown
## [023-02] - 2026-07-04

### Changed
- **timebox_templates**：数据模型从 `survival_segments`(7 键) + `subscribed_habits/tasks/threads` 改为 `rows` (有序行列表) + `days_of_week` (模板级星期)。`survival_segments` 与 3 个 `subscribed_*` 列被移除。
- **时间盒模板编辑**：编辑详情从 Dialog 改为右侧 Sheet 抽屉；列表从固定宽度 `max-w-3xl` 改为宽度自适应 + 习惯风 `TemplateCard`。
- **行来源**：行新增 `source` 字段（`habit` / `task` / `thread` / `custom`），`source='habit'` 时起止时间锁定并自动从 `defaultTime`+`defaultDuration` 推算。

### Migration
- `0032_023_02_timebox_template_redesign.sql`：ADD COLUMN rows / days_of_week；旧 7 段回填为 7 条 custom 行；DROP survival_segments + 3 订阅列。
```

- [ ] **Step 1.4: Commit**

```bash
git add docs/usom-design.md docs/database-design.md CHANGELOG.md
git commit -m "docs(timebox): [023-02] USOM/DB 文档同步 + CHANGELOG

数据模型从 survival_segments(7键) + 3 订阅数组 改为 rows + days_of_week。

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 2: 手写 SQL 迁移 + 登记 journal

**Files:**
- Create: `src/lib/db/migrations/0032_023_02_timebox_template_redesign.sql`
- Modify: `src/lib/db/migrations/meta/_journal.json`

**Interfaces:** 无。

### Steps

- [ ] **Step 2.1: 创建迁移 SQL 文件**

`src/lib/db/migrations/0032_023_02_timebox_template_redesign.sql`：

```sql
-- [023-02] 时间盒模板数据模型重构：rows + days_of_week，移除 7 段 + 3 订阅
-- 设计来源：docs/superpowers/specs/2026-07-03-023-02-timebox-template-design.md §3
-- 幂等：所有 DDL 均 IF NOT EXISTS / IF EXISTS / IF [NOT] EXISTS ON column

BEGIN;

-- 1) 加新列
ALTER TABLE timebox_templates
  ADD COLUMN IF NOT EXISTS rows         jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS days_of_week jsonb NOT NULL DEFAULT '[0,1,2,3,4,5,6]'::jsonb;

-- 2) 旧 7 段 → 7 条 custom 行（用固定段名 key→中文 activityName）
--    segment order 固定：wake, morning, workAm, noon, workPm, evening, sleep
--    若列已不存在（幂等重跑），UPDATE 会影响 0 行，安全。
DO $$
DECLARE
  v_default jsonb := jsonb_build_array(
    jsonb_build_object('id', gen_random_uuid()::text, 'activityName', '起床',   'start', '07:00', 'end', '07:30', 'source', 'custom'),
    jsonb_build_object('id', gen_random_uuid()::text, 'activityName', '晨间',   'start', '07:30', 'end', '09:00', 'source', 'custom'),
    jsonb_build_object('id', gen_random_uuid()::text, 'activityName', '上午上班','start', '09:00', 'end', '12:00', 'source', 'custom'),
    jsonb_build_object('id', gen_random_uuid()::text, 'activityName', '午间',   'start', '12:00', 'end', '13:30', 'source', 'custom'),
    jsonb_build_object('id', gen_random_uuid()::text, 'activityName', '下午上班','start', '13:30', 'end', '18:00', 'source', 'custom'),
    jsonb_build_object('id', gen_random_uuid()::text, 'activityName', '晚间',   'start', '18:00', 'end', '23:00', 'source', 'custom'),
    jsonb_build_object('id', gen_random_uuid()::text, 'activityName', '睡眠',   'start', '23:00', 'end', '07:00', 'source', 'custom')
  );
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'timebox_templates' AND column_name = 'survival_segments'
  ) THEN
    -- 仅对尚无 rows 的行回填（防止重跑时覆盖用户已编辑的 rows）
    UPDATE timebox_templates
       SET rows = v_default
     WHERE rows = '[]'::jsonb OR rows IS NULL;
  END IF;
END $$;

-- 3) DROP 旧列（已无下游消费者，spec §0 已确认）
ALTER TABLE timebox_templates
  DROP COLUMN IF EXISTS survival_segments,
  DROP COLUMN IF EXISTS subscribed_habits,
  DROP COLUMN IF EXISTS subscribed_tasks,
  DROP COLUMN IF EXISTS subscribed_threads;

COMMIT;
```

- [ ] **Step 2.2: 在 `_journal.json` 登记**

打开 `src/lib/db/migrations/meta/_journal.json`，在 `entries` 数组末尾追加（**idx=32，tag 与文件名一致**；`when` 时间戳取**当前 Unix 毫秒值**——在终端用 `date +%s000` 取）：

```json
    {
      "idx": 32,
      "version": "7",
      "when": <CURRENT_UNIX_MS>,
      "tag": "0032_023_02_timebox_template_redesign",
      "breakpoints": false
    }
```

操作步骤：
1. 在 `frontend/` 跑 `date +%s000`，把输出值（整数毫秒）替换 `<CURRENT_UNIX_MS>`。
2. 在 `entries` 数组的 `0031_itineraries` 条目**之后**（即数组末尾前一项）插入。
3. 注意 JSON 尾逗号正确。

- [ ] **Step 2.3: 应用迁移到 dev DB**

```bash
cd frontend
psql "postgres://lifeware_dev@localhost:5432/lifeware_dev" \
  -f src/lib/db/migrations/0032_023_02_timebox_template_redesign.sql
```

**Expected**：`BEGIN` / `ALTER TABLE` / `DO` / `UPDATE` 行 + `COMMIT`，无错误。验证：

```bash
psql "postgres://lifeware_dev@localhost:5432/lifeware_dev" \
  -c "\d timebox_templates"
```

**Expected**：`rows jsonb not null default '[]'` + `days_of_week jsonb not null default '[0,1,2,3,4,5,6]'` 在列里；`survival_segments` / `subscribed_*` 不在列里。

再验证回填：

```bash
psql "postgres://lifeware_dev@localhost:5432/lifeware_dev" \
  -c "SELECT name, jsonb_array_length(rows) AS n_rows FROM timebox_templates;"
```

**Expected**：存在的历史模板 `n_rows` 应等于 7（或大于 0，若之前已编辑过）。

- [ ] **Step 2.4: Commit**

```bash
git add src/lib/db/migrations/0032_023_02_timebox_template_redesign.sql \
        src/lib/db/migrations/meta/_journal.json
git commit -m "chore(timebox): [023-02] 0032 迁移：rows + days_of_week 替换 7 段 + 3 订阅

旧 survival_segments 回填为 7 条 custom 行；subscribed_* 丢弃。
幂等：所有 DDL 走 IF [NOT] EXISTS。

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 3: schema.ts 换列

**Files:**
- Modify: `src/lib/db/schema.ts`（`timeboxTemplates` 表定义，约第 725-741 行）

**Interfaces:** 无（仅改 schema）。

### Steps

- [ ] **Step 3.1: 替换 `timeboxTemplates` 表定义**

把 `frontend/src/lib/db/schema.ts` 第 725-741 行（`// ─── 7.6b timebox_templates ...` 区块）整段替换为：

```ts
// ─── 7.6b timebox_templates (时间盒模板，[023-02] 行列表 + 模板级星期) ─
export const timeboxTemplates = pgTable('timebox_templates', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  schemaVersion: integer('schema_version').notNull().default(1),
  name: text('name').notNull(),
  /** 应用范围：0=周日..6=周六；空数组=不限 [023-02] */
  daysOfWeek: jsonb('days_of_week').$type<number[]>().notNull().default([0, 1, 2, 3, 4, 5, 6]),
  /** 有序行列表 [023-02]；每行 {id, activityName, start, end, source, sourceId?} */
  rows: jsonb('rows').$type<TemplateRow[]>().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_timebox_templates_user').on(table.userId),
])
```

并在文件顶部合适位置（`TemplateRow` 类型声明区——查找文件内现存的 `TemplateRow`/`Template*` 类型，若无则紧邻 `timeboxTemplates` 之前）加：

```ts
/** 模板行来源类型 [023-02] */
export type TemplateRowSource = 'habit' | 'task' | 'thread' | 'custom'

/** 模板中一条时间安排行 [023-02] */
export interface TemplateRow {
  id: string
  activityName: string
  start: string
  end: string
  source: TemplateRowSource
  sourceId?: string
}
```

> 注：若 `timebox-template.ts`（repository）单独定义 `TemplateRow` 并与此处重名，请在 repository 改为 `import type { TemplateRow, TemplateRowSource } from '@/lib/db/schema'` 复用，避免双定义。

- [ ] **Step 3.2: tsc 验证**

```bash
cd frontend && npx tsc --noEmit
```

**Expected**：tsc 通过，无新增错误。

- [ ] **Step 3.3: Commit**

```bash
git add src/lib/db/schema.ts
git commit -m "refactor(timebox): [023-02] schema：timeboxTemplates 换 rows + days_of_week

删除 survival_segments + 3 订阅列；新增 TemplateRow 类型。

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 4: 时间盒模板仓储层换 shape

**Files:**
- Modify: `src/lib/db/repositories/timebox-template.ts`

**Interfaces:**
- Produces:
  - `TimeboxTemplate` interface（id, userId, schemaVersion, name, daysOfWeek, rows, createdAt, updatedAt）
  - `TimeboxTemplateInput` interface（id?, name, daysOfWeek, rows）
  - `TimeboxTemplateRepository` 类（findById / findByUser / create / update / delete，行为不变但字段换了）

### Steps

- [ ] **Step 4.1: 替换 `SurvivalSegment` 与 `TimeboxTemplate` interface**

定位 `src/lib/db/repositories/timebox-template.ts` 第 1-46 行，替换为：

```ts
/**
 * @file timebox-template.repository
 * @brief 时间盒模板仓储实现（[023-02] 行列表 + 模板级星期，配置类不走 Nexus）
 *
 * 每次 create/update/delete 操作自动写入 user_audit_log（OQ-7）。
 * A3 owner-check：rows 中 source∈{habit,task,thread} 的 sourceId 全部归属当前 userId。
 *
 * @see docs/usom-design.md §3.12
 * @see docs/database-design.md §7.8
 */

import { eq, and, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import type { DbClient } from '@/lib/db'
import * as s from '@/lib/db/schema'
import type { TemplateRow } from '@/lib/db/schema'
import type { USOM_ID } from '@/usom/types/primitives'

/** TimeboxTemplate（USOM 形状，DB 行 → 业务对象的映射目标） */
export interface TimeboxTemplate {
  id: USOM_ID
  userId: USOM_ID
  schemaVersion: number
  name: string
  daysOfWeek: number[]
  rows: TemplateRow[]
  createdAt: string
  updatedAt: string
}

/** Create/Update 输入（除 id 外字段必填） */
export interface TimeboxTemplateInput {
  id?: string
  name: string
  daysOfWeek: number[]
  rows: TemplateRow[]
}
```

- [ ] **Step 4.2: 替换 `rowToTemplate`**

定位第 49-62 行 `rowToTemplate`，替换为：

```ts
/** DB 行 → USOM TimeboxTemplate */
function rowToTemplate(row: typeof s.timeboxTemplates.$inferSelect): TimeboxTemplate {
  return {
    id: row.id,
    userId: row.userId,
    schemaVersion: row.schemaVersion,
    name: row.name,
    daysOfWeek: row.daysOfWeek ?? [0, 1, 2, 3, 4, 5, 6],
    rows: row.rows ?? [],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}
```

- [ ] **Step 4.3: 替换 `create`**

定位第 84-111 行 `create`，替换为：

```ts
async create(input: TimeboxTemplateInput, userId: USOM_ID, tx?: DbClient): Promise<TimeboxTemplate> {
  const exec = async (client: DbClient) => {
    await this.assertSubscriptionsOwned(input, userId, client)

    const [row] = await client
      .insert(s.timeboxTemplates)
      .values({
        userId,
        name: input.name,
        daysOfWeek: input.daysOfWeek,
        rows: input.rows,
      })
      .returning()

    const template = rowToTemplate(row)

    await this._logAudit(client, userId, 'create', template.id, {
      newValues: template as unknown as Record<string, unknown>,
    })

    return template
  }
  return tx ? exec(tx) : db.transaction(exec)
}
```

- [ ] **Step 4.4: 替换 `update`**

定位第 113-182 行 `update`，替换为：

```ts
async update(id: USOM_ID, input: TimeboxTemplateInput, userId: USOM_ID, tx?: DbClient): Promise<TimeboxTemplate> {
  const exec = async (client: DbClient) => {
    const old = await this.findById(id, userId, client)
    if (!old) throw new Error(`TimeboxTemplate ${id} not found`)

    // rows 必填 → 总是 owner-check（不再有「没改就跳过」分支）
    await this.assertSubscriptionsOwned(input, userId, client)

    const changedFields: string[] = []
    const setData: Record<string, unknown> = { updatedAt: new Date() }

    if (input.name !== undefined) {
      setData.name = input.name
      changedFields.push('name')
    }
    if (input.daysOfWeek !== undefined) {
      setData.daysOfWeek = input.daysOfWeek
      changedFields.push('daysOfWeek')
    }
    if (input.rows !== undefined) {
      setData.rows = input.rows
      changedFields.push('rows')
    }

    const [updated] = await client
      .update(s.timeboxTemplates)
      .set(setData)
      .where(and(eq(s.timeboxTemplates.id, id), eq(s.timeboxTemplates.userId, userId)))
      .returning()

    if (!updated) {
      throw new Error(`TimeboxTemplate ${id} 不存在（可能已被并发删除）`)
    }

    const template = rowToTemplate(updated)

    await this._logAudit(client, userId, 'update', id, {
      changedFields,
      oldValues: this._pickFields(old, changedFields),
      newValues: this._pickFields(template, changedFields),
    })

    return template
  }
  return tx ? exec(tx) : db.transaction(exec)
}
```

- [ ] **Step 4.5: 替换 `assertSubscriptionsOwned`**

定位第 208-226 行 `assertSubscriptionsOwned`，替换为：

```ts
/**
 * A3 owner-check：遍历 input.rows 收集 source∈{habit,task,thread} 的 sourceId，
 * 按来源分组去重后校验归属。任一 id 不归属或不存在则抛错。
 */
private async assertSubscriptionsOwned(
  input: TimeboxTemplateInput,
  userId: USOM_ID,
  client: DbClient,
): Promise<void> {
  const habitIds = uniq(input.rows.filter((r) => r.source === 'habit' && r.sourceId).map((r) => r.sourceId!))
  const taskIds = uniq(input.rows.filter((r) => r.source === 'task' && r.sourceId).map((r) => r.sourceId!))
  const threadIds = uniq(input.rows.filter((r) => r.source === 'thread' && r.sourceId).map((r) => r.sourceId!))

  const tasks = await Promise.all([
    habitIds.length > 0 ? this._checkHabits(habitIds, userId, client) : Promise.resolve(),
    taskIds.length > 0 ? this._checkTasks(taskIds, userId, client) : Promise.resolve(),
    threadIds.length > 0 ? this._checkThreads(threadIds, userId, client) : Promise.resolve(),
  ])
  void tasks
}
```

并在文件**底部**（imports 之后、类之外）加工具函数：

```ts
function uniq<T>(arr: T[]): T[] {
  return [...new Set(arr)]
}
```

- [ ] **Step 4.6: tsc 验证**

```bash
cd frontend && npx tsc --noEmit
```

**Expected**：tsc 通过（tests/dialog/editor 旧 import 会报错——将在后续任务修）。

- [ ] **Step 4.7: Commit**

```bash
git add src/lib/db/repositories/timebox-template.ts
git commit -m "refactor(timebox): [023-02] 仓储层换 shape：rows + daysOfWeek

A3 owner-check 改为遍历 rows 收集 sourceId。
注：调用方（actions/tests/editor）将后续任务修复。

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 5: 仓储测试夹具与用例更新（TDD）

**Files:**
- Modify: `src/lib/db/repositories/__tests__/timebox-template.repository.test.ts`

**Interfaces:**
- Consumes: `TimeboxTemplateRepository` from Task 4
- Produces: 修改后的 `FAKE_TEMPLATE_ROW` 夹具 + create/delete/findByUser 用例

### Steps

- [ ] **Step 5.1: 替换 `FAKE_TEMPLATE_ROW` 夹具**

定位第 33-44 行，替换为：

```ts
const FAKE_TEMPLATE_ROW = {
  id: '11111111-1111-1111-1111-111111111111',
  userId: MVP_USER,
  schemaVersion: 1,
  name: '工作日模板',
  daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  rows: [
    {
      id: 'r1',
      activityName: '晨跑',
      start: '06:00',
      end: '07:00',
      source: 'habit',
      sourceId: 'habit-1',
    },
    {
      id: 'r2',
      activityName: '起床',
      start: '07:00',
      end: '07:30',
      source: 'custom',
    },
  ],
  createdAt: new Date('2026-06-29T00:00:00Z'),
  updatedAt: new Date('2026-06-29T00:00:00Z'),
}
```

- [ ] **Step 5.2: 更新 `findByUser` 断言**

定位第 89-100 行，**新增**对 `rows` / `daysOfWeek` 的断言：

```ts
describe('findByUser', () => {
  it('应返回当前用户所有模板', async () => {
    const { db } = await import('@/lib/db')
    vi.mocked(db.select).mockReturnValue(mockSelectWhereOrderBy([FAKE_TEMPLATE_ROW]) as any)

    const result = await repo.findByUser(MVP_USER)
    expect(Array.isArray(result)).toBe(true)
    expect(result[0]?.id).toBe(FAKE_TEMPLATE_ROW.id)
    expect(result[0]?.name).toBe('工作日模板')
    expect(result[0]?.rows).toHaveLength(2)
    expect(result[0]?.rows[0]?.source).toBe('habit')
    expect(result[0]?.daysOfWeek).toEqual([0, 1, 2, 3, 4, 5, 6])
  })
})
```

- [ ] **Step 5.3: 替换 `create` 用例**

定位第 121-195 行整段 `create` describe 块，替换为：

```ts
describe('create', () => {
  it('应在 rows 中 source 全部归属当前用户时成功创建并写 audit log', async () => {
    const { db } = await import('@/lib/db')
    const txSelect = vi.fn()
    const txInsert = vi.fn()
    vi.mocked(db.transaction).mockImplementationOnce((fn: any) =>
      fn({
        select: txSelect,
        insert: txInsert,
        update: vi.fn(),
        delete: vi.fn(),
      }),
    )

    // owner-check：rows 仅有 1 条 habit 引用，遍历 → habits select 命中
    txSelect.mockReturnValueOnce(mockSelectWhere([{ id: 'habit-1' }]) as any)
    // task/thread 校验因无 id 直接 skip（不调 select）
    // insert returning → [FAKE_TEMPLATE_ROW]
    txInsert.mockReturnValueOnce(mockInsertReturning([FAKE_TEMPLATE_ROW]) as any)
    // audit log insert → void
    txInsert.mockReturnValueOnce(mockInsertVoid() as any)

    const result = await repo.create(
      {
        name: '工作日模板',
        daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
        rows: FAKE_TEMPLATE_ROW.rows,
      },
      MVP_USER,
    )

    expect(result.id).toBe(FAKE_TEMPLATE_ROW.id)
    expect(result.rows).toEqual(FAKE_TEMPLATE_ROW.rows)
    expect(txInsert).toHaveBeenCalledTimes(2)
  })

  it('A3 owner-check：rows 中 habit 跨用户应抛出', async () => {
    const { db } = await import('@/lib/db')
    const txSelect = vi.fn()
    const txInsert = vi.fn()
    vi.mocked(db.transaction).mockImplementationOnce((fn: any) =>
      fn({
        select: txSelect,
        insert: txInsert,
        update: vi.fn(),
        delete: vi.fn(),
      }),
    )

    // owner-check habits → 空（跨用户 → 拒绝）
    txSelect.mockReturnValueOnce(mockSelectWhere([]) as any)

    await expect(
      repo.create(
        {
          name: '跨用户尝试',
          daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
          rows: [
            {
              id: 'r1',
              activityName: '晨跑',
              start: '06:00',
              end: '07:00',
              source: 'habit',
              sourceId: 'other-user-habit',
            },
          ],
        },
        MVP_USER,
      ),
    ).rejects.toThrow(/订阅的习惯 .* 不存在或不属于当前用户/)

    expect(txInsert).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 5.4: 跑测试**

```bash
cd frontend && npm test -- timebox-template.repository
```

**Expected**：所有用例 PASS（4 个：findByUser 1、findById 2、create 2、delete 2；其中 findById 1 个未改动也跑通）。vitest baseline 零新增 = 0（基线 17 → 目标 17）。

- [ ] **Step 5.5: Commit**

```bash
git add src/lib/db/repositories/__tests__/timebox-template.repository.test.ts
git commit -m "test(timebox): [023-02] 仓储测试夹具改为 rows/daysOfWeek

A3 owner-check 跨用户 habit 用例覆盖。

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 6: 纯函数 helpers + 单测

**Files:**
- Create: `src/domains/timebox/lib/template-row-helpers.ts`
- Create: `src/domains/timebox/lib/__tests__/template-row-helpers.test.ts`

**Interfaces:**
- Produces:
  - `WEEKDAY_LABELS: { value: number; short: string; long: string }[]`
  - `seedTemplateRows(idGen?: () => string): TemplateRow[]`
  - `blankTemplateRow(idGen?: () => string): TemplateRow`
  - `sortRowsByStart(rows: TemplateRow[]): TemplateRow[]`
  - `genRowId(): string`（封装 `crypto.randomUUID()`，便于测试时注入）

### Steps

- [ ] **Step 6.1: 写单测（先红）**

新建 `src/domains/timebox/lib/__tests__/template-row-helpers.test.ts`：

```ts
/**
 * @file template-row-helpers.test
 * @brief 纯函数单元测试（[023-02]）
 */
import { describe, it, expect } from 'vitest'
import {
  WEEKDAY_LABELS,
  seedTemplateRows,
  blankTemplateRow,
  sortRowsByStart,
  genRowId,
} from '../template-row-helpers'
import type { TemplateRow } from '@/lib/db/schema'

describe('WEEKDAY_LABELS', () => {
  it('应返回 7 项且 0=周日 .. 6=周六', () => {
    expect(WEEKDAY_LABELS).toHaveLength(7)
    expect(WEEKDAY_LABELS[0]?.value).toBe(0)
    expect(WEEKDAY_LABELS[6]?.value).toBe(6)
  })

  it('每项必须有 short / long 字段', () => {
    for (const w of WEEKDAY_LABELS) {
      expect(typeof w.short).toBe('string')
      expect(typeof w.long).toBe('string')
      expect(w.short.length).toBeGreaterThan(0)
      expect(w.long.length).toBeGreaterThan(0)
    }
  })
})

describe('genRowId', () => {
  it('应返回非空字符串', () => {
    const id = genRowId()
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)
  })

  it('两次调用应返回不同 id', () => {
    expect(genRowId()).not.toBe(genRowId())
  })
})

describe('seedTemplateRows', () => {
  it('默认应返回 7 条 custom 行，固定时间表', () => {
    const rows = seedTemplateRows()
    expect(rows).toHaveLength(7)
    for (const r of rows) {
      expect(r.source).toBe('custom')
      expect(r.sourceId).toBeUndefined()
    }
    expect(rows[0]?.activityName).toBe('起床')
    expect(rows[0]?.start).toBe('07:00')
    expect(rows[0]?.end).toBe('07:30')
  })

  it('idGen 注入时可自定义 id 生成', () => {
    let n = 0
    const rows = seedTemplateRows(() => `fixed-${++n}`)
    expect(rows.map((r) => r.id)).toEqual(['fixed-1', 'fixed-2', 'fixed-3', 'fixed-4', 'fixed-5', 'fixed-6', 'fixed-7'])
  })
})

describe('blankTemplateRow', () => {
  it('应返回 1 条 custom 09:00–10:00 行', () => {
    const r = blankTemplateRow()
    expect(r.source).toBe('custom')
    expect(r.start).toBe('09:00')
    expect(r.end).toBe('10:00')
    expect(r.sourceId).toBeUndefined()
  })

  it('应可注入 id', () => {
    const r = blankTemplateRow(() => 'x')
    expect(r.id).toBe('x')
  })
})

describe('sortRowsByStart', () => {
  it('应按 start 升序', () => {
    const rows: TemplateRow[] = [
      { id: 'a', activityName: 'a', start: '12:00', end: '13:00', source: 'custom' },
      { id: 'b', activityName: 'b', start: '08:00', end: '09:00', source: 'custom' },
      { id: 'c', activityName: 'c', start: '20:00', end: '21:00', source: 'custom' },
    ]
    const sorted = sortRowsByStart(rows)
    expect(sorted.map((r) => r.id)).toEqual(['b', 'a', 'c'])
  })

  it('应返回新数组，不修改原数组', () => {
    const rows: TemplateRow[] = [
      { id: 'a', activityName: 'a', start: '12:00', end: '13:00', source: 'custom' },
    ]
    const sorted = sortRowsByStart(rows)
    expect(sorted).not.toBe(rows)
  })
})
```

- [ ] **Step 6.2: 跑测试确认失败**

```bash
cd frontend && npm test -- template-row-helpers
```

**Expected**：FAIL（`Cannot find module '../template-row-helpers'`）。

- [ ] **Step 6.3: 实现 helpers**

新建 `src/domains/timebox/lib/template-row-helpers.ts`：

```ts
/**
 * @file template-row-helpers
 * @brief 时间盒模板行列表的纯函数（[023-02]）
 *
 * 0 React 依赖；可被编辑器、TemplateCard、server action、测试复用。
 * 副作用函数（id 生成）通过参数注入，便于测试时控。
 */

import type { TemplateRow } from '@/lib/db/schema'

/** 星期标签（0=周日..6=周六，UI 用） */
export const WEEKDAY_LABELS: { value: number; short: string; long: string }[] = [
  { value: 0, short: '日', long: '周日' },
  { value: 1, short: '一', long: '周一' },
  { value: 2, short: '二', long: '周二' },
  { value: 3, short: '三', long: '周三' },
  { value: 4, short: '四', long: '周四' },
  { value: 5, short: '五', long: '周五' },
  { value: 6, short: '六', long: '周六' },
]

/** 生成行 id（默认用 crypto.randomUUID，测试时可注入） */
export function genRowId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  // SSR / 旧环境兜底
  return `r-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** 新建模板的 7 段 seed（与 SQL 迁移默认 7 段对齐） */
export function seedTemplateRows(idGen: () => string = genRowId): TemplateRow[] {
  const seeds: Array<Omit<TemplateRow, 'id' | 'source' | 'sourceId'>> = [
    { activityName: '起床',    start: '07:00', end: '07:30' },
    { activityName: '晨间',    start: '07:30', end: '09:00' },
    { activityName: '上午上班', start: '09:00', end: '12:00' },
    { activityName: '午间',    start: '12:00', end: '13:30' },
    { activityName: '下午上班', start: '13:30', end: '18:00' },
    { activityName: '晚间',    start: '18:00', end: '23:00' },
    { activityName: '睡眠',    start: '23:00', end: '07:00' },
  ]
  return seeds.map((s) => ({ id: idGen(), source: 'custom', ...s }))
}

/** 抽屉内「+ 新增一行」的默认行 */
export function blankTemplateRow(idGen: () => string = genRowId): TemplateRow {
  return {
    id: idGen(),
    activityName: '',
    start: '09:00',
    end: '10:00',
    source: 'custom',
  }
}

/** 按 start 升序（HH:MM 字符串字典序即可等价时间序） */
export function sortRowsByStart(rows: TemplateRow[]): TemplateRow[] {
  return [...rows].sort((a, b) => a.start.localeCompare(b.start))
}
```

- [ ] **Step 6.4: 跑测试确认通过**

```bash
cd frontend && npm test -- template-row-helpers
```

**Expected**：全部 PASS。

- [ ] **Step 6.5: Commit**

```bash
git add src/domains/timebox/lib/template-row-helpers.ts \
        src/domains/timebox/lib/__tests__/template-row-helpers.test.ts
git commit -m "feat(timebox): [023-02] 模板行纯函数 helpers + 单测

WEEKDAY_LABELS / seedTemplateRows / blankTemplateRow / sortRowsByStart / genRowId。

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 7: TemplateCard 组件 + 单测

**Files:**
- Create: `src/domains/timebox/components/template-card.tsx`
- Create: `src/domains/timebox/components/__tests__/template-card.test.tsx`

**Interfaces:**
- Consumes: `TemplateRow[]` from `@/lib/db/schema`, `sortRowsByStart` from Task 6
- Produces: `<TemplateCard template onEdit onDelete />` 组件

### Steps

- [ ] **Step 7.1: 写单测（先红）**

新建 `src/domains/timebox/components/__tests__/template-card.test.tsx`：

```tsx
/**
 * @file template-card.test
 * @brief TemplateCard 组件测试（[023-02]）
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { TemplateCard } from '../template-card'
import type { TimeboxTemplate } from '@/lib/db/repositories/timebox-template'

const baseTemplate: TimeboxTemplate = {
  id: 't-1',
  userId: 'u-1',
  schemaVersion: 1,
  name: '工作日模板',
  daysOfWeek: [1, 2, 3, 4, 5],
  rows: [
    { id: 'r1', activityName: '起床', start: '07:00', end: '07:30', source: 'custom' },
    { id: 'r2', activityName: '晨跑', start: '06:00', end: '07:00', source: 'habit', sourceId: 'h-1' },
  ],
  createdAt: '',
  updatedAt: '',
}

describe('TemplateCard', () => {
  it('应渲染模板名', () => {
    render(<TemplateCard template={baseTemplate} onEdit={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByText('工作日模板')).toBeInTheDocument()
  })

  it('应渲染星期 chips（短名）', () => {
    render(<TemplateCard template={baseTemplate} onEdit={vi.fn()} onDelete={vi.fn()} />)
    // daysOfWeek = [1,2,3,4,5] 对应 一二三四五
    expect(screen.getByText('一')).toBeInTheDocument()
    expect(screen.getByText('五')).toBeInTheDocument()
    expect(screen.queryByText('六')).not.toBeInTheDocument()
  })

  it('空 daysOfWeek 应显示「不限」', () => {
    render(<TemplateCard template={{ ...baseTemplate, daysOfWeek: [] }} onEdit={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByText('不限')).toBeInTheDocument()
  })

  it('行数 ≤ 4 时应全部展示', () => {
    const t = { ...baseTemplate, rows: [
      { id: 'a', activityName: 'A', start: '01:00', end: '02:00', source: 'custom' as const },
      { id: 'b', activityName: 'B', start: '03:00', end: '04:00', source: 'custom' as const },
    ] }
    render(<TemplateCard template={t} onEdit={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByText(/01:00.*02:00.*A/)).toBeInTheDocument()
    expect(screen.getByText(/03:00.*04:00.*B/)).toBeInTheDocument()
    expect(screen.queryByText(/还有/)).not.toBeInTheDocument()
  })

  it('行数 > 4 时应截断 + 显示「还有 N 条」', () => {
    const t = { ...baseTemplate, rows: [
      { id: '1', activityName: 'A', start: '01:00', end: '02:00', source: 'custom' as const },
      { id: '2', activityName: 'B', start: '03:00', end: '04:00', source: 'custom' as const },
      { id: '3', activityName: 'C', start: '05:00', end: '06:00', source: 'custom' as const },
      { id: '4', activityName: 'D', start: '07:00', end: '08:00', source: 'custom' as const },
      { id: '5', activityName: 'E', start: '09:00', end: '10:00', source: 'custom' as const },
      { id: '6', activityName: 'F', start: '11:00', end: '12:00', source: 'custom' as const },
    ] }
    render(<TemplateCard template={t} onEdit={vi.fn()} onDelete={vi.fn()} />)
    expect(screen.getByText('还有 2 条')).toBeInTheDocument()
    // 前 4 条可见
    expect(screen.getByText(/A/)).toBeInTheDocument()
    expect(screen.getByText(/D/)).toBeInTheDocument()
    // 后 2 条不在静态文本中（被 Popover 包裹）
    expect(screen.queryByText('11:00')).not.toBeInTheDocument()
  })

  it('行按 start 升序显示', () => {
    const t = { ...baseTemplate, rows: [
      { id: '1', activityName: 'B', start: '09:00', end: '10:00', source: 'custom' as const },
      { id: '2', activityName: 'A', start: '06:00', end: '07:00', source: 'custom' as const },
    ] }
    const { container } = render(<TemplateCard template={t} onEdit={vi.fn()} onDelete={vi.fn()} />)
    const rows = container.querySelectorAll('[data-testid="row-line"]')
    expect(rows[0]?.textContent).toMatch(/06:00/)
    expect(rows[1]?.textContent).toMatch(/09:00/)
  })

  it('点击「编辑」应触发 onEdit', async () => {
    const onEdit = vi.fn()
    render(<TemplateCard template={baseTemplate} onEdit={onEdit} onDelete={vi.fn()} />)
    await userEvent.click(screen.getByRole('button', { name: /编辑/ }))
    expect(onEdit).toHaveBeenCalledTimes(1)
  })

  it('点击「删除」应触发 onDelete', async () => {
    const onDelete = vi.fn()
    render(<TemplateCard template={baseTemplate} onEdit={vi.fn()} onDelete={onDelete} />)
    await userEvent.click(screen.getByRole('button', { name: /删除/ }))
    expect(onDelete).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 7.2: 跑测试确认失败**

```bash
cd frontend && npm test -- template-card
```

**Expected**：FAIL（`Cannot find module '../template-card'`）。

- [ ] **Step 7.3: 实现 `TemplateCard`**

新建 `src/domains/timebox/components/template-card.tsx`：

```tsx
/**
 * @file template-card
 * @brief 时间盒模板卡片（[023-02]，仿 HabitCard 风格）
 *
 * 顶栏：模板名 + 星期 chips
 * 主体：起–止：活动名称 逐行（按 start 升序）
 * 截断：> 4 行时显示前 4 行 + "还有 N 条"；hover 弹 Popover 完整列表
 * 操作：编辑 / 删除
 */

'use client'

import { useMemo } from 'react'
import { Trash2, ChevronDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import type { TimeboxTemplate } from '@/lib/db/repositories/timebox-template'
import { sortRowsByStart, WEEKDAY_LABELS } from '@/domains/timebox/lib/template-row-helpers'

interface TemplateCardProps {
  template: TimeboxTemplate
  onEdit: () => void
  onDelete: () => void
}

const MAX_VISIBLE_ROWS = 4

export function TemplateCard({ template, onEdit, onDelete }: TemplateCardProps) {
  const sorted = useMemo(() => sortRowsByStart(template.rows), [template.rows])
  const visible = sorted.slice(0, MAX_VISIBLE_ROWS)
  const hidden = sorted.slice(MAX_VISIBLE_ROWS)
  const hiddenCount = hidden.length

  const weekdayChips = useMemo(() => {
    if (template.daysOfWeek.length === 0) return ['不限']
    const set = new Set(template.daysOfWeek)
    return WEEKDAY_LABELS.filter((w) => set.has(w.value)).map((w) => w.short)
  }, [template.daysOfWeek])

  return (
    <Card className="border-hairline bg-canvas hover:bg-muted/50 transition-colors">
      <CardContent className="flex flex-col gap-3">
        {/* 顶栏：模板名 + 星期 chips */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-ink">{template.name || '未命名'}</span>
            {weekdayChips.map((c) => (
              <Badge key={c} variant="outline" className="text-[10px]">
                {c}
              </Badge>
            ))}
          </div>
        </div>

        {/* 安排详情 */}
        {sorted.length === 0 ? (
          <p className="text-xs text-muted-foreground">暂无安排</p>
        ) : (
          <div className="flex flex-col gap-1">
            {visible.map((r) => (
              <div
                key={r.id}
                data-testid="row-line"
                className="text-xs text-muted-foreground tabular-nums"
              >
                {r.start}–{r.end}：{r.activityName || '(未命名)'}
              </div>
            ))}
            {hiddenCount > 0 && (
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="self-start inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    还有 {hiddenCount} 条
                    <ChevronDown className="size-3" />
                  </button>
                </PopoverTrigger>
                <PopoverContent side="bottom" align="start" className="w-64 p-2">
                  <div className="flex flex-col gap-1">
                    {sorted.map((r) => (
                      <div key={r.id} className="text-xs text-ink tabular-nums">
                        {r.start}–{r.end}：{r.activityName || '(未命名)'}
                      </div>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            )}
          </div>
        )}

        {/* 操作 */}
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={onEdit}>
            编辑
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive hover:text-destructive"
            onClick={onDelete}
          >
            <Trash2 className="size-3 mr-1" />
            删除
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 7.4: 跑测试**

```bash
cd frontend && npm test -- template-card
```

**Expected**：全部 PASS（8 个用例）。

- [ ] **Step 7.5: Commit**

```bash
git add src/domains/timebox/components/template-card.tsx \
        src/domains/timebox/components/__tests__/template-card.test.tsx
git commit -m "feat(timebox): [023-02] TemplateCard 组件 + 单测

仿 HabitCard；顶栏星期 chips；>4 行截断 + Popover 完整列表。

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 8: server action 换 shape + habit start/end

**Files:**
- Modify: `src/app/actions/timebox-templates.ts`

**Interfaces:**
- Produces:
  - `saveTimeboxTemplate(input: TimeboxTemplateInput)` 入参随 TypeScript 形态
  - `fetchSubscriptionSources` 在 `habits` 项上加 `start: string` + `end: string`（由 `defaultTime`+`defaultDuration` 推算）

### Steps

- [ ] **Step 8.1: 改 `SubscriptionSources` 形状**

定位 `src/app/actions/timebox-templates.ts` 第 27-32 行，替换为：

```ts
/** 订阅源汇总（habit 多带 start/end；tasks/threads 仅 id+title） */
export interface SubscriptionSources {
  habits: Array<{ id: string; title: string; start: string; end: string }>
  tasks: Array<{ id: string; title: string }>
  threads: Array<{ id: string; title: string }>
}
```

- [ ] **Step 8.2: 改 `fetchSubscriptionSources`**

定位第 81-99 行，替换为：

```ts
export async function fetchSubscriptionSources(): Promise<TimeboxTemplateActionResult<SubscriptionSources>> {
  try {
    const [habits, tasks, threads] = await Promise.all([
      new HabitRepository().findByUserId(MVP_USER_ID, { status: 'active' }),
      new TaskRepository().findByUserId(MVP_USER_ID, { status: ['todo', 'planned', 'in_progress'] }),
      new ThreadRepository().findByUserId(MVP_USER_ID, { status: 'active' }),
    ])
    return {
      success: true,
      data: {
        habits: habits.map((h) => ({
          id: h.id,
          title: h.title,
          start: h.defaultTime,
          end: addMinutesToHHMM(h.defaultTime, h.defaultDuration),
        })),
        tasks: tasks.map((t) => ({ id: t.id, title: t.title })),
        threads: threads.map((th) => ({ id: th.id, title: th.name })),
      },
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : '拉取订阅源失败' }
  }
}
```

并在文件底部加工具函数：

```ts
/** HH:MM + 分钟数（跨午夜按 +24h 归一，mod 24h 显示） */
function addMinutesToHHMM(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map(Number)
  const total = (h * 60 + m + minutes) % (24 * 60)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`
}
```

- [ ] **Step 8.3: tsc 验证**

```bash
cd frontend && npx tsc --noEmit
```

**Expected**：tsc 通过（若 8.2 触发了 client 侧旧引用错误，单独修；本任务聚焦 server action 端）。

- [ ] **Step 8.4: Commit**

```bash
git add src/app/actions/timebox-templates.ts
git commit -m "feat(timebox): [023-02] fetchSubscriptionSources habit 带回 start/end

供 TemplateCard 行编辑器在 source='habit' 时锁定/回填起止时间。

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 9: timebox-template-editor.tsx 全面改写

**Files:**
- Modify: `src/domains/timebox/components/timebox-template-editor.tsx`

**Interfaces:**
- Consumes: `TimeboxTemplate` from `@/lib/db/repositories/timebox-template`, helpers from Task 6, `SubscriptionSources` from Task 8
- Produces: 宽度自适应 + `PageBanner` + 模板列表（用 `TemplateCard`）+ 右侧 `Sheet` 抽屉（名称 + 星期多选 + 行列表编辑器 + 保存/取消）

### Steps

- [ ] **Step 9.1: 替换 import 区**

定位文件第 1-65 行 import + 常量区，替换为：

```tsx
/**
 * @file timebox-template-editor
 * @brief 时间盒模板编辑器（[023-02] 行列表 + 模板级星期 + Sheet 抽屉）
 *
 * 列表（TemplateCard 网格）+ Sheet 抽屉编辑。CRUD 经 app/actions/timebox-templates。
 * 订阅源懒加载。配色用 CSS 变量令牌（UI-DESIGN-SPEC §14 C-04）。
 *
 * 设计令牌约定（[024.1]）：
 * - bg-canvas / border-hairline（卡片）
 * - Loader2 替换「保存中…」（§6.7）
 * - AlertDialog 二次确认
 */
'use client'

import { useState, useCallback, useMemo } from 'react'
import { toast } from 'sonner'
import { Plus, Loader2, LayoutTemplate, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/empty-state'
import { PageBanner } from '@/components/layout/page-banner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Badge } from '@/components/ui/badge'
import { TemplateCard } from '@/domains/timebox/components/template-card'
import {
  saveTimeboxTemplate,
  deleteTimeboxTemplate,
  fetchSubscriptionSources,
  type SubscriptionSources,
} from '@/app/actions/timebox-templates'
import type { TimeboxTemplate } from '@/lib/db/repositories/timebox-template'
import type { TemplateRow, TemplateRowSource } from '@/lib/db/schema'
import {
  WEEKDAY_LABELS,
  seedTemplateRows,
  blankTemplateRow,
  sortRowsByStart,
  genRowId,
} from '@/domains/timebox/lib/template-row-helpers'

interface SourceHabit { id: string; title: string; start: string; end: string }
interface SourceItem { id: string; title: string }

interface EditorProps {
  initialTemplates: TimeboxTemplate[]
}

/** 默认空白模板（编辑器用，name='' + 0 行 + 全周） */
function blankTemplate(): TimeboxTemplate {
  return {
    id: '' as TimeboxTemplate['id'],
    userId: '' as TimeboxTemplate['userId'],
    schemaVersion: 1,
    name: '',
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    rows: [],
    createdAt: '',
    updatedAt: '',
  }
}
```

- [ ] **Step 9.2: 替换主组件**

定位第 95-412 行整段 `TimeboxTemplateEditor` 主组件 + `SubscriptionChips`，替换为：

```tsx
export function TimeboxTemplateEditor({ initialTemplates }: EditorProps) {
  const [templates, setTemplates] = useState<TimeboxTemplate[]>(initialTemplates)
  const [editing, setEditing] = useState<TimeboxTemplate | null>(null)
  const [sources, setSources] = useState<SubscriptionSources | null>(null)
  const [sourcesLoaded, setSourcesLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

  /** 懒加载订阅源（仅首次打开编辑时拉取） */
  const ensureSources = useCallback(async () => {
    if (sourcesLoaded) return
    const r = await fetchSubscriptionSources()
    if (r.success && r.data) {
      setSources(r.data)
      setSourcesLoaded(true)
    } else {
      toast.error(r.error ?? '拉取订阅源失败')
    }
  }, [sourcesLoaded])

  // ─── 保存 ────────────────────────────────────────────────────
  async function handleSave() {
    if (!editing) return
    if (!editing.name.trim()) {
      toast.error('请输入模板名称')
      return
    }
    setSaving(true)
    try {
      const input = {
        name: editing.name.trim(),
        daysOfWeek: editing.daysOfWeek,
        rows: editing.rows,
      }
      const r = await saveTimeboxTemplate(
        editing.id ? { id: editing.id, ...input } : input,
      )
      if (!r.success) {
        toast.error(r.error ?? '保存失败')
        return
      }
      toast.success('模板已保存')
      if (r.data) {
        setTemplates((prev) => {
          const exists = prev.some((t) => t.id === r.data!.id)
          return exists ? prev.map((t) => (t.id === r.data!.id ? r.data! : t)) : [...prev, r.data!]
        })
      }
      setEditing(null)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  // ─── 删除 ────────────────────────────────────────────────────
  async function handleConfirmDelete() {
    if (!pendingDeleteId) return
    const r = await deleteTimeboxTemplate(pendingDeleteId)
    if (r.success) {
      setTemplates((prev) => prev.filter((t) => t.id !== pendingDeleteId))
      toast.success('模板已删除')
    } else {
      toast.error(r.error ?? '删除失败')
    }
    setPendingDeleteId(null)
  }

  const pendingDeleteTemplate = pendingDeleteId
    ? templates.find((t) => t.id === pendingDeleteId)
    : null

  return (
    <div className="flex flex-col gap-4 w-full">
      <PageBanner domainId="timebox" title="时间盒模板" />

      <div className="flex items-center justify-between px-4">
        <h1 className="text-base font-display text-ink">时间盒模板</h1>
        <Button
          size="sm"
          onClick={() => {
            void ensureSources()
            setEditing({ ...blankTemplate(), rows: seedTemplateRows() })
          }}
        >
          <Plus className="size-4 mr-1" />
          新建模板
        </Button>
      </div>

      {/* 列表 */}
      <div className="px-4 pb-6">
        {templates.length === 0 ? (
          <EmptyState
            icon={LayoutTemplate}
            title="还没有模板"
            description="新建一个时间盒模板，定义应用范围与时间安排行"
            action={{
              label: '新建模板',
              onClick: () => {
                void ensureSources()
                setEditing({ ...blankTemplate(), rows: seedTemplateRows() })
              },
            }}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {templates.map((t) => (
              <TemplateCard
                key={t.id}
                template={t}
                onEdit={() => {
                  void ensureSources()
                  setEditing({ ...t, rows: t.rows.map((r) => ({ ...r })) })
                }}
                onDelete={() => setPendingDeleteId(t.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* 编辑/新建 抽屉 */}
      <Sheet open={editing !== null} onOpenChange={(open) => { if (!open) setEditing(null) }}>
        <SheetContent side="right" className="sm:max-w-[560px] px-6 py-6 flex flex-col">
          <SheetHeader>
            <SheetTitle>{editing?.id ? '编辑模板' : '新建模板'}</SheetTitle>
          </SheetHeader>
          {editing && (
            <TemplateEditForm
              key={editing.id || 'new'}
              template={editing}
              sources={sources}
              onChange={setEditing}
              onSave={handleSave}
              onCancel={() => setEditing(null)}
              saving={saving}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* 删除确认 */}
      <AlertDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => !open && setPendingDeleteId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除时间盒模板？</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingDeleteTemplate
                ? `即将删除 "${pendingDeleteTemplate.name || '未命名'}"。此操作不可撤销。`
                : '确认删除？'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              <Trash2 className="size-3 mr-1" />
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

// ─── 行编辑器（抽屉内部）─────────────────────────────────────
function TemplateEditForm({
  template,
  sources,
  onChange,
  onSave,
  onCancel,
  saving,
}: {
  template: TimeboxTemplate
  sources: SubscriptionSources | null
  onChange: (t: TimeboxTemplate) => void
  onSave: () => void
  onCancel: () => void
  saving: boolean
}) {
  // 已按 start 排序供展示
  const sortedRows = useMemo(() => sortRowsByStart(template.rows), [template.rows])

  function toggleWeekday(value: number) {
    const set = new Set(template.daysOfWeek)
    if (set.has(value)) set.delete(value)
    else set.add(value)
    const arr = [...set].sort((a, b) => a - b)
    onChange({ ...template, daysOfWeek: arr })
  }

  function updateRow(id: string, patch: Partial<TemplateRow>) {
    onChange({
      ...template,
      rows: template.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    })
  }

  function deleteRow(id: string) {
    onChange({ ...template, rows: template.rows.filter((r) => r.id !== id) })
  }

  function addRow() {
    onChange({ ...template, rows: [...template.rows, blankTemplateRow()] })
  }

  function changeRowSource(id: string, newSource: TemplateRowSource, newSourceId?: string) {
    const row = template.rows.find((r) => r.id === id)
    if (!row) return
    if (newSource === 'habit' && newSourceId && sources) {
      const h = sources.habits.find((x) => x.id === newSourceId)
      if (h) {
        onChange({
          ...template,
          rows: template.rows.map((r) =>
            r.id === id ? { ...r, source: 'habit', sourceId: newSourceId, activityName: h.title, start: h.start, end: h.end } : r,
          ),
        })
        return
      }
    }
    if ((newSource === 'task' || newSource === 'thread') && newSourceId && sources) {
      const list: SourceItem[] = newSource === 'task' ? sources.tasks : sources.threads
      const item = list.find((x) => x.id === newSourceId)
      if (item) {
        onChange({
          ...template,
          rows: template.rows.map((r) =>
            r.id === id ? { ...r, source: newSource, sourceId: newSourceId, activityName: item.title } : r,
          ),
        })
        return
      }
    }
    // custom 或 sources 未就绪
    onChange({
      ...template,
      rows: template.rows.map((r) =>
        r.id === id ? { ...r, source: newSource, sourceId: undefined, activityName: r.activityName } : r,
      ),
    })
  }

  return (
    <div className="flex flex-col gap-4 mt-4 flex-1 overflow-y-auto">
      {/* 名称 */}
      <label className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">模板名称</span>
        <input
          value={template.name}
          placeholder="如：工作日模板"
          onChange={(e) => onChange({ ...template, name: e.target.value })}
          className="h-8 rounded-md border border-hairline bg-canvas px-2 text-sm text-ink"
        />
      </label>

      {/* 星期 */}
      <div className="flex flex-col gap-1">
        <span className="text-xs text-muted-foreground">应用范围（可多选；全不选=不限）</span>
        <div className="flex flex-wrap gap-1">
          {WEEKDAY_LABELS.map((w) => {
            const on = template.daysOfWeek.includes(w.value)
            return (
              <button
                key={w.value}
                type="button"
                onClick={() => toggleWeekday(w.value)}
                className={
                  on
                    ? 'rounded px-2 py-0.5 text-xs bg-primary text-primary-foreground'
                    : 'rounded px-2 py-0.5 text-xs bg-surface-card text-body border border-hairline'
                }
              >
                {w.long}
              </button>
            )
          })}
        </div>
      </div>

      {/* 行列表 */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">时间安排行（{template.rows.length}）</span>
          <Button size="sm" variant="outline" onClick={addRow}>
            <Plus className="size-3 mr-1" />
            新增一行
          </Button>
        </div>

        {sortedRows.length === 0 && (
          <p className="text-xs text-muted-foreground">暂无行，点击「新增一行」开始添加</p>
        )}

        {sortedRows.map((r) => {
          const isHabit = r.source === 'habit'
          const isObjectSource = r.source === 'habit' || r.source === 'task' || r.source === 'thread'
          const sourceList: Array<{ id: string; title: string }> | null =
            !sources ? null :
            r.source === 'habit' ? sources.habits :
            r.source === 'task' ? sources.tasks :
            r.source === 'thread' ? sources.threads : []
          return (
            <div key={r.id} className="flex flex-col gap-1 rounded border border-hairline bg-surface-card p-2">
              <div className="flex items-center gap-1 flex-wrap">
                {/* 来源下拉 */}
                <select
                  value={r.source}
                  onChange={(e) => changeRowSource(r.id, e.target.value as TemplateRowSource)}
                  className="h-7 rounded border border-hairline bg-canvas px-1 text-xs text-ink"
                >
                  <option value="custom">自定义</option>
                  <option value="habit">习惯</option>
                  <option value="task">任务</option>
                  <option value="thread">主线</option>
                </select>

                {/* 活动名称 / 来源对象选择 */}
                {isObjectSource && sourceList ? (
                  <select
                    value={r.sourceId ?? ''}
                    onChange={(e) => changeRowSource(r.id, r.source, e.target.value || undefined)}
                    className="h-7 flex-1 min-w-0 rounded border border-hairline bg-canvas px-1 text-xs text-ink"
                  >
                    <option value="">— 选择{r.source === 'habit' ? '习惯' : r.source === 'task' ? '任务' : '主线'} —</option>
                    {sourceList.map((it) => (
                      <option key={it.id} value={it.id}>{it.title}</option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={r.activityName}
                    placeholder="活动名称"
                    onChange={(e) => updateRow(r.id, { activityName: e.target.value })}
                    className="h-7 flex-1 min-w-0 rounded border border-hairline bg-canvas px-1 text-xs text-ink"
                  />
                )}

                {/* 起止 */}
                <input
                  type="time"
                  value={r.start}
                  disabled={isHabit}
                  onChange={(e) => updateRow(r.id, { start: e.target.value })}
                  className="h-7 rounded border border-hairline bg-canvas px-1 text-xs text-ink disabled:opacity-60"
                />
                <span className="text-xs text-muted-foreground">—</span>
                <input
                  type="time"
                  value={r.end}
                  disabled={isHabit}
                  onChange={(e) => updateRow(r.id, { end: e.target.value })}
                  className="h-7 rounded border border-hairline bg-canvas px-1 text-xs text-ink disabled:opacity-60"
                />

                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive h-7 px-2"
                  onClick={() => deleteRow(r.id)}
                  aria-label="删除行"
                >
                  <Trash2 className="size-3" />
                </Button>
              </div>

              {r.source !== 'custom' && !r.sourceId && (
                <p className="text-[10px] text-muted-foreground">请选择来源对象</p>
              )}
            </div>
          )
        })}
      </div>

      {/* 操作 */}
      <div className="flex justify-end gap-2 pt-2 border-t border-hairline">
        <Button size="sm" variant="secondary" onClick={onCancel}>
          取消
        </Button>
        <Button size="sm" onClick={onSave} disabled={!template.name.trim() || saving}>
          {saving ? (
            <>
              <Loader2 className="mr-1 size-3 animate-spin" />
              保存中
            </>
          ) : (
            '保存'
          )}
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 9.3: 跑 tsc + 单测**

```bash
cd frontend && npx tsc --noEmit && npm test -- timebox
```

**Expected**：tsc 通过；所有 timebox 相关测试 PASS（vitest base=head 零新增 = 0）。

- [ ] **Step 9.4: 视觉验证（/browse）**

启动 dev server：

```bash
cd frontend && npm run dev
```

用 /browse 打开 `/timebox-templates`（或 GrowthMenu 入口的 action `configTimeboxTemplates`），截图验证：
- 宽度自适应（拖窗到不同宽度观察 1/2/3 列切换）
- 卡片样式（hover/视觉对齐 HabitCard）
- 点击「编辑」→ 右侧抽屉滑出（Sheet）
- 抽屉内：名称输入、星期 chips、7 段行、来源下拉、起止时间可编辑
- 来源切到「习惯」时，名称变下拉、起止时间只读；选择具体习惯后名称自动填 + 起止自动填
- 「还有 N 条」截断 + hover 弹完整列表

- [ ] **Step 9.5: Commit**

```bash
git add src/domains/timebox/components/timebox-template-editor.tsx
git commit -m "feat(timebox): [023-02] 编辑器：PageBanner + TemplateCard 列表 + Sheet 抽屉

宽度自适应；星期多选；行列表来源切换（habit 锁时）；7 段 seed。

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 10: 页面容器收尾

**Files:**
- Modify: `frontend/src/domains/timebox/pages/TimeboxTemplatesPage.tsx`
- Modify: `frontend/src/app/timebox-templates/page.tsx`

**Interfaces:** 无（仅外层容器）。

### Steps

- [ ] **Step 10.1: 检查并精简内嵌 page**

定位 `frontend/src/domains/timebox/pages/TimeboxTemplatesPage.tsx`——其当前外层 `h-full flex flex-col` 与 Task 9 重写后的编辑器 `flex flex-col gap-4 w-full` 一致。**无需改动**，除非 /browse 视觉显示有 padding 问题（若需要可加 `p-0`）。先 git diff 确认无错。

- [ ] **Step 10.2: 检查路由 page**

定位 `frontend/src/app/timebox-templates/page.tsx`——其外层 `h-screen flex flex-col`，新版编辑器自带头部 + 滚动。改为：

```tsx
/**
 * @file page
 * @brief 时间盒模板配置页（[023-02]）
 */
import { TimeboxTemplateRepository } from '@/lib/db/repositories/timebox-template'
import { TimeboxTemplateEditor } from '@/domains/timebox/components/timebox-template-editor'

export default async function TimeboxTemplatesPage() {
  const repo = new TimeboxTemplateRepository()
  const templates = await repo.findByUser('00000000-0000-0000-0000-000000000001') // MVP 固定用户

  return (
    <div className="min-h-full flex flex-col">
      <TimeboxTemplateEditor initialTemplates={templates} />
    </div>
  )
}
```

- [ ] **Step 10.3: tsc + 视觉验证**

```bash
cd frontend && npx tsc --noEmit
```

然后 /browse 打开 `/timebox-templates` 验证宽度自适应 + 卡片网格 + 抽屉。

- [ ] **Step 10.4: Commit**

```bash
git add frontend/src/domains/timebox/pages/TimeboxTemplatesPage.tsx \
        frontend/src/app/timebox-templates/page.tsx
git commit -m "chore(timebox): [023-02] 页面容器适配新编辑器

min-h-full 替代 h-screen 避免内部 PageBanner 截断。

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 11: 端到端验证与收尾

**Files:** 无新增（验证 + 可能补 commit）

### Steps

- [ ] **Step 11.1: 全量验证**

```bash
cd frontend
npx tsc --noEmit
npm run lint
npm test
npm run validate:manifest
```

**Expected**：
- tsc base=head 零新增错误
- vitest base=head 零新增失败（基线：1468 PASS / 32 pre-existing FAIL；新测约 +7 — 关注 32→32 不新增）
- lint 0 error
- validate:manifest 0 errors

- [ ] **Step 11.2: 浏览器 E2E（/browse）**

按 Task 9.4 场景跑一遍：
1. 列表空态 → 新建模板 → 默认 7 段填充
2. 抽屉内改名称、改星期、增/删行、改来源
3. 来源=habit 时起止锁时；切回 custom 恢复可编辑
4. 保存 → 卡片列表展示新模板
5. 卡片截断 > 4 行 + hover 完整列表
6. 编辑现有模板 → 改完保存 → 卡片更新
7. 删除 → AlertDialog 二次确认 → 卡片消失

- [ ] **Step 11.3: 同步 dev DB 真实数据测试**

如本地 dev DB 已有模板，验证迁移后回填正确：

```bash
psql "postgres://lifeware_dev@localhost:5432/lifeware_dev" \
  -c "SELECT name, jsonb_array_length(rows) AS n, days_of_week FROM timebox_templates;"
```

**Expected**：旧模板 `n = 7`，`days_of_week = [0,1,2,3,4,5,6]`，每个 row 的 `source='custom'`，`activityName` 对应段名（起床/晨间/…）。

- [ ] **Step 11.4: 提交遗漏（如有）**

如有遗漏的格式/注释/边界修复，单独 commit。无可不改。

- [ ] **Step 11.5: 提 PR 摘要**

输出 `feat/023-02-timebox-template` 分支的 commit 列表、影响面、测试覆盖，作为 PR 描述输入。

---

## Self-Review（写完检查）

- ✅ 需求 1（宽度自适应 + Sheet 抽屉）→ Task 9 + Task 10。
- ✅ 需求 2（应用范围星期）→ Task 6 + Task 9 抽屉 + Task 7 卡片 chips。
- ✅ 需求 3（卡片 + 截断 hover）→ Task 7。
- ✅ 需求 4（完全可编辑行 + 来源）→ Task 9 `TemplateEditForm` + Task 8 habit start/end。
- ✅ 数据模型（rows + daysOfWeek 替换旧列）→ Task 1-4。
- ✅ 旧 7 段回填 / 旧订阅丢弃 → Task 2 SQL。
- ✅ Tier 2 文档同步 → Task 1。
- ✅ A3 owner-check 遍历 rows → Task 4 + Task 5 测试。
- ✅ UI-DESIGN-SPEC（CSS 变量令牌、Sheet 原语）→ Task 7 + Task 9 全面使用 `bg-canvas` / `text-ink` / `border-hairline` / `bg-surface-card` / `text-muted-foreground` / `bg-primary` / `bg-destructive`。
- ✅ TDD：template-row-helpers / template-card / repository 都有先红后绿。
- ✅ TDD 不可行部分（视觉、Sheet 滑出、SQL 迁移）走 /browse + psql 验证。
- ✅ commit 频率、commit 规范、Co-Authored。
- ✅ 类型一致：`TemplateRow` 在 schema.ts 定义，repository re-import；`WEEKDAY_LABELS.value` 0-6；`MAX_VISIBLE_ROWS=4` 在 Task 7 单测与组件使用。
- ✅ 0 占位：每个代码块都给到完整代码；每个命令都给到 expected。
- ✅ 文件路径全部绝对。

---

## Review Decisions Applied（2026-07-04 plan-eng-review）

本节是 `/plan-eng-review` 走完 4 节（架构 3 / 代码 4 / 测试 4 / 性能 2 = 13 决议）+ Codex outside voice（4 决议）后的 **17 项实施级 delta**。实施时按原 11 任务顺序执行，把每条 delta 折入对应任务；不改原任务结构，但补/改 step 即可。

### A. 架构（3 决议）

**A.1 迁移加 down.sql + 迁移前 dump（决议 1.1）**
- **影响任务**：Task 2
- **新增文件**：
  - `src/lib/db/migrations/0032_023_02_timebox_template_redesign.down.sql`：反向 `ADD COLUMN survival_segments jsonb NOT NULL DEFAULT '{}'::jsonb` + 3 个 `subscribed_*` 数组空列 + 重建 `idx_timebox_templates_user`。**不回填旧数据**（已丢，回滚只能防止 schema 漂移）。
- **新增步骤**（在 Task 2 之前）：
  - `pg_dump -t timebox_templates lifeware_dev > /tmp/timebox_templates-pre-0032.sql` 备份一行现状
  - 提交 `/tmp/*.sql` 暂不入库（仅本地）
- **Commit 变更**：把 down.sql 一起加进 Task 2.4 commit。

**A.2 `update()` 在 rows 未变时跳过 owner-check（决议 1.2）**
- **影响任务**：Task 4
- **改动点**：Task 4.4 `update()` 方法，**先** `findById` 拿 `old`，比较 `old.rows === input.rows`（引用相等——editor 总是用新数组 setState，可靠 sentinel），相等则跳过 `assertSubscriptionsOwned`。
- **新增测试**：在 Task 5.3 之后补一个 `update` describe，3 个用例：happy / rows 变化触发 owner-check / rows 不变跳过 owner-check。
- **注释补强**：在 `assertSubscriptionsOwned` 上方加 `// 仅在 rows 结构变化时由 update()/create() 调用——rows 未变时跳过可避免 3 张表的全表 inArray。`

**A.3 补紧凑编辑流程 ASCII 图（决议 1.3）**
- **影响任务**：Task 9 开头
- **新增内容**（紧跟 Task 9 文件清单之后，描述块之前）：
  ```
  TemplateEditForm 数据流：
  PageBanner
    └─► TemplateCard 网格（width 自适应，1/2/3 列）
          └─► 点击「编辑」onEdit() 触发：
                ├─► ensureSources() [fire-and-forget, 1 min cache]
                │     └─► fetchSubscriptionSources (server action)
                │           └─► setSources({habits, tasks, threads})
                └─► setEditing(template) → Sheet.open = true
                      └─► TemplateEditForm (独立组件)
                            ├─► onChange={(t) => setEditing(t)} → setState 全模板引用替换
                            ├─► 行内 onChange → updateRow(id, patch) → setState 新 rows 数组
                            ├─► 来源下拉 changeRowSource(id, source, sourceId?) → resolve from sources
                            └─► onSave → saveTimeboxTemplate → repo.create/update → 乐观 setTemplates → setEditing(null)
  ```

### B. 代码质量（4 决议）

**B.1 行 `<select>` 在 sources 未就绪时禁用（决议 2.1）**
- **影响任务**：Task 9
- **改动点**：`TemplateEditForm` 中所有「来源」`<select>` 元素加 `disabled={sources === null}`，并在其右侧加 `{sources === null ? '加载订阅源…' : ''}` 小字。
- **理由**：防止 fire-and-forget 竞态导致用户切到 habit 看到空下拉。

**B.2 TemplateEditForm 不再排序行展示（决议 2.2）**
- **影响任务**：Task 9
- **改动点**：删除 `TemplateEditForm` 内的 `const sortedRows = useMemo(() => sortRowsByStart(template.rows), [template.rows])`，改用 `template.rows` 直接渲染（保持用户编辑顺序）。
- **保留**：`TemplateCard` 仍调 `sortRowsByStart` 用于展示。

**B.3 DEFAULT_SEGMENT_SEED 单点维护 + SQL KEEP IN SYNC（决议 2.3）**
- **影响任务**：Task 6 + Task 2
- **改动点**：
  - 在 `template-row-helpers.ts` 新增 `export const DEFAULT_SEGMENT_SEED: ReadonlyArray<{ activityName: string; start: string; end: string }> = [...]`（7 段硬编码）
  - `seedTemplateRows` 改为 `DEFAULT_SEGMENT_SEED.map(s => ({ id, source: 'custom', ...s }))`
  - 0032 SQL 的 `v_default jsonb_build_array(...)` 块上方加注释：`-- KEEP IN SYNC WITH frontend/src/domains/timebox/lib/template-row-helpers.ts:DEFAULT_SEGMENT_SEED`
  - `template-row-helpers.test.ts` 补一个用例：遍历 `DEFAULT_SEGMENT_SEED` 与 SQL 注释指针的 link 一致（实际只测长度 7 + 第 0 项是「起床/07:00/07:30」即可保证同步不被无声改动）。

**B.4 `addMinutesToHHMM` 抽出到 helpers + 4 单测（决议 2.4 + 3.4）**
- **影响任务**：Task 6 + Task 8
- **改动点**：
  - 在 `template-row-helpers.ts` 新增 `export function addMinutesToHHMM(hhmm: string, minutes: number): string`
  - `app/actions/timebox-templates.ts` 删除内联 `addMinutesToHHMM`，改 `import { addMinutesToHHMM } from '@/domains/timebox/lib/template-row-helpers'`
  - `template-row-helpers.test.ts` 补 4 个用例：
    - 正常：`addMinutesToHHMM('06:00', 60) === '07:00'`
    - 跨午夜：`addMinutesToHHMM('23:00', 120) === '01:00'`
    - 24h×N 归一：`addMinutesToHHMM('06:00', 1440) === '06:00'`
    - 0 加成：`addMinutesToHHMM('06:00', 0) === '06:00'`
  - **同时改决议 1.1（Codex 之外 + cross-2）**：`blankTemplateRow` 重命名为 `newEmptyRow`（消除与编辑器内 `blankTemplate()` 整模板的命名混淆）。所有引用点同步改：`template-row-helpers.ts` 导出 + `timebox-template-editor.tsx` import + 测试。

### C. 测试（4 决议）

**C.1 补 3 个 `update()` 测试（决议 3.1 + A.2 一并）**
- **影响任务**：Task 5
- **新增内容**（在 Task 5.3 之后）：
  ```ts
  describe('update', () => {
    it('应能在 rows 未变时只改 name 且不触发 owner-check', async () => {
      // mocks: findById returning FAKE_TEMPLATE_ROW
      // assert: txSelect.calledTimes(0)  // owner-check SKIPPED
      // assert: txUpdate called once
    })
    it('应能在 rows 变化时触发 owner-check', async () => {
      // mocks: findById, then owner-check habits select, then update
      // assert: txSelect called for habits
    })
    it('A3 owner-check：rows 中 habit 跨用户应抛出', async () => {
      // similar to create cross-user test but on update path
    })
  })
  ```

**C.2 TemplateCard popover 内容点击测试（决议 3.2）**
- **影响任务**：Task 7
- **新增用例**：
  ```ts
  it('点击「还有 N 条」应展开 Popover 并显示完整行列表', async () => {
    // 6 rows setup
    // click on the trigger
    // assert: rows[4] and rows[5] (originally hidden) are now in document
  })
  ```

**C.3 TemplateEditForm 抽为独立组件 + 独立单测（决议 3.3）**
- **影响任务**：Task 9
- **改动点**：
  - 新文件 `src/domains/timebox/components/template-edit-form.tsx`：把 Task 9.2 的 `TemplateEditForm` 函数体搬过来，props 维持 `{ template, sources, onChange, onSave, onCancel, saving }`。
  - `timebox-template-editor.tsx` 删除 `TemplateEditForm` 函数，import 抽出版本。
  - 新文件 `src/domains/timebox/components/__tests__/template-edit-form.test.tsx`：覆盖：
    - 渲染：name 框 + 7 个 weekday chips + 行列表
    - 来源下拉：在 `sources === null` 时所有来源 select `disabled`
    - 切来源 → 输入 resolver：mock sources，changeRowSource('habit', 'h-1') 后该行 activityName 变 h.title、start/end 变 h.start/h.end
    - 删行：点 trash icon → rows 少 1
    - 新增行：点 + → rows 多 1（newEmptyRow 默认）

**C.4 addMinutesToHHMM 4 用例（决议 3.4）**
- 已在 B.4 内列。

### D. 性能（2 决议）

**D.1 React.memo + 稳定行 key（决议 4.1）**
- **影响任务**：Task 9
- **改动点**：
  - `TemplateEditForm` 内联行元素抽为 `RowEditor` 子组件，包裹 `React.memo`。
  - props 仅 `{ row, sources, onUpdate, onDelete, onSourceChange }`（不含整个 `template`），父组件 name 输入时不会触发子组件 re-render。
  - `template-row-helpers.ts:genRowId` 已在用 `crypto.randomUUID()`，保证行 id 跨 setState 稳定。

**D.2 1 分钟 in-memory cache（决议 4.2）**
- **影响任务**：Task 8
- **改动点**：在 `app/actions/timebox-templates.ts` 文件顶部加 `let _sourcesCache: { at: number; data: SubscriptionSources } | null = null`，`fetchSubscriptionSources` 入口处：`if (_sourcesCache && Date.now() - _sourcesCache.at < 60_000) return { success: true, data: _sourcesCache.data }`。这能让编辑器二次打开走 in-memory 0 DB 命中。
- **注释**：`MVP in-memory;后续接 SWR 替代`。

### E. Outside Voice 跨模型（4 决议）

**E.1 blankTemplateRow → newEmptyRow 重命名（决议 Cross-1）**
- 已在 B.4 内列。

**E.2 SQL 迁移用 `md5(segment_key)` 稳定 row id（决议 Cross-2）**
- **影响任务**：Task 2
- **改动点**：0032 SQL 的 `v_default jsonb_build_array(...)` 块改为
  ```sql
  v_default jsonb := jsonb_build_array(
    jsonb_build_object('id', md5('seg-wake')::text,    'activityName', '起床',    'start', '07:00', 'end', '07:30', 'source', 'custom'),
    jsonb_build_object('id', md5('seg-morning')::text,  'activityName', '晨间',    'start', '07:30', 'end', '09:00', 'source', 'custom'),
    jsonb_build_object('id', md5('seg-workAm')::text,   'activityName', '上午上班','start', '09:00', 'end', '12:00', 'source', 'custom'),
    jsonb_build_object('id', md5('seg-noon')::text,     'activityName', '午间',    'start', '12:00', 'end', '13:30', 'source', 'custom'),
    jsonb_build_object('id', md5('seg-workPm')::text,   'activityName', '下午上班','start', '13:30', 'end', '18:00', 'source', 'custom'),
    jsonb_build_object('id', md5('seg-evening')::text,  'activityName', '晚间',    'start', '18:00', 'end', '23:00', 'source', 'custom'),
    jsonb_build_object('id', md5('seg-sleep')::text,    'activityName', '睡眠',    'start', '23:00', 'end', '07:00', 'source', 'custom')
  );
  ```
- **理由**：迁移重跑 / 同 dev DB 多次执行，row id 永远稳定，未来若做 row 级引用（如模板行继承）可锁住。

**E.3 Source 重命名陈旧名 = MVP 接受（决议 Cross-3）**
- **影响任务**：无（仅文档）
- **改动点**：在 §0 spec 已有「activityName 是创建/编辑时快照」声明下，再在本文「NOT in scope」节补一行：
  > 习惯/任务/主线重命名后，模板行 `activityName` 不会自动同步——MVP 接受。修复路径是用户编辑模板后重新选择来源对象（changeRowSource 会重新 resolve）。

**E.4 Task 0: baseline 验证（决议 Cross-4）**
- **影响任务**：新增 Task 0，置于 Task 1 之前
- **内容**：
  ```
  ### Task 0: 验证 baseline 测试数
  
  **Files:** 无。
  
  - [ ] **Step 0.1: 跑 baseline 测试**
  
  ```bash
  cd frontend
  npm test 2>&1 | tee /tmp/baseline-test.log
  ```
  
  **Expected**：记录 PASS 数 N_baseline 与 pre-existing FAIL 集合（实测：**1468 PASS / 32 pre-existing FAIL / 20 skipped / 5 todo** — 1525 总测试）。后续 Task 11 验证 "base=head 零新增 FAIL" 以本次 32 个 pre-existing FAIL 集合为参照；任何新增 FAIL 都是回归，禁止用 plan 推断值 17 作为 barrier（plan 推断显著低估基线）。
  
  - [ ] **Step 0.2: 记录 baseline + 确认 Plan 数**
  
  把 `N_baseline` 写到本文「Self-Review」节的「vitest baseline」行；若 N_baseline 偏离 17 超过 ±2，把 diff 写进 PR description。
  ```

### F. 决议落地总览（17 决议 → 11 任务）

| 决议 | 类型 | 影响任务 | 工作量 |
|---|---|---|---|
| A.1 down.sql + dump | 架构 | Task 2 | ~5min |
| A.2 update() 跳过 owner-check | 架构 | Task 4 + 5 | ~10min |
| A.3 ASCII 编辑流程图 | 架构 | Task 9 | ~3min |
| B.1 sources 未就绪禁用 | 代码 | Task 9 | ~5min |
| B.2 编辑器不排序 | 代码 | Task 9 | ~2min |
| B.3 DEFAULT_SEGMENT_SEED + KEEP IN SYNC | 代码 | Task 6 + 2 | ~5min |
| B.4 + E.1 addMinutesToHHMM 抽 + 4 测试 + 重命名 | 代码 | Task 6 + 8 | ~10min |
| C.1 3 个 update() 测试 | 测试 | Task 5 | ~10min |
| C.2 popover 内容点击测试 | 测试 | Task 7 | ~5min |
| C.3 TemplateEditForm 抽 + 单测 | 测试 | Task 9 | ~15min |
| C.4 addMinutes 4 用例 | 测试 | Task 6 | ~5min |
| D.1 React.memo + 稳定 key | 性能 | Task 9 | ~8min |
| D.2 1min in-memory cache | 性能 | Task 8 | ~5min |
| E.2 md5 稳定 row id | 跨模型 | Task 2 | ~3min |
| E.3 stale name 文档化 | 跨模型 | NOT in scope | ~1min |
| E.4 Task 0 baseline | 跨模型 | 新增 Task 0 | ~2min |
| T.scoping 总开销 | — | — | ~93min（增量） |

实施时按 11 任务 + Task 0 顺序执行，每条决议在对应 task 落地；本节作为"实施补丁"。

---

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | not run (pure refactor, no scope change) |
| Codex Review | `/codex review` | Independent 2nd opinion | 1 | issues_absorbed | 10 findings; 6 meta-aligned with review decisions, 4 unique: naming collision (→E.1), stable IDs (→E.2), stale names (→E.3), baseline verification (→E.4) |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEARED | 13 issues + 4 outside-voice = 17 decisions, all folded into "Review Decisions Applied" section above |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | not run (this review covers UI; plan-eng-review already covered design tokens, Sheet, popover, width-adaptive) |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | not run (no new dev infra introduced) |

- **CODEX:** absorbed — 6 findings were already in 13-issue review (down.sql / update skip / tests / DEFAULT_SEGMENT_SEED / KEEP IN SYNC / addMinutes tests); 4 unique findings (naming, stable IDs, stale names, baseline) added as E.1–E.4.
- **CROSS-MODEL:** Claude + Codex agree on: (a) migration rollback needed, (b) update() needs tests including rows-unchanged skip, (c) cross-midnight is a real edge, (d) baseline must be measured. No disagreement on a single architectural call.
- **VERDICT:** CEO + ENG CLEARED — ready to implement. (no CEO run needed for pure refactor scope)

**UNRESOLVED DECISIONS:**
- *(none)* — all 17 decisions accepted by user, all folded into the "Review Decisions Applied" section above. The "Failure modes" section flagged code-DB desync as a real silent-empty-state risk; this is accepted as MVP scope (atomic prod migrations, dev-only concern).
