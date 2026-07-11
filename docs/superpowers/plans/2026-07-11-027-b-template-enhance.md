# [027-B] 时间盒模板增强 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 Timebox 模板行 `TemplateRow` 从「固定时段 `{start,end}`」重构为「带约束的可调度活动 `{defaultStart, defaultDuration, earliestStart, latestStart, shortestDuration, activityArchetypeId}`」，列表显示原型/来源徽章，编辑器多行卡片化 + 行为按来源分叉（custom 可编辑原型与全部时间字段；来源行原型只读派生）。

**Architecture:** JSONB 行内对象字段变更，**无 DDL、无列级 schema 变更**，绕开 drizzle snapshot 债。仓库 `rowToTemplate` 读时 lazy 自愈旧形状。UI 复用 Phase A 统一的 `ArchetypePicker`（custom 行 `variant=inline` 可编辑 + AI 匹配；来源行 `readOnly` 派生展示）。设计 SSOT = `docs/superpowers/specs/2026-07-11-027-activity-archetype-ui-standardization-design.md` §3（已批准）。

**Tech Stack:** Next.js 16.1.6 / React 19.2.3 / TypeScript 5 / Drizzle ORM 0.45.1 / PostgreSQL jsonb；vitest + tsc 双验证；shadcn/ui + CSS 变量令牌。

## Global Constraints

- **时间格式**：时间字段一律 `"HH:MM"`（零填充，HTML `<input type="time">`）；时长字段一律整数分钟。
- **无 DDL**：仅 `timebox_templates.rows` jsonb 行内对象字段变更，不动列；不动历史迁移 `0032`（已应用、不可变），旧形状靠读时自愈。
- **3-state archetype 语义**（Phase A 沉淀）：行内 `activityArchetypeId` 用 `string | null`（`null`=已清除、`undefined`/缺省=未设置）；`ArchetypePicker.onChange(undefined)`→消费方转 `null` 落库。
- **Tier 2 文档同步强制**（`docs/` 必须与代码一致）：Task 6 同步 `database-design.md` + `usom-design.md` + `CHANGELOG.md` + `manifest.md`。
- **验证双跑**：vitest 在 `frontend/` cwd 跑（`@/` 映射）；tsc `--noEmit` 跑 changed files；baseline=head 零新增失败/错误（见 [[feedback_vitest-pitfalls]]、[[feedback_change-gate-baseline]]）。
- **pre-push hooks**：`validate:manifest` + `validate:structure` 必须全过。
- **UI 令牌**：只用 CSS 变量类（`bg-canvas` / `text-ink` / `border-hairline` / `text-muted-foreground` 等），禁 Tailwind 默认颜色（UI-DESIGN-SPEC §14）。
- **注释规范**：所有 TS/JS 文件保持 `/** @file ... @brief ... */` 头；注释用简体中文；改动同步注释（`docs/code-commenting-guide.md`）。
- **合并纪律**：可 commit + push；严禁自 merge；PR 由用户在 gitee 网页确认（[[feedback_no-self-merge]]）。
- **分支**：`feat/027-b-template-enhance`（已从最新 main 切出，含 Phase A）。

---

## ⚠️ 设计精炼标记（reviewer 必读）

spec §3.4 原文「habit/task/thread 行：时间字段只读展示来源锁定值」**过度泛化**：task/thread **没有时间来源**（不像 habit 有 `defaultTime/defaultDuration`），当前代码也只锁 habit 时间。本计划采用的**正确行为矩阵**：

| source | archetype | defaultStart / defaultDuration | earliestStart / latestStart / shortestDuration |
|---|---|---|---|
| `custom` | 可编辑（`ArchetypePicker inline` + AI） | 可编辑 | 可编辑 |
| `task` | 只读（从 `task.activityArchetypeId` 派生） | 可编辑（来源无时间） | 可编辑 |
| `thread` | 只读（thread 无原型→空） | 可编辑（来源无时间） | 可编辑 |
| `habit` | 只读（从 `habit.activityArchetypeId` 派生） | **只读**（锁定自 `habit.defaultTime/defaultDuration`） | 只读（时间已锁，约束无意义） |

即「原型非 custom 不可改」（落实需求 §3）保留；但「时间只读」**仅 habit**（与现状一致，避免 task/thread 锁死无来源时间）。若 reviewer/用户坚持 spec §3.4 字面（task/thread 时间也只读），在 Task 5 把 `isObjectSource` 的禁用条件改回 `isHabit`→`row.source!=='custom'` 即可。**Task 5 默认按本矩阵实现。**

---

## File Structure

| 文件 | 责任 | 动作 |
|---|---|---|
| `frontend/src/lib/db/schema.ts` | `TemplateRow` interface（SSOT 类型） | 改字段 |
| `frontend/src/domains/timebox/lib/template-row-helpers.ts` | 行纯函数（seed/sort/校验/自愈） | 改 + 新增 3 fn |
| `frontend/src/lib/db/repositories/timebox-template.ts` | 仓储 rowToTemplate 读时自愈 | 改 1 处 |
| `frontend/src/app/actions/timebox-templates.ts` | `SubscriptionSources` 带 archetypeId | 改 |
| `frontend/src/domains/timebox/components/template-card.tsx` | 列表行展示（原型/来源徽章） | 改 |
| `frontend/src/domains/timebox/components/template-edit-form.tsx` | RowEditor 多行卡片 + 行为分叉 | 改 |
| `frontend/src/domains/timebox/components/timebox-template-editor.tsx` | 拉 archetype Map 传给 card | 改 |
| `docs/database-design.md` / `docs/usom-design.md` | Tier 2 字段表 | 改 |
| `CHANGELOG.md` / `manifest.md` | 版本入口 | 改 |
| `frontend/src/lib/db/migrations/0037_optional_backfill_timebox_template_rows.sql` | 可选 prod DML 回填（不登 journal） | 新建（可选） |

测试文件（同步改 + 新增 case）：
- `frontend/src/domains/timebox/lib/__tests__/template-row-helpers.test.ts`
- `frontend/src/domains/timebox/components/__tests__/template-edit-form.test.tsx`
- `frontend/src/lib/db/repositories/__tests__/timebox-template.repository.test.ts`（新建，自愈）
- `frontend/src/app/actions/__tests__/timebox-templates.test.ts`（新建，sources archetypeId）
- `frontend/src/domains/timebox/components/__tests__/template-card.test.tsx`（新建，徽章）

---

## Task 1: TemplateRow 形状重构 + 纯函数（原子，TDD）

**Files:**
- Modify: `frontend/src/lib/db/schema.ts`（`TemplateRow` interface，约 733-741 行）
- Modify: `frontend/src/domains/timebox/lib/template-row-helpers.ts`
- Modify: `frontend/src/domains/timebox/components/template-card.tsx`（仅显示字段改名，徽章留 Task 4）
- Modify: `frontend/src/domains/timebox/components/template-edit-form.tsx`（仅字段改名，重构留 Task 5）
- Test: `frontend/src/domains/timebox/lib/__tests__/template-row-helpers.test.ts`
- Test: `frontend/src/domains/timebox/components/__tests__/template-edit-form.test.tsx`

**Interfaces:**
- Produces: `TemplateRow` 新形状（下示）；`hhmmDiffMinutes(start,end)`、`normalizeTemplateRow(raw)`、`validateTemplateRow(row)`、`sortRowsByDefaultStart(rows)`（改名自 `sortRowsByStart`）。

> 本任务必须**单 commit 原子完成**：改 `TemplateRow` 类型会令所有 `.start`/`.end` 消费方 tsc 报错，故类型 + 全部消费方 + 测试同提交，保持 tsc 绿。

- [ ] **Step 1: 先写/改纯函数测试（红）**

把 `frontend/src/domains/timebox/lib/__tests__/template-row-helpers.test.ts` 整体替换为：

```ts
/**
 * @file template-row-helpers.test
 * @brief 行纯函数单元测试（[023-02] / [027-B] 形状重构）
 */
import { describe, it, expect } from 'vitest'
import {
  WEEKDAY_LABELS,
  DEFAULT_SEGMENT_SEED,
  seedTemplateRows,
  newEmptyRow,
  sortRowsByDefaultStart,
  genRowId,
  addMinutesToHHMM,
  hhmmDiffMinutes,
  normalizeTemplateRow,
  validateTemplateRow,
} from '../template-row-helpers'
import type { TemplateRow } from '@/lib/db/schema'

describe('DEFAULT_SEGMENT_SEED', () => {
  it('应有 7 段且为新形状（defaultStart/defaultDuration）', () => {
    expect(DEFAULT_SEGMENT_SEED).toHaveLength(7)
    expect(DEFAULT_SEGMENT_SEED[0]).toEqual({ activityName: '起床', defaultStart: '07:00', defaultDuration: 30 })
    // 睡眠跨午夜 23:00→07:00 = 480 分钟
    expect(DEFAULT_SEGMENT_SEED[6]).toEqual({ activityName: '睡眠', defaultStart: '23:00', defaultDuration: 480 })
  })
})

describe('seedTemplateRows', () => {
  it('默认返回 7 条 custom 新形状行', () => {
    const rows = seedTemplateRows(() => 'fixed')
    expect(rows).toHaveLength(7)
    expect(rows[0]).toMatchObject({ activityName: '起床', defaultStart: '07:00', defaultDuration: 30, source: 'custom' })
    expect(rows[0]).not.toHaveProperty('start')
    expect(rows[0]).not.toHaveProperty('end')
  })
})

describe('newEmptyRow', () => {
  it('返回 custom 行 09:00 / 60 分钟', () => {
    const r = newEmptyRow(() => 'x')
    expect(r).toMatchObject({ id: 'x', source: 'custom', defaultStart: '09:00', defaultDuration: 60, activityName: '' })
    expect(r).not.toHaveProperty('start')
  })
})

describe('sortRowsByDefaultStart', () => {
  it('按 defaultStart 升序，返回新数组', () => {
    const rows: TemplateRow[] = [
      { id: 'a', activityName: 'a', defaultStart: '12:00', defaultDuration: 60, source: 'custom' },
      { id: 'b', activityName: 'b', defaultStart: '08:00', defaultDuration: 60, source: 'custom' },
    ]
    const sorted = sortRowsByDefaultStart(rows)
    expect(sorted.map((r) => r.id)).toEqual(['b', 'a'])
    expect(sorted).not.toBe(rows)
  })
})

describe('addMinutesToHHMM', () => {
  it('跨午夜 23:00 + 120 = 01:00', () => {
    expect(addMinutesToHHMM('23:00', 120)).toBe('01:00')
  })
})

describe('hhmmDiffMinutes', () => {
  it('正常差：09:00→12:00 = 180', () => {
    expect(hhmmDiffMinutes('09:00', '12:00')).toBe(180)
  })
  it('跨午夜：23:00→07:00 = 480', () => {
    expect(hhmmDiffMinutes('23:00', '07:00')).toBe(480)
  })
  it('同时刻 = 0', () => {
    expect(hhmmDiffMinutes('09:00', '09:00')).toBe(0)
  })
})

describe('normalizeTemplateRow', () => {
  it('新形状直通，缺省约束/archetype 置 null', () => {
    const out = normalizeTemplateRow({ id: 'r1', activityName: '晨跑', defaultStart: '06:00', defaultDuration: 30, source: 'habit', sourceId: 'h1' })
    expect(out).toMatchObject({ id: 'r1', defaultStart: '06:00', defaultDuration: 30 })
    expect(out.earliestStart).toBeNull()
    expect(out.latestStart).toBeNull()
    expect(out.shortestDuration).toBeNull()
    expect(out.activityArchetypeId).toBeNull()
  })
  it('旧形状 {start,end} 自愈为 defaultStart + diff', () => {
    const out = normalizeTemplateRow({ id: 'r2', activityName: '睡眠', start: '23:00', end: '07:00', source: 'custom' })
    expect(out.defaultStart).toBe('23:00')
    expect(out.defaultDuration).toBe(480)
    expect(out.activityArchetypeId).toBeNull()
  })
  it('旧形状保留 archetypeId 若已存在', () => {
    const out = normalizeTemplateRow({ id: 'r3', start: '09:00', end: '10:00', source: 'custom', activityArchetypeId: 'a-1' }) as Record<string, unknown>
    // 旧形状分支不读取 activityArchetypeId（历史数据无此字段），置 null
    expect(out.activityArchetypeId).toBeNull()
  })
  it('空对象兜底为 custom 09:00/0', () => {
    const out = normalizeTemplateRow({})
    expect(out.source).toBe('custom')
    expect(out.defaultStart).toBe('09:00')
  })
})

describe('validateTemplateRow', () => {
  const ok = (r: Partial<TemplateRow>): string[] => validateTemplateRow({ id: 'x', activityName: '', defaultStart: '09:00', defaultDuration: 60, source: 'custom', ...r })

  it('合法行无错', () => {
    expect(ok({})).toEqual([])
  })
  it('defaultDuration <= 0 报错', () => {
    expect(ok({ defaultDuration: 0 }).some((e) => e.includes('默认时长'))).toBe(true)
  })
  it('defaultStart 格式非法报错', () => {
    expect(ok({ defaultStart: '9:00' }).some((e) => e.includes('默认开始时间'))).toBe(true)
  })
  it('earliestStart 晚于 defaultStart 报错', () => {
    expect(ok({ earliestStart: '10:00', defaultStart: '09:00' }).some((e) => e.includes('最早开始'))).toBe(true)
  })
  it('defaultStart 晚于 latestStart 报错', () => {
    expect(ok({ defaultStart: '09:00', latestStart: '08:00' }).some((e) => e.includes('最迟开始'))).toBe(true)
  })
  it('shortestDuration > defaultDuration 报错', () => {
    expect(ok({ shortestDuration: 120, defaultDuration: 60 }).some((e) => e.includes('最短时长'))).toBe(true)
  })
  it('可选约束留空合法', () => {
    expect(ok({ earliestStart: null, latestStart: null, shortestDuration: null })).toEqual([])
  })
})
```

- [ ] **Step 2: 跑测试确认红**

Run: `cd frontend && npx vitest run src/domains/timebox/lib/__tests__/template-row-helpers.test.ts`
Expected: FAIL（新导出名/新函数不存在）。

- [ ] **Step 3: 改 `TemplateRow` 类型**

替换 `frontend/src/lib/db/schema.ts` 中 `TemplateRow` interface（约 733-741 行）为：

```ts
/** 模板中一条时间安排行 [023-02] / [027-B] 形状重构：固定时段→带约束可调度活动 */
export interface TemplateRow {
  id: string
  activityName: string
  /** 默认开始时间 HH:MM（[027-B] 原 start 改名） */
  defaultStart: string
  /** 默认时长（分钟，替代原 end） */
  defaultDuration: number
  /** 最早开始时间 HH:MM，可选约束 [027-B] */
  earliestStart?: string | null
  /** 最迟开始时间 HH:MM，可选约束 [027-B] */
  latestStart?: string | null
  /** 最短时长（分钟），可选约束 [027-B] */
  shortestDuration?: number | null
  /** 关联 Activity Archetype（custom 行可编辑；来源行读时从来源对象派生）[027-B] */
  activityArchetypeId?: string | null
  source: TemplateRowSource
  sourceId?: string
}
```

- [ ] **Step 4: 改 `template-row-helpers.ts`**

整文件替换为（保留 `WEEKDAY_LABELS`、`genRowId`、`addMinutesToHHMM` 原样）：

```ts
/**
 * @file template-row-helpers
 * @brief 时间盒模板行列表的纯函数（[023-02] / [027-B] 形状重构）
 *
 * 0 React 依赖；可被编辑器、TemplateCard、server action、仓储、测试复用。
 * 副作用函数（id 生成）通过参数注入，便于测试时控。
 *
 * [027-B]：TemplateRow 从 {start,end} 改为 {defaultStart,defaultDuration,earliestStart,latestStart,shortestDuration,activityArchetypeId}。
 * DEFAULT_SEGMENT_SEED 与历史迁移 0032 v_default 的 7 段活动/时长在**概念上**一致；
 * 0032 的旧字面形状 {start,end} 由 normalizeTemplateRow 读时自愈——不再逐字同步。
 */

import type { TemplateRow, TemplateRowSource } from '@/lib/db/schema'

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

/** 新建模板的 7 段默认 seed（[027-B] 新形状） */
export const DEFAULT_SEGMENT_SEED: ReadonlyArray<{ activityName: string; defaultStart: string; defaultDuration: number }> = [
  { activityName: '起床', defaultStart: '07:00', defaultDuration: 30 },
  { activityName: '晨间', defaultStart: '07:30', defaultDuration: 90 },
  { activityName: '上午上班', defaultStart: '09:00', defaultDuration: 180 },
  { activityName: '午间', defaultStart: '12:00', defaultDuration: 90 },
  { activityName: '下午上班', defaultStart: '13:30', defaultDuration: 270 },
  { activityName: '晚间', defaultStart: '18:00', defaultDuration: 300 },
  { activityName: '睡眠', defaultStart: '23:00', defaultDuration: 480 },
]

/** 生成行 id（默认 crypto.randomUUID，测试可注入） */
export function genRowId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `r-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** HH:MM + 分钟数 = HH:MM（跨午夜 mod 24h 归一） */
export function addMinutesToHHMM(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(':').map(Number)
  const total = ((h * 60 + m + minutes) % (24 * 60) + 24 * 60) % (24 * 60)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`
}

/** [027-B] 两 HH:MM 之差（分钟）；end<start 视作跨午夜次日（+24h）。 */
export function hhmmDiffMinutes(start: string, end: string): number {
  const [sh, sm] = start.split(':').map(Number)
  const [eh, em] = end.split(':').map(Number)
  let diff = eh * 60 + em - (sh * 60 + sm)
  if (diff < 0) diff += 24 * 60
  return diff
}

const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/
/** 必填 HH:MM 合法性 */
function isValidHHMM(s: unknown): boolean {
  return typeof s === 'string' && HHMM_RE.test(s)
}
/** 可选 HH:MM 合法性（空值合法） */
function isOptionalHHMM(s: unknown): boolean {
  return s == null || s === '' || isValidHHMM(s)
}

/** 新建模板的 7 段 seed 行 */
export function seedTemplateRows(idGen: () => string = genRowId): TemplateRow[] {
  return DEFAULT_SEGMENT_SEED.map((seg) => ({
    id: idGen(),
    source: 'custom',
    activityName: seg.activityName,
    defaultStart: seg.defaultStart,
    defaultDuration: seg.defaultDuration,
  }))
}

/** 「+ 新增一行」空白行 */
export function newEmptyRow(idGen: () => string = genRowId): TemplateRow {
  return {
    id: idGen(),
    activityName: '',
    defaultStart: '09:00',
    defaultDuration: 60,
    source: 'custom',
  }
}

/** 按 defaultStart 升序（HH:MM 字典序 = 时间序） */
export function sortRowsByDefaultStart(rows: TemplateRow[]): TemplateRow[] {
  return [...rows].sort((a, b) => a.defaultStart.localeCompare(b.defaultStart))
}

/**
 * [027-B] 读时自愈：把任意 rows 元素归一为新形状 TemplateRow。
 * - 新形状（有 defaultStart+defaultDuration）：直通，缺省约束/archetype 置 null。
 * - 旧形状（有 start、无 defaultStart）：defaultStart=start，defaultDuration=hhmmDiffMinutes(start,end)。
 * - 兜底：空对象→custom 09:00/0。
 * 供 TimeboxTemplateRepository.rowToTemplate 用。
 */
export function normalizeTemplateRow(raw: unknown): TemplateRow {
  const r = (raw ?? {}) as Record<string, unknown>
  const id = typeof r.id === 'string' ? r.id : genRowId()
  const activityName = typeof r.activityName === 'string' ? r.activityName : ''
  const source: TemplateRowSource =
    r.source === 'habit' || r.source === 'task' || r.source === 'thread' || r.source === 'custom'
      ? (r.source as TemplateRowSource)
      : 'custom'
  const sourceId = typeof r.sourceId === 'string' ? r.sourceId : undefined

  if (typeof r.defaultStart === 'string' && typeof r.defaultDuration === 'number') {
    return {
      id, activityName, source, sourceId,
      defaultStart: r.defaultStart,
      defaultDuration: r.defaultDuration,
      earliestStart: typeof r.earliestStart === 'string' ? r.earliestStart : null,
      latestStart: typeof r.latestStart === 'string' ? r.latestStart : null,
      shortestDuration: typeof r.shortestDuration === 'number' ? r.shortestDuration : null,
      activityArchetypeId: typeof r.activityArchetypeId === 'string' ? r.activityArchetypeId : null,
    }
  }
  // 旧形状 {start, end}
  const start = typeof r.start === 'string' ? r.start : '09:00'
  const end = typeof r.end === 'string' ? r.end : start
  return {
    id, activityName, source, sourceId,
    defaultStart: start,
    defaultDuration: hhmmDiffMinutes(start, end),
    earliestStart: null,
    latestStart: null,
    shortestDuration: null,
    activityArchetypeId: null,
  }
}

/**
 * [027-B] 行校验纯函数，返回错误信息数组（空=合法）。
 * - defaultStart 必填 HH:MM；defaultDuration > 0
 * - earliestStart/latestStart/shortestDuration 可选；存在时校验顺序/大小
 */
export function validateTemplateRow(row: TemplateRow): string[] {
  const errors: string[] = []
  if (!isValidHHMM(row.defaultStart)) errors.push('默认开始时间格式应为 HH:MM')
  if (!Number.isFinite(row.defaultDuration) || row.defaultDuration <= 0) errors.push('默认时长须大于 0 分钟')
  if (!isOptionalHHMM(row.earliestStart)) errors.push('最早开始时间格式应为 HH:MM')
  if (!isOptionalHHMM(row.latestStart)) errors.push('最迟开始时间格式应为 HH:MM')
  if (row.shortestDuration != null && (!Number.isFinite(row.shortestDuration) || row.shortestDuration < 0)) {
    errors.push('最短时长须为非负分钟数')
  }
  if (isValidHHMM(row.earliestStart) && (row.earliestStart as string) > row.defaultStart) {
    errors.push('最早开始时间不能晚于默认开始时间')
  }
  if (isValidHHMM(row.latestStart) && row.defaultStart > (row.latestStart as string)) {
    errors.push('默认开始时间不能晚于最迟开始时间')
  }
  if (row.shortestDuration != null && row.shortestDuration > row.defaultDuration) {
    errors.push('最短时长不能大于默认时长')
  }
  return errors
}
```

- [ ] **Step 5: 改 `template-card.tsx` 显示字段（徽章留 Task 4）**

`template-card.tsx`：
- import：`sortRowsByStart` → `sortRowsByDefaultStart`（行 20），并改 `useMemo` 调用（行 31）`sortRowsByStart(...)` → `sortRowsByDefaultStart(...)`。
- 行 69 与行 88 两处显示：
  - 旧：`{r.start}–{r.end}：{r.activityName || '(未命名)'}`
  - 新：`{r.defaultStart} · {r.defaultDuration}分钟：{r.activityName || '(未命名)'}`

- [ ] **Step 6: 改 `template-edit-form.tsx` 字段（多行重构留 Task 5）**

`template-edit-form.tsx`：
- import（行 40-44）：把 `sortRowsByStart` 改为 `sortRowsByDefaultStart`；调用处（行 316）同步改名。
- `changeRowSource` 的 habit 分支（行 230-238）：
  - 旧：`{ ...r, source: 'habit', sourceId: newSourceId, activityName: h.title, start: h.start, end: h.end }`
  - 新：`{ ...r, source: 'habit', sourceId: newSourceId, activityName: h.title, defaultStart: h.start, defaultDuration: hhmmDiffMinutes(h.start, h.end) }`
  - 需在文件顶部 import 补 `hhmmDiffMinutes`（从 `@/domains/timebox/lib/template-row-helpers`）。
- RowEditor 两处 `<input>`（行 137-153）：
  - 「开始时间」`value={row.start}` → `value={row.defaultStart}`，`onChange` `{ start: e.target.value }` → `{ defaultStart: e.target.value }`，`disabled={isHabit}` 不变。
  - 「结束时间」`<input type="time" value={row.end}>` → 改为时长数字输入：
    ```tsx
    <input
      aria-label="默认时长（分钟）"
      type="number"
      min={1}
      value={row.defaultDuration}
      disabled={isHabit}
      onChange={(e) => onUpdate(row.id, { defaultDuration: Number(e.target.value) || 0 })}
      className="h-7 w-20 rounded border border-hairline bg-canvas px-1 text-xs text-ink disabled:opacity-60"
    />
    <span className="text-xs text-muted-foreground">分钟</span>
    ```
    并删去原 `{r.end}` 与中间的 `—` span（行 145）。

- [ ] **Step 7: 改测试 fixtures（form 测试）**

`frontend/src/domains/timebox/components/__tests__/template-edit-form.test.tsx`：所有 fixture/断言里的 `{ id, activityName, start, end, source }` 改为新形状 `{ id, activityName, defaultStart, defaultDuration, source }`。具体：
- `makeTemplate` 的 rows（行 30-33）：
  - `{ id: 'r1', activityName: '起床', start: '07:00', end: '07:30', source: 'custom' }` → `{ id: 'r1', activityName: '起床', defaultStart: '07:00', defaultDuration: 30, source: 'custom' }`
  - `{ id: 'r2', activityName: '晨间', start: '07:30', end: '09:00', source: 'custom' }` → `{ id: 'r2', activityName: '晨间', defaultStart: '07:30', defaultDuration: 90, source: 'custom' }`
- 「切到 habit」用例（行 151-160）：`getByDisplayValue('06:00')` 保留（defaultStart）；`getByDisplayValue('07:00')`（旧 end）改为断言时长 `getByDisplayValue(60)`（h-1 是 06:00→07:00 = 60min）。`getAllByLabelText('结束时间')` 改为 `getAllByLabelText('默认时长（分钟）')`。
- 「新增一行」用例（行 219-221）：`getByDisplayValue('10:00')`（旧 end）改为时长 `getByDisplayValue(60)`。
- 「行按 start 排序」用例（行 326-357）：rows 改新形状；`querySelector('input[aria-label="开始时间"]')` 保留；删去对 end 的断言（若有）；`input[aria-label="结束时间"]` 相关改为 `默认时长（分钟）`。
- mockSources（行 40-51）**保持不变**（sources 形状 Task 3 才改）。

> implementer 注意：form 测试里凡 `getByDisplayValue('07:00')` 既要匹配 r1.defaultStart='07:00' 也会匹配 r2.defaultStart='07:30'不冲突；但「切 habit」用例里 h-1 是 06:00→07:00，defaultStart='06:00'、defaultDuration=60，故断言 `06:00` 与时长 `60`。逐用例核对 displayValue 唯一性，必要时用 `getAllByDisplayValue(...)[0]`。

- [ ] **Step 8: 跑测试 + tsc 确认绿**

Run:
```
cd frontend && npx vitest run src/domains/timebox/lib/__tests__/template-row-helpers.test.ts src/domains/timebox/components/__tests__/template-edit-form.test.ts
```
Expected: 全 PASS。

Run: `cd frontend && npx tsc --noEmit`
Expected: 0 新增错误（changed files 内）。

- [ ] **Step 9: Commit**

```bash
git add frontend/src/lib/db/schema.ts \
  frontend/src/domains/timebox/lib/template-row-helpers.ts \
  frontend/src/domains/timebox/lib/__tests__/template-row-helpers.test.ts \
  frontend/src/domains/timebox/components/template-card.tsx \
  frontend/src/domains/timebox/components/template-edit-form.tsx \
  frontend/src/domains/timebox/components/__tests__/template-edit-form.test.tsx
git commit -m "feat(027-B): TemplateRow 形状重构（defaultStart/Duration+约束+archetypeId）+纯函数自愈/校验"
```

---

## Task 2: 仓储 rowToTemplate 读时自愈

**Files:**
- Modify: `frontend/src/lib/db/repositories/timebox-template.ts`（`rowToTemplate`，行 40-51）
- Test: `frontend/src/lib/db/repositories/__tests__/timebox-template.repository.test.ts`（新建）

**Interfaces:**
- Consumes: `normalizeTemplateRow(raw)` from Task 1.

- [ ] **Step 1: 写仓储自愈测试（红）**

新建 `frontend/src/lib/db/repositories/__tests__/timebox-template.repository.test.ts`：

```ts
/**
 * @file timebox-template.repository.test
 * @brief rowToTemplate 读时自愈测试（[027-B]）
 *
 * 直接单测 rowToTemplate：旧形状 rows 读出后应已归一为新形状。
 * 不连真实 DB（rowToTemplate 是纯映射函数）。
 */
import { describe, it, expect } from 'vitest'
// rowToTemplate 当前未 export；本任务 Step 3 会 export 它以便测试
import { rowToTemplate } from '../timebox-template'

describe('rowToTemplate — 读时自愈', () => {
  it('旧形状 {start,end} 行归一为 defaultStart + defaultDuration', () => {
    const out = rowToTemplate({
      id: 't1', userId: 'u1', schemaVersion: 1, name: '旧模板',
      daysOfWeek: [1, 2, 3, 4, 5],
      rows: [
        { id: 'r1', activityName: '起床', start: '07:00', end: '07:30', source: 'custom' },
        { id: 'r2', activityName: '睡眠', start: '23:00', end: '07:00', source: 'custom' },
      ],
      createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-02'),
    } as never)
    expect(out.rows[0]).toMatchObject({ defaultStart: '07:00', defaultDuration: 30 })
    expect(out.rows[1]).toMatchObject({ defaultStart: '23:00', defaultDuration: 480 })
    expect(out.rows[0]).not.toHaveProperty('start')
  })
  it('新形状行直通', () => {
    const out = rowToTemplate({
      id: 't2', userId: 'u1', schemaVersion: 1, name: '新模板',
      daysOfWeek: [],
      rows: [{ id: 'r', activityName: 'x', defaultStart: '09:00', defaultDuration: 60, source: 'custom' }],
      createdAt: new Date('2026-01-01'), updatedAt: new Date('2026-01-01'),
    } as never)
    expect(out.rows[0]).toMatchObject({ defaultStart: '09:00', defaultDuration: 60, earliestStart: null })
  })
})
```

- [ ] **Step 2: 跑确认红**

Run: `cd frontend && npx vitest run src/lib/db/repositories/__tests__/timebox-template.repository.test.ts`
Expected: FAIL（`rowToTemplate` 未 export / 无 normalize）。

- [ ] **Step 3: 改 rowToTemplate**

`frontend/src/lib/db/repositories/timebox-template.ts`：
- import 补：`import { normalizeTemplateRow } from '@/domains/timebox/lib/template-row-helpers'`
- `rowToTemplate`（行 40-51）改为 `export function`，rows 走 normalize：
  ```ts
  export function rowToTemplate(row: typeof s.timeboxTemplates.$inferSelect): TimeboxTemplate {
    return {
      id: row.id,
      userId: row.userId,
      schemaVersion: row.schemaVersion,
      name: row.name,
      daysOfWeek: row.daysOfWeek ?? [0, 1, 2, 3, 4, 5, 6],
      rows: (row.rows ?? []).map(normalizeTemplateRow),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    }
  }
  ```

- [ ] **Step 4: 跑确认绿 + tsc**

Run: `cd frontend && npx vitest run src/lib/db/repositories/__tests__/timebox-template.repository.test.ts && npx tsc --noEmit`
Expected: 测试 PASS；tsc 0 新增错误。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/db/repositories/timebox-template.ts \
  frontend/src/lib/db/repositories/__tests__/timebox-template.repository.test.ts
git commit -m "feat(027-B): TimeboxTemplateRepository rowToTemplate 读时自愈旧 rows 形状"
```

---

## Task 3: fetchSubscriptionSources 带 activityArchetypeId

**Files:**
- Modify: `frontend/src/app/actions/timebox-templates.ts`（`SubscriptionSources` + `fetchSubscriptionSources`）
- Test: `frontend/src/app/actions/__tests__/timebox-templates.test.ts`（新建）

**Interfaces:**
- Produces: `SubscriptionSources.habits` 与 `tasks` 项各带 `activityArchetypeId?: string | null`（threads 无）。

> 前置确认：`Habit` / `Task` USOM 类型已有 `activityArchetypeId?: USOM_ID | null`（Phase A 落地）。`HabitRepository.findByUserId` / `TaskRepository.findByUserId` 返回的对象已含此字段，直接取值。

- [ ] **Step 1: 写 action 测试（红）**

新建 `frontend/src/app/actions/__tests__/timebox-templates.test.ts`：

```ts
/**
 * @file timebox-templates.test
 * @brief fetchSubscriptionSources 带 activityArchetypeId（[027-B]）
 *
 * mock 三个仓储，断言 habits/tasks 项携带来源对象的原型 id；threads 不带。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/domains/habits/repository/habit', () => ({
  HabitRepository: vi.fn().mockImplementation(() => ({
    findByUserId: vi.fn().mockResolvedValue([
      { id: 'h1', title: '晨跑', defaultTime: '06:00', defaultDuration: 60, activityArchetypeId: 'a-run' },
    ]),
  })),
}))
vi.mock('@/domains/tasks/repository/task', () => ({
  TaskRepository: vi.fn().mockImplementation(() => ({
    findByUserId: vi.fn().mockResolvedValue([
      { id: 't1', title: '写周报', activityArchetypeId: 'a-write' },
    ]),
  })),
}))
vi.mock('@/domains/tasks/repository/thread', () => ({
  ThreadRepository: vi.fn().mockImplementation(() => ({
    findByUserId: vi.fn().mockResolvedValue([{ id: 'th1', name: 'OKR' }]),
  })),
}))

const { fetchSubscriptionSources } = await import('../../timebox-templates')

describe('fetchSubscriptionSources — archetypeId', () => {
  beforeEach(() => {
    vi.resetModules()
  })
  it('habits 项带 activityArchetypeId + start/duration', async () => {
    const r = await fetchSubscriptionSources()
    expect(r.success).toBe(true)
    expect(r.data?.habits[0]).toMatchObject({ id: 'h1', activityArchetypeId: 'a-run', start: '06:00', end: '07:00' })
  })
  it('tasks 项带 activityArchetypeId', async () => {
    const r = await fetchSubscriptionSources()
    expect(r.data?.tasks[0]).toMatchObject({ id: 't1', activityArchetypeId: 'a-write' })
  })
  it('threads 项不带 activityArchetypeId', async () => {
    const r = await fetchSubscriptionSources()
    expect(r.data?.threads[0]).toMatchObject({ id: 'th1' })
    expect(r.data?.threads[0]).not.toHaveProperty('activityArchetypeId')
  })
})
```

- [ ] **Step 2: 跑确认红**

Run: `cd frontend && npx vitest run src/app/actions/__tests__/timebox-templates.test.ts`
Expected: FAIL（sources 项无 activityArchetypeId）。

- [ ] **Step 3: 改 action**

`frontend/src/app/actions/timebox-templates.ts`：
- `SubscriptionSources`（行 31-36）改为：
  ```ts
  export interface SubscriptionSources {
    habits: Array<{ id: string; title: string; start: string; end: string; activityArchetypeId?: string | null }>
    tasks: Array<{ id: string; title: string; activityArchetypeId?: string | null }>
    threads: Array<{ id: string; title: string }>
  }
  ```
- `fetchSubscriptionSources` 的 map（行 104-110）：
  ```ts
  habits: habits.map((h) => ({
    id: h.id,
    title: h.title,
    start: h.defaultTime,
    end: addMinutesToHHMM(h.defaultTime, h.defaultDuration),
    activityArchetypeId: h.activityArchetypeId ?? null,
  })),
  tasks: tasks.map((t) => ({ id: t.id, title: t.title, activityArchetypeId: t.activityArchetypeId ?? null })),
  threads: threads.map((th) => ({ id: th.id, title: th.name })),
  ```

- [ ] **Step 4: 跑确认绿 + tsc**

Run: `cd frontend && npx vitest run src/app/actions/__tests__/timebox-templates.test.ts && npx tsc --noEmit`
Expected: PASS；tsc 0 新增错误。

- [ ] **Step 5: Commit**

```bash
git add frontend/src/app/actions/timebox-templates.ts \
  frontend/src/app/actions/__tests__/timebox-templates.test.ts
git commit -m "feat(027-B): fetchSubscriptionSources 为 habits/tasks 补带 activityArchetypeId"
```

---

## Task 4: TemplateCard 原型/来源徽章 + 编辑器 archetype Map

**Files:**
- Modify: `frontend/src/domains/timebox/components/template-card.tsx`（行徽章）
- Modify: `frontend/src/domains/timebox/components/timebox-template-editor.tsx`（拉 archetype Map 传 card）
- Test: `frontend/src/domains/timebox/components/__tests__/template-card.test.tsx`（新建）

**Interfaces:**
- Consumes: `TemplateRow.activityArchetypeId`（custom 行，Task 1）。
- Produces: `TemplateCard` 新增可选 prop `archetypeMap?: Map<string, string>`。

- [ ] **Step 1: 写 card 徽章测试（红）**

新建 `frontend/src/domains/timebox/components/__tests__/template-card.test.tsx`：

```tsx
/**
 * @file template-card.test
 * @brief TemplateCard 列表行徽章（[027-B]：原型标签 + 来源徽章）
 */
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { TemplateCard } from '../template-card'
import type { TimeboxTemplate } from '@/lib/db/repositories/timebox-template'

function makeTpl(rows: TimeboxTemplate['rows']): TimeboxTemplate {
  return { id: 't', userId: 'u', schemaVersion: 1, name: 'T', daysOfWeek: [], rows, createdAt: '', updatedAt: '' }
}

describe('TemplateCard — 行徽章', () => {
  it('custom 行显示原型标签（archetypeMap 命中）', () => {
    const tpl = makeTpl([{ id: 'r', activityName: '读书', defaultStart: '09:00', defaultDuration: 60, source: 'custom', activityArchetypeId: 'a-1' }])
    const { getAllByTestId } = render(<TemplateCard template={tpl} archetypeMap={new Map([['a-1', '阅读']])} onEdit={() => {}} onDelete={() => {}} />)
    expect(getAllByTestId('row-line')[0]?.textContent).toContain('阅读')
  })
  it('custom 行无原型不显示空徽章', () => {
    const tpl = makeTpl([{ id: 'r', activityName: '读书', defaultStart: '09:00', defaultDuration: 60, source: 'custom' }])
    const { getAllByTestId } = render(<TemplateCard template={tpl} archetypeMap={new Map()} onEdit={() => {}} onDelete={() => {}} />)
    expect(getAllByTestId('row-line')[0]?.textContent).not.toContain('·  ·')
  })
  it('habit 行显示「习惯」来源徽章', () => {
    const tpl = makeTpl([{ id: 'r', activityName: '晨跑', defaultStart: '06:00', defaultDuration: 60, source: 'habit', sourceId: 'h1' }])
    const { getAllByTestId } = render(<TemplateCard template={tpl} archetypeMap={new Map()} onEdit={() => {}} onDelete={() => {}} />)
    expect(getAllByTestId('row-line')[0]?.textContent).toContain('习惯')
  })
  it('thread 行显示「主线」徽章', () => {
    const tpl = makeTpl([{ id: 'r', activityName: 'OKR', defaultStart: '09:00', defaultDuration: 60, source: 'thread', sourceId: 'th1' }])
    const { getAllByTestId } = render(<TemplateCard template={tpl} archetypeMap={new Map()} onEdit={() => {}} onDelete={() => {}} />)
    expect(getAllByTestId('row-line')[0]?.textContent).toContain('主线')
  })
})
```

- [ ] **Step 2: 跑确认红**

Run: `cd frontend && npx vitest run src/domains/timebox/components/__tests__/template-card.test.tsx`
Expected: FAIL（徽章未实现）。

- [ ] **Step 3: 改 TemplateCard 加徽章**

`frontend/src/domains/timebox/components/template-card.tsx`：
- props 加 `archetypeMap?: Map<string, string>`：
  ```ts
  interface TemplateCardProps {
    template: TimeboxTemplate
    archetypeMap?: Map<string, string>
    onEdit: () => void
    onDelete: () => void
  }
  export function TemplateCard({ template, archetypeMap, onEdit, onDelete }: TemplateCardProps) {
  ```
- 在组件内加行渲染辅助：
  ```ts
  const SOURCE_BADGE: Record<string, string> = { habit: '习惯', task: '任务', thread: '主线' }
  function rowLabel(r: typeof template.rows[number]): string {
    const parts = [`${r.defaultStart} · ${r.defaultDuration}分钟`, r.activityName || '(未命名)']
    if (r.source === 'custom' && r.activityArchetypeId) {
      const label = archetypeMap?.get(r.activityArchetypeId)
      if (label) parts.push(label)
    } else if (r.source !== 'custom') {
      parts.push(`[${SOURCE_BADGE[r.source] ?? r.source}]`)
    }
    return parts.join(' · ')
  }
  ```
- 两处 `{r.start}–{r.end}：{r.activityName || '(未命名)'}`（行 69 / 行 88）都换成 `{rowLabel(r)}`。

- [ ] **Step 4: 编辑器拉 archetype Map 并传 card**

`frontend/src/domains/timebox/components/timebox-template-editor.tsx`：
- import 补：`import { getArchetypes } from '@/app/actions/activity-archetype'`
- 组件内加状态 + effect（与现有 state 同处）：
  ```ts
  const [archetypeMap, setArchetypeMap] = useState<Map<string, string>>(() => new Map())
  useEffect(() => {
    let cancelled = false
    void getArchetypes().then((r) => {
      if (cancelled) return
      if (r.success && r.data) setArchetypeMap(new Map(r.data.map((a) => [a.id, a.l2Name])))
    })
    return () => { cancelled = true }
  }, [])
  ```
  （需在顶部 `import { useState, useCallback, useEffect } from 'react'`）
- `<TemplateCard>`（行 197-202）加 `archetypeMap={archetypeMap}`。

- [ ] **Step 5: 跑确认绿 + tsc**

Run: `cd frontend && npx vitest run src/domains/timebox/components/__tests__/template-card.test.tsx && npx tsc --noEmit`
Expected: PASS；tsc 0 新增错误。

- [ ] **Step 6: Commit**

```bash
git add frontend/src/domains/timebox/components/template-card.tsx \
  frontend/src/domains/timebox/components/__tests__/template-card.test.tsx \
  frontend/src/domains/timebox/components/timebox-template-editor.tsx
git commit -m "feat(027-B): TemplateCard 列表显示原型标签/来源徽章 + 编辑器拉 archetype Map"
```

---

## Task 5: RowEditor 多行卡片 + 行为分叉（含 §3.4 精炼）

**Files:**
- Modify: `frontend/src/domains/timebox/components/template-edit-form.tsx`（`RowEditor` 重构）
- Modify: `frontend/src/domains/timebox/components/__tests__/template-edit-form.test.tsx`（新增分叉用例）

**Interfaces:**
- Consumes: `ArchetypePicker`（Phase A，`variant/enableAiMatch/title/value/onChange/readOnly`）；`validateTemplateRow`（Task 1）；sources.habits/tasks.activityArchetypeId（Task 3）。

> **行为矩阵见本计划「设计精炼标记」**：archetype 仅 custom 可编辑；时间/约束 habit 只读、其余可编辑。

- [ ] **Step 1: 写分叉测试（红）**

在 `template-edit-form.test.tsx` 末尾追加（fixtures 的 rows 已是 Task 1 新形状；mockSources 需带 archetypeId——更新它）：

先更新 mockSources（顶部 fixtures）：
```ts
const mockSources: SubscriptionSources = {
  habits: [{ id: 'h-1', title: '晨跑', start: '06:00', end: '07:00', activityArchetypeId: 'a-run' }],
  tasks: [{ id: 'tk-1', title: '写周报', activityArchetypeId: 'a-write' }],
  threads: [{ id: 'th-1', title: '季度 OKR' }],
}
```

追加用例：
```ts
import { ArchetypePicker } from '@/components/archetype/archetype-picker'
// 给 RowEditor 一个带 custom 行 + 既有 archetype 的模板，便于断言

describe('TemplateEditForm — RowEditor 行为分叉 [027-B]', () => {
  it('custom 行渲原型选择器（可编辑）+ 5 个时间字段可编辑', () => {
    const tpl = makeTemplate({
      rows: [{ id: 'rc', activityName: '读书', defaultStart: '09:00', defaultDuration: 60, source: 'custom', activityArchetypeId: 'a-1' }],
    })
    render(<Harness initialTemplate={tpl} initialSources={mockSources} />)
    // 原型选择器出现「更换/清除」（非只读）
    expect(screen.getByRole('button', { name: '更换活动原型' })).toBeInTheDocument()
    // 约束字段可编辑
    expect(screen.getByLabelText('最早开始时间')).not.toBeDisabled()
    expect(screen.getByLabelText('最短时长（分钟）')).not.toBeDisabled()
  })
  it('habit 行原型只读 + 时间只读', async () => {
    const user = userEvent.setup()
    render(<Harness initialSources={mockSources} />)
    await user.selectOptions(screen.getAllByLabelText('行来源')[0]!, 'habit')
    await user.selectOptions(screen.getAllByLabelText('来源对象')[0]!, 'h-1')
    // 习惯行不渲「更换活动原型」按钮（只读 picker）
    expect(screen.queryByRole('button', { name: '更换活动原型' })).not.toBeInTheDocument()
    // 时间字段只读
    expect(screen.getAllByLabelText('默认开始时间')[0]).toBeDisabled()
    expect(screen.getAllByLabelText('默认时长（分钟）')[0]).toBeDisabled()
    // 约束字段只读
    expect(screen.getByLabelText('最早开始时间')).toBeDisabled()
  })
  it('task 行原型只读 + 时间/约束可编辑', async () => {
    const user = userEvent.setup()
    render(<Harness initialSources={mockSources} />)
    await user.selectOptions(screen.getAllByLabelText('行来源')[0]!, 'task')
    await user.selectOptions(screen.getAllByLabelText('来源对象')[0]!, 'tk-1')
    expect(screen.queryByRole('button', { name: '更换活动原型' })).not.toBeInTheDocument()
    expect(screen.getAllByLabelText('默认开始时间')[0]).not.toBeDisabled()
    expect(screen.getByLabelText('最早开始时间')).not.toBeDisabled()
  })
  it('默认时长 <= 0 时 onBlur 显示错误', async () => {
    const user = userEvent.setup()
    render(<Harness initialSources={mockSources} />)
    const dur = screen.getAllByLabelText('默认时长（分钟）')[0]!
    await user.clear(dur)
    await user.type(dur, '0')
    dur.blur()
    expect(await screen.findByText(/默认时长须大于 0/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: 跑确认红**

Run: `cd frontend && npx vitest run src/domains/timebox/components/__tests__/template-edit-form.test.tsx`
Expected: FAIL（新 label/分叉未实现）。

- [ ] **Step 3: 重构 RowEditor**

`frontend/src/domains/timebox/components/template-edit-form.tsx`：
- import 补：
  ```ts
  import { ArchetypePicker } from '@/components/archetype/archetype-picker'
  import { validateTemplateRow } from '@/domains/timebox/lib/template-row-helpers'
  ```
- `RowEditor` 内：时间锁按本计划矩阵——habit 锁时（`isHabit`），task/thread/custom 可编辑。原型按 source 分叉。新增约束字段输入（custom/task/thread 可编辑，habit 只读）。
- 把 `RowEditor` 返回的 JSX（当前行 91-176）替换为下面的多行卡片结构（保留 `来源/活动名称/来源对象/删除` 顶行逻辑不变，仅调整布局与新增字段）：

```tsx
return (
  <div className="flex flex-col gap-2 rounded border border-hairline bg-surface-card p-2">
    {/* 顶行：来源 / 名称或对象 / 删除（保持原有逻辑） */}
    <div className="flex items-center gap-1 flex-wrap">
      <select
        aria-label="行来源"
        value={row.source}
        disabled={!sourcesReady}
        onChange={(e) => {
          const v = e.target.value
          if (v === 'habit' || v === 'task' || v === 'thread' || v === 'custom') onSourceChange(row.id, v)
        }}
        className="h-7 rounded border border-hairline bg-canvas px-1 text-xs text-ink disabled:opacity-60"
      >
        <option value="custom">自定义</option>
        <option value="habit">习惯</option>
        <option value="task">任务</option>
        <option value="thread">主线</option>
      </select>
      {isObjectSource && sourceList ? (
        <select
          aria-label="来源对象"
          value={row.sourceId ?? ''}
          onChange={(e) => onSourceChange(row.id, row.source, e.target.value || undefined)}
          className="h-7 flex-1 min-w-0 rounded border border-hairline bg-canvas px-1 text-xs text-ink"
        >
          <option value="">— 选择{row.source === 'habit' ? '习惯' : row.source === 'task' ? '任务' : '主线'} —</option>
          {sourceList.map((it) => (<option key={it.id} value={it.id}>{it.title}</option>))}
        </select>
      ) : (
        <input
          aria-label="活动名称"
          value={row.activityName}
          placeholder="活动名称"
          onChange={(e) => onUpdate(row.id, { activityName: e.target.value })}
          className="h-7 flex-1 min-w-0 rounded border border-hairline bg-canvas px-1 text-xs text-ink"
        />
      )}
      <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive h-7 px-2" onClick={() => onDelete(row.id)} aria-label="删除行">
        <Trash2 className="size-3" />
      </Button>
    </div>

    {/* 活动原型：custom 可编辑；来源行只读派生 */}
    <div className="rounded border border-hairline bg-canvas px-2 py-1">
      {row.source === 'custom' ? (
        <ArchetypePicker
          variant="inline"
          enableAiMatch
          title={row.activityName}
          value={row.activityArchetypeId ?? undefined}
          onChange={(id) => onUpdate(row.id, { activityArchetypeId: id ?? null })}
        />
      ) : (
        <ArchetypePicker variant="inline" readOnly value={sourceArchetypeId ?? undefined} />
      )}
    </div>

    {/* 时间 + 约束：habit 只读，其余可编辑 */}
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-1 text-xs text-muted-foreground">
        默认开始
        <input aria-label="默认开始时间" type="time" value={row.defaultStart} disabled={isHabit}
          onChange={(e) => onUpdate(row.id, { defaultStart: e.target.value })}
          className="h-7 rounded border border-hairline bg-canvas px-1 text-xs text-ink disabled:opacity-60" />
      </label>
      <label className="flex items-center gap-1 text-xs text-muted-foreground">
        默认时长
        <input aria-label="默认时长（分钟）" type="number" min={1} value={row.defaultDuration} disabled={isHabit}
          onChange={(e) => onUpdate(row.id, { defaultDuration: Number(e.target.value) || 0 })}
          className="h-7 w-20 rounded border border-hairline bg-canvas px-1 text-xs text-ink disabled:opacity-60" />
        分钟
      </label>
      <label className="flex items-center gap-1 text-xs text-muted-foreground">
        最早开始
        <input aria-label="最早开始时间" type="time" value={row.earliestStart ?? ''} disabled={isHabit}
          onChange={(e) => onUpdate(row.id, { earliestStart: e.target.value || null })}
          className="h-7 rounded border border-hairline bg-canvas px-1 text-xs text-ink disabled:opacity-60" />
      </label>
      <label className="flex items-center gap-1 text-xs text-muted-foreground">
        最迟开始
        <input aria-label="最迟开始时间" type="time" value={row.latestStart ?? ''} disabled={isHabit}
          onChange={(e) => onUpdate(row.id, { latestStart: e.target.value || null })}
          className="h-7 rounded border border-hairline bg-canvas px-1 text-xs text-ink disabled:opacity-60" />
      </label>
      <label className="flex items-center gap-1 text-xs text-muted-foreground">
        最短时长
        <input aria-label="最短时长（分钟）" type="number" min={0} value={row.shortestDuration ?? ''} disabled={isHabit}
          onChange={(e) => onUpdate(row.id, { shortestDuration: e.target.value === '' ? null : Number(e.target.value) })}
          className="h-7 w-20 rounded border border-hairline bg-canvas px-1 text-xs text-ink disabled:opacity-60" />
        分钟
      </label>
    </div>

    {/* 校验错误提示（onBlur 触发） */}
    {errors.length > 0 && (
      <ul className="flex flex-col gap-0.5">
        {errors.map((e) => (<li key={e} className="text-[10px] text-error">{e}</li>))}
      </ul>
    )}

    {!sourcesReady && <p className="text-[10px] text-muted-foreground">加载订阅源…</p>}
    {row.source !== 'custom' && !row.sourceId && sourcesReady && (
      <p className="text-[10px] text-muted-foreground">请选择来源对象</p>
    )}
  </div>
)
```

- `RowEditor` 组件体需新增派生与校验状态（放在 `return` 之前）：

```ts
// 来源行原型 id 派生：habit/task 从 sources 取，thread 无
const sourceArchetypeId: string | null = (() => {
  if (row.source === 'habit' && row.sourceId && sources) {
    return sources.habits.find((h) => h.id === row.sourceId)?.activityArchetypeId ?? null
  }
  if (row.source === 'task' && row.sourceId && sources) {
    return sources.tasks.find((t) => t.id === row.sourceId)?.activityArchetypeId ?? null
  }
  return null
})()

const [errors, setErrors] = useState<string[]>([])
const validateOnBlur = () => setErrors(validateTemplateRow(row))
```

  顶部 `import { useState }` 需补（当前只 import 了 `useCallback`）。

- [ ] **Step 4: 跑确认绿**

Run: `cd frontend && npx vitest run src/domains/timebox/components/__tests__/template-edit-form.test.tsx`
Expected: 全 PASS（含新分叉用例）。

- [ ] **Step 5: tsc + 跑全量相关测试防回归**

Run:
```
cd frontend && npx tsc --noEmit && \
npx vitest run src/domains/timebox src/lib/db/repositories/__tests__/timebox-template.repository.test.ts src/app/actions/__tests__/timebox-templates.test.ts
```
Expected: tsc 0 新增错误；vitest 全过。

- [ ] **Step 6: Commit**

```bash
git add frontend/src/domains/timebox/components/template-edit-form.tsx \
  frontend/src/domains/timebox/components/__tests__/template-edit-form.test.tsx
git commit -m "feat(027-B): RowEditor 多行卡片 + 行为分叉（custom 可编辑原型/约束，来源行只读派生）+ onBlur 校验"
```

---

## Task 6: Tier 2 文档同步

**Files:**
- Modify: `docs/database-design.md`（`timebox_templates.rows` 字段表）
- Modify: `docs/usom-design.md`（对应类型，若有）
- Modify: `CHANGELOG.md`（追加 `[027-B]` 段）
- Modify: `manifest.md`（版本入口指针）

- [ ] **Step 1: 定位字段表**

Run: `grep -nE "timebox_templates|TemplateRow|rows.*jsonb|默认开始|start.*end" docs/database-design.md docs/usom-design.md | head -40`

- [ ] **Step 2: 更新 database-design.md**

把 `timebox_templates.rows` 的 `TemplateRow` 字段表改为：

| 字段 | 类型 | 说明 |
|---|---|---|
| id | string | 行 id |
| activityName | string | 活动名称 |
| defaultStart | HH:MM | 默认开始时间（[027-B] 原 start） |
| defaultDuration | number(分钟) | 默认时长（替代原 end） |
| earliestStart | HH:MM? | 最早开始约束（可选）[027-B] |
| latestStart | HH:MM? | 最迟开始约束（可选）[027-B] |
| shortestDuration | number?[027-B] | 最短时长约束（可选，分钟） |
| activityArchetypeId | string? | 关联原型（custom 可编辑；来源行读时派生）[027-B] |
| source | enum | habit/task/thread/custom |
| sourceId | string? | 来源对象 id |

并补一段说明：**无 DDL，旧形状 `{start,end}` 由仓储 `rowToTemplate` 读时自愈为 `defaultStart + hhmmDiffMinutes`**。

- [ ] **Step 3: 更新 usom-design.md**

若 usom-design 有对应 `TemplateRow` / `TimeboxTemplate` 小节，同步字段（与上表一致）；无则只更新最后版本日期脚注 → `2026_07_11`。

- [ ] **Step 4: 更新 CHANGELOG.md**

在 `[027-A]` 段之后追加：

```markdown
## [027-B] 时间盒模板增强（template enhance）— 2026-07-11

### 改动
- `TemplateRow` JSONB 形状重构：`{start,end}` → `{defaultStart, defaultDuration, earliestStart, latestStart, shortestDuration, activityArchetypeId}`，**无 DDL**。
- 仓储 `rowToTemplate` 读时 lazy 自愈旧形状（defaultStart=start、defaultDuration=hhmmDiffMinutes）。
- `TemplateCard` 列表行显示原型标签（custom）/来源徽章（习惯/任务/主线）。
- `RowEditor` 多行卡片化 + 行为分叉：custom 可编辑原型与全部时间/约束字段；来源行原型只读派生；habit 时间/约束只读、task/thread 可编辑（详见 plan「设计精炼」）。
- `validateTemplateRow` 纯函数 onBlur 校验。

### 决策
- 行为矩阵精炼 spec §3.4：task/thread 无时间来源，时间/约束保持可编辑（仅 habit 锁定）。
- 原型取值：来源行**读时派生**自来源对象 activityArchetypeId（非快照）。

### 验证
- vitest baseline=head 零新增；tsc 0 新增错误；pre-push hooks 全过。
```

- [ ] **Step 5: 更新 manifest.md**

在 manifest 对应位置补 `[027-B]` 入口指针（指向本 plan + spec §3）。

- [ ] **Step 6: Commit**

```bash
git add docs/database-design.md docs/usom-design.md CHANGELOG.md manifest.md
git commit -m "docs(027-B): Tier 2 同步（database-design/usom-design/CHANGELOG/manifest）"
```

---

## Task 7: 可选 prod 回填 SQL（deferred）

**Files:**
- Create: `frontend/src/lib/db/migrations/0037_optional_backfill_timebox_template_rows.sql`

> **可选**：dev 库靠自愈覆盖，无需跑。仅供 prod 用 psql 跑一次做数据整洁。**不登 journal**（纯幂等 DML，非 schema 迁移）。若 reviewer 认为不必要可整任务删除。

- [ ] **Step 1: 写幂等回填脚本**

```sql
-- [027-B] 可选 prod 回填：把 timebox_templates.rows 旧形状 {start,end} 转为新形状。
-- 纯 DML，幂等，不登 __drizzle_migrations。dev 库无需运行（仓储读时自愈）。
-- 仅处理仍含 "start" 且无 "defaultStart" 的 rows 元素。

-- 守护：仅当存在旧形状行时执行（避免无谓写）。
UPDATE timebox_templates
SET rows = (
  SELECT jsonb_agg(
    CASE
      WHEN elem ? 'start' AND NOT (elem ? 'defaultStart') THEN
        elem
          - 'start' - 'end'
          || jsonb_build_object(
               'defaultStart', elem->>'start',
               'defaultDuration',
                 (extract(epoch FROM (to_timestamp(elem->>'end','HH24:MI') - to_timestamp(elem->>'start','HH24:MI'))) / 60)::int
               )
          || jsonb_build_object('earliestStart', null, 'latestStart', null, 'shortestDuration', null, 'activityArchetypeId', null)
      ELSE elem
    END
  )
  FROM jsonb_array_elements(rows) AS t(elem)
)
WHERE rows::text LIKE '%"start"%';
```

> 注：跨午夜时长（如 23:00→07:00）在 SQL 里 `to_timestamp` 减法得负，需 implementer 现场用 `(diff + 1440) % 1440` 包一层；此处留作 implementer 按实际 PG 行为校准（自愈层已正确处理，回填仅整洁用，宁可跳过跨午夜行也不要写错）。implementer 在提交前用一个跨午夜样例验证，或在脚本注释里标注「跨午夜行留给自愈」。

- [ ] **Step 2: 不跑迁移，仅登记 + Commit**

```bash
git add frontend/src/lib/db/migrations/0037_optional_backfill_timebox_template_rows.sql
git commit -m "chore(027-B): 可选 prod 回填脚本（旧 rows 形状→新，幂等 DML，不登 journal）"
```

---

## 收尾验证（全分支 ship 前必跑）

- [ ] `cd frontend && npx tsc --noEmit` — 0 新增错误
- [ ] `cd frontend && npx vitest run` — baseline=head 零新增失败（用 base/head 失败集合对比，见 [[feedback_change-gate-baseline]]）
- [ ] pre-push hooks：`validate:manifest` 0 errors、`validate:structure` ✓
- [ ] `grep -rnE "\.start\b|\.end\b" frontend/src/domains/timebox/components/template-edit-form.tsx frontend/src/domains/timebox/components/template-card.tsx` — 不应再有 TemplateRow 的 `.start`/`.end` 访问
- [ ] 浏览器 /browse 烟测 `/timebox-templates`：新建模板（7 段新形状）→ 编辑 custom 行原型/约束 → 来源行只读原型（dev PG 落库）

---

## Self-Review

**1. Spec 覆盖**（spec §3.1–§3.5 + §4.1）：
- §3.1 形状 → Task 1 ✓
- §3.2 迁移自愈 → Task 1（normalizeTemplateRow）+ Task 2（repo 接线）+ Task 7（可选回填）✓
- §3.3 列表展示 → Task 4 ✓
- §3.4 编辑抽屉分叉 → Task 5（含精炼标记）✓
- §3.5 校验 → Task 1（validateTemplateRow）+ Task 5（onBlur 接线）✓
- §4.1 文档同步 → Task 6 ✓
- §4.3 manifest/注册 → 无新 CNUI surface，仅 Task 6 manifest 入口 ✓

**2. 占位扫描**：无 TBD/TODO；每步含可执行代码或精确 before→after。Task 7 跨午夜 SQL 已显式标注 implementer 校准（非占位，是诚实边界）。

**3. 类型一致**：`TemplateRow` 字段名（defaultStart/defaultDuration/earliestStart/latestStart/shortestDuration/activityArchetypeId）在 Task 1–5 一致；`sortRowsByDefaultStart`、`normalizeTemplateRow`、`validateTemplateRow`、`hhmmDiffMinutes` 在定义处与所有调用处签名一致；`SubscriptionSources`（habits/tasks 带 activityArchetypeId、threads 无）在 Task 3 定义、Task 5 消费一致。
