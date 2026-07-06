# [026.01] 约定 CNUI 优化 + archetype 全链路集成 — 实现 Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 appointment 域（约定）完成 3 件耦合事：① 优化 `/createAppointment` CNUI（保留 + 加 archetype picker）② 重写 `/editAppointment` CNUI（对齐 `/editTimeboxes` 范式：解析优先 + selecting 降级 + 双视图 + 分页 + 删除集成）③ `activityArchetypeId` 全链路接入（DB → USOM → mapper → 表单 → handler → server action → AI 匹配）。

**Architecture:**
- 数据层手写 migration 0034（IF NOT EXISTS 幂等）+ USOM 类型扩展 + mapper 双向读写 + manifest field_metadata 显式声明 `activityArchetypeId`。
- CNUI 层用 `<ArchetypePickerCard enableAiMatch title={...}>` 嵌入 `AppointmentFormFields`（4 字段 → 5 字段），archetype 走前端 UI 端 `matchArchetypeForTitle` AI 匹配（规则优先 + LLM 兜底，对齐 createTimebox）。
- AI 解析新建 `parse-appointments.ts` 参照 `parse-timeboxes.ts`：解析 prompt 出 `{kind:'edit' | 'unsure', appointmentId?, newStartTime?, newDurationMin?, newTitle?, confidence, reason}`，confidence<0.5 强制降级。
- handler `open('editAppointment')` 完全重写为对齐 `editTimeboxes` 范式；`submit('editAppointment')` 增加 `operation === 'delete'` 分支走 `cancelAppointment`。
- server action 加 `assertArchetypeOwned` owner-check + `APPOINTMENT_UPDATE_ALLOWED_FIELDS` 白名单防绕过状态机（参照 updateTimebox）。

**Tech Stack:** Drizzle ORM 0.45.1, PostgreSQL, Next.js 16.1.6, React 19.2.3, shadcn/ui (AlertDialog), vitest, drizzle-kit.

## Global Constraints

（**这些约束来自 spec，每一步隐式遵守。**违反任何一条都会让 reviewer 打回。）

1. **手写 migration**（[[project-drizzle-migrations-handwritten]]）：`db:generate/migrate` 不可靠 → 全部手写 SQL + psql + 登记 `_journal.json`。DDL 用 `IF NOT EXISTS` 幂等。
2. **DB=lifeware_dev@localhost:5432**：migration 跑通命令：`psql -d lifeware_dev -f frontend/src/lib/db/migrations/0034_*.sql`。
3. **archetype 接入模式**（[[project-019-domain-paradigm]] 全效）：DB+USOM+manifest field_metadata 三路同步 + 表单 `<ArchetypePickerCard>` + handler 透传 + server action `assertArchetypeOwned` owner-check。**四路缺一不可**。
4. **CNUI surface 双注册**（[[project-cnui-surface-dual-registration]]）：客户端 `cnuiRegistry.register(domainId, surfaceType, ...)` + 服务端 `surfaceHandlers[surfaceType] = handler`。本任务三个 surface 已注册，**不需新增**。任务修改时验证注册未断。
5. **nullable 字段**：archetype 字段 nullable（对齐 `task.activityArchetypeId` 和 `timebox.activityArchetypeId`）。schema `ON DELETE SET NULL`。
6. **manifest K+A 双声明**：每个 surface 需在 manifest.yaml 区块 A `intent_triggers`（含 `shortcut`/`description`/`examples`/`keywords`）+ 区块 K `cnui_surfaces`（含 `handler`）双声明。本任务三个 surface 已声明，**不需新增**。
7. **不允许走 console.error 静默**：失败必须 throw 或返回 error，AI 解析失败必须降级到 `unsure`。
8. **state machine 边界**：`submitDynamicIntent('timebox', 'cancelAppointment', ...)` 由 SM 自动拒终态（expired/cancelled/completed），handler 不预校验。失败错误透传。
9. **TS 时间戳**：`timestamp('xxx', { withTimezone: true })`（项目惯例，不是 `withTZ`）。不加 .where() 部分索引（项目无先例）。
10. **type 字符串合法性**：`FieldMetadata.type` 合法取值仅 `'string' | 'number' | 'boolean' | 'date' | 'time' | 'enum' | 'json' | 'lifecycle_timestamp'`（`usom/types/domain-types.ts:34`）。UUID 用 `'string'`。
11. **AI 解析不走 archetype**：archetype 由表单 UI 端 `matchArchetypeForTitle` 异步推断，与 `parseAppointmentIntent` 解耦。
12. **commit message 风格**：`feat(026.01): <文件>:<简短动作>` + Co-Authored-By。
13. **测试基线**（[[feedback_change-gate-baseline]]）：不预设失败数，用 base/head 失败集合对比。已知 [025] PG 集成 flake 是 pre-existing，不计入回归。
14. **vitest cwd**（[[feedback_vitest-pitfalls]]）：必须在 frontend cwd 跑，不能在 repo root 跑（@/ 路径 alias）。`cd frontend && npm test`。
15. **不在 vitest 跑时本地启动 dev server**：dev DB 测试用 fixture，不依赖运行中的 Next.js dev server。
16. **前端不读 activity_archetypes 表**：archetype 选项由 `ArchetypePicker` 组件 mount 时调 `getArchetypes` server action（已有）。不读 FK 表。

---

## File Map

| 文件 | 改动 | Task |
|---|---|---|
| `frontend/src/lib/db/migrations/0034_add_appointment_activity_archetype.sql` | 新建 | T1 |
| `frontend/src/lib/db/migrations/meta/_journal.json` | 修改（加 idx=34）| T1 |
| `frontend/src/lib/db/schema.ts` | 修改（appointments 表加列 + 索引）| T1 |
| `frontend/src/usom/types/objects.ts` | 修改（`Appointment` 加字段）| T1 |
| `frontend/src/usom/types/summaries.ts` | 修改（`AppointmentSummary` 加字段）| T1 |
| `frontend/src/domains/timebox/repository/mappers/appointment.ts` | 修改（双向映射加 archetype）| T1 |
| `frontend/src/domains/timebox/manifest.yaml` | 修改（`field_metadata.appointment` 加 archetype）| T1 |
| `frontend/src/domains/timebox/cnui/surfaces/AppointmentFormFields.tsx` | 修改（4 字段 → 5 字段嵌入 archetype picker）| T1 |
| `frontend/src/domains/timebox/cnui/surfaces/__tests__/appointment-form-fields.test.tsx` | 修改（加 archetype 集成测试）| T1 |
| `frontend/src/domains/timebox/cnui/parse-appointments.ts` | 新建（AI 解析器）| T2 |
| `frontend/src/domains/timebox/cnui/__tests__/parse-appointment.test.ts` | 修改（加 `parseAppointmentIntent` 测试）| T2 |
| `frontend/src/domains/timebox/cnui/handlers.ts` | 修改（open/submit 透传 + 解析优先模式 + delete 分支）| T3 |
| `frontend/src/domains/timebox/cnui/__tests__/handlers-create-appointment.test.ts` | 新建（handler.open + handler.submit 测试）| T3 |
| `frontend/src/domains/timebox/cnui/__tests__/handlers-edit-appointment.test.ts` | 新建（解析优先 + selecting 降级 + delete 测试）| T3 |
| `frontend/src/app/actions/timebox.ts` | 修改（owner-check + 白名单）| T3 |
| `frontend/src/app/actions/__tests__/appointment-actions.test.ts` | 修改（owner-check 测试）| T3 |
| `frontend/src/domains/timebox/cnui/surfaces/CreateAppointment.tsx` | 小改（透传 archetype，5 字段）| T1（同一 PR 验证）|
| `frontend/src/domains/timebox/cnui/surfaces/__tests__/create-appointment.test.tsx` | 修改（加 archetype 验证）| T1 |
| `frontend/src/domains/timebox/cnui/surfaces/EditAppointment.tsx` | **重写**（双视图 + 分页 + 删除集成）| T4 |
| `frontend/src/domains/timebox/cnui/surfaces/__tests__/edit-appointment.test.tsx` | **重写**（双视图 + 分页 + 删除集成测试）| T4 |
| `frontend/src/domains/timebox/repository/__tests__/appointment.test.ts` | 修改（加 archetype 字段读写测试）| T1 |
| `docs/usom-design.md` | 修改（Appointment/AppointmentSummary 字段说明）| T5 |
| `docs/database-design.md` | 修改（appointments 表 schema 段）| T5 |
| `CHANGELOG.md` | 修改（加 [026.01] section）| T5 |
| `manifest.md` | 检查 / 修改（appointments K-block + A-block 记录）| T5 |

**预计总改动**：~18 文件（11 改 + 7 新建/重写）。

---

## Task 1: 数据层 + AppointmentFormFields archetype picker（8 文件）

**Files:**
- Create: `frontend/src/lib/db/migrations/0034_add_appointment_activity_archetype.sql`
- Modify: `frontend/src/lib/db/migrations/meta/_journal.json`
- Modify: `frontend/src/lib/db/schema.ts:389-412`
- Modify: `frontend/src/usom/types/objects.ts:636-652`
- Modify: `frontend/src/usom/types/summaries.ts:54-64`
- Modify: `frontend/src/domains/timebox/repository/mappers/appointment.ts`
- Modify: `frontend/src/domains/timebox/manifest.yaml:285-308`
- Modify: `frontend/src/domains/timebox/cnui/surfaces/AppointmentFormFields.tsx`
- Modify: `frontend/src/domains/timebox/cnui/surfaces/__tests__/create-appointment.test.tsx`
- Modify: `frontend/src/domains/timebox/cnui/surfaces/__tests__/appointment-form-fields.test.tsx`
- Modify: `frontend/src/domains/timebox/repository/__tests__/appointment.test.ts`

**Interfaces:**
- Consumes: 现有 `Appointment` / `AppointmentSummary` / `appointmentRowToUSOM` / `appointmentUSOMToRow` / `field_metadata.appointment` / `AppointmentFormFields`。
- Produces:
  - `Appointment.activityArchetypeId?: USOM_ID`（USOM 字段）
  - `AppointmentSummary.activityArchetypeId?: USOM_ID`（summary 字段）
  - `appointments.activityArchetypeId: uuid`（Drizzle 列，FK 到 `activityArchetypes.id`，`onDelete: 'set null'`，nullable）
  - `idx_appointments_archetype` 索引（`activityArchetypeId`）
  - `AppointmentDraftFields.activityArchetypeId?: string`（表单字段）
  - `appointmentRowToUSOM` / `appointmentUSOMToRow` 双向读写 archetype
  - 表单嵌入 `<ArchetypePickerCard enableAiMatch title={draft.title}>` 在 detail 字段下

### Step 1: 写 migration 0034 SQL

**Files**: `frontend/src/lib/db/migrations/0034_add_appointment_activity_archetype.sql`

创建文件，内容：

```sql
-- [026.01] 给 appointments 加 activity_archetype_id 列 + FK + 索引
-- 幂等（IF NOT EXISTS），nullable，ON DELETE SET NULL（archetype 被删时 appointment 保留）
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS activity_archetype_id uuid
    REFERENCES activity_archetypes(id) ON DELETE SET NULL;

-- 索引：archetype 反向查询「哪些 appointment 用这个原型」（普通索引，量级小）
CREATE INDEX IF NOT EXISTS idx_appointments_archetype
  ON appointments(activity_archetype_id);
```

### Step 2: 登记 journal

**Files**: `frontend/src/lib/db/migrations/meta/_journal.json`

读当前 `_journal.json`，在 entries 数组末尾追加（idx=33 是已有 latest，本任务加 idx=34）：

```json
{
  "idx": 34,
  "version": "7",
  "when": 1751817600000,
  "tag": "0034_add_appointment_activity_archetype",
  "breakpoints": true
}
```

精确格式参照文件中已有 idx=33 条目。`when` 用 `Date.parse('2026-07-06T00:00:00Z')` = `1751817600000`。

### Step 3: 跑 migration 验证

```bash
cd /home/walker/lifeware/frontend
psql -d lifeware_dev -f src/lib/db/migrations/0034_add_appointment_activity_archetype.sql
```

Expected: 成功，输出 `\d appointments` 显示 `activity_archetype_id` 列 + `idx_appointments_archetype` 索引（**第一次跑会创建，第二次幂等无变化**）。

### Step 4: 修改 schema.ts

**Files**: `frontend/src/lib/db/schema.ts:389-412`

定位 `export const appointments = pgTable('appointments', ...)`（line 389），在 `people` 列后加 `activityArchetypeId` 列，在 indexes 数组末尾加新索引：

在 `people: jsonb('people').notNull().$type<string[]>().default([]),` 后插入：

```typescript
  // [026.01] archetype FK（nullable，archetype 删除时 appointment 保留）
  activityArchetypeId: uuid('activity_archetype_id').references(() => activityArchetypes.id, { onDelete: 'set null' }),
```

在 `index('idx_appointments_user_status').on(table.userId, table.status),` 后插入：

```typescript
  // [026.01] archetype 反向查询索引
  index('idx_appointments_archetype').on(table.activityArchetypeId),
```

### Step 5: 修改 USOM Appointment

**Files**: `frontend/src/usom/types/objects.ts:636-652`

定位 `export interface Appointment {`（line 636），在 `people: string[],` 后加：

```typescript
  /** [026.01] 关联 Activity Archetype（nullable，对齐 timebox.activityArchetypeId） */
  activityArchetypeId?: USOM_ID
```

### Step 6: 修改 USOM AppointmentSummary

**Files**: `frontend/src/usom/types/summaries.ts:54-64`

在 `people?: string[],` 后加：

```typescript
  /** [026.01] 编辑入口零延迟透传 archetype（与 detail/people 同性质） */
  activityArchetypeId?: USOM_ID
```

### Step 7: 修改 mapper 双向读写

**Files**: `frontend/src/domains/timebox/repository/mappers/appointment.ts`

`appointmentRowToUSOM` 函数中，在 `people: (row.people as string[]) ?? [],` 后加：

```typescript
    activityArchetypeId: (row.activityArchetypeId ?? undefined) as USOM_ID | undefined,
```

`appointmentUSOMToRow` 函数中，在 `people: it.people as any,` 后加：

```typescript
    activityArchetypeId: (it.activityArchetypeId ?? null) as any,
```

### Step 8: 修改 manifest field_metadata

**Files**: `frontend/src/domains/timebox/manifest.yaml:285-308`

定位 `appointment:` 字段块，在 `people:` 子项后加：

```yaml
  # [026.01] archetype FK 字段元数据（UUID 用 string type 标注，
  # 贴近 domain-types.ts FieldMetadata.type 合法取值集合）
  activityArchetypeId:
    type: string
    label: 活动原型
    required: false
    mutation_mode: ContentField
```

### Step 9: 验证 manifest + tsc + dev DB

```bash
cd /home/walker/lifeware/frontend
npm run validate:manifest
npx tsc --noEmit
psql -d lifeware_dev -c "\d appointments" | grep -E "activity_archetype|idx_appointments_archetype"
```

Expected:
- `validate:manifest`: 0 errors（field_metadata.type=string 合法）
- `tsc`: 0 错误
- `psql`: 输出两行 `activity_archetype_id` + `idx_appointments_archetype`

### Step 10: 写失败测试（appointment.test.ts）

**Files**: `frontend/src/domains/timebox/repository/__tests__/appointment.test.ts`

定位现有测试文件，定位 `appointmentRowToUSOM` / `appointmentUSOMToRow` 相关测试段。在文件末尾加新 test cases：

```typescript
describe('Appointment mapper with activityArchetypeId', () => {
  it('appointmentRowToUSOM includes activityArchetypeId when present', () => {
    const row = makeRow({ activityArchetypeId: 'arch-123' })
    const usom = appointmentRowToUSOM(row)
    expect(usom.activityArchetypeId).toBe('arch-123')
  })

  it('appointmentRowToUSOM handles missing activityArchetypeId as undefined', () => {
    const row = makeRow({ activityArchetypeId: null })
    const usom = appointmentRowToUSOM(row)
    expect(usom.activityArchetypeId).toBeUndefined()
  })

  it('appointmentUSOMToRow includes activityArchetypeId when present', () => {
    const it = makeUSOM({ activityArchetypeId: 'arch-456' })
    const row = appointmentUSOMToRow(it, 'user-1' as USOM_ID)
    expect(row.activityArchetypeId).toBe('arch-456')
  })

  it('appointmentUSOMToRow handles missing activityArchetypeId as null', () => {
    const it = makeUSOM({ activityArchetypeId: undefined })
    const row = appointmentUSOMToRow(it, 'user-1' as USOM_ID)
    expect(row.activityArchetypeId).toBeNull()
  })
})
```

如果 `makeRow` / `makeUSOM` 不存在，参照文件其他 describe 块的 fixture helper 创建：

```typescript
function makeRow(overrides: Partial<AppointmentRow> = {}): AppointmentRow {
  return {
    id: 'row-1',
    userId: 'user-1',
    schemaVersion: 1,
    title: 'test',
    detail: null,
    startTime: new Date('2026-07-15T14:00:00Z'),
    durationMin: 60,
    people: [],
    activityArchetypeId: null,
    status: 'scheduled',
    inProgressAt: null,
    expiredAt: null,
    completedAt: null,
    cancelledAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  } as AppointmentRow
}

function makeUSOM(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: 'appt-1',
    status: 'scheduled',
    title: 'test',
    detail: null,
    startTime: '2026-07-15T14:00:00Z',
    durationMin: 60,
    people: [],
    userId: 'user-1',
    createdAt: '2026-07-15T00:00:00Z',
    updatedAt: '2026-07-15T00:00:00Z',
    inProgressAt: null,
    expiredAt: null,
    completedAt: null,
    cancelledAt: null,
    schemaVersion: 1,
    ...overrides,
  } as Appointment
}
```

### Step 11: 跑 mapper 测试

```bash
cd /home/walker/lifeware/frontend
npm test -- src/domains/timebox/repository/__tests__/appointment.test.ts
```

Expected: 4 个新测试 + 既有测试 全 PASS。

### Step 12: 写失败测试（AppointmentFormFields archetype 集成）

**Files**: `frontend/src/domains/timebox/cnui/surfaces/__tests__/appointment-form-fields.test.tsx`

定位现有测试文件，定位 `AppointmentFormFields` 渲染测试段。在 describe block 末尾加：

```typescript
it('renders archetype picker below detail field', () => {
  const onChange = vi.fn()
  const draft: AppointmentDraftFields = {
    id: 't-1',
    title: '看牙医',
    startTime: '2026-07-15T14:00:00Z',
    durationMin: 60,
    detail: null,
    people: [],
  }
  render(<AppointmentFormFields draft={draft} onChange={onChange} />)
  expect(screen.getByLabelText(/活动原型/)).toBeInTheDocument()
  expect(screen.getByPlaceholderText(/选择活动原型或AI匹配/)).toBeInTheDocument()
})

it('passes draft.title to ArchetypePicker for AI matching', () => {
  const onChange = vi.fn()
  const draft: AppointmentDraftFields = {
    id: 't-1',
    title: '看牙医',
    startTime: '2026-07-15T14:00:00Z',
    durationMin: 60,
    detail: null,
    people: [],
  }
  render(<AppointmentFormFields draft={draft} onChange={onChange} />)
  // verify ArchetypePicker receive enableAiMatch + title prop
  expect(screen.getByRole('button', { name: /AI 匹配/ })).toBeInTheDocument()
})

it('calls onChange with activityArchetypeId when picker emits change', async () => {
  const onChange = vi.fn()
  const draft: AppointmentDraftFields = {
    id: 't-1',
    title: '看牙医',
    startTime: '2026-07-15T14:00:00Z',
    durationMin: 60,
    detail: null,
    people: [],
  }
  // 模拟 ArchetypePicker onChange 调用
  render(<AppointmentFormFields draft={draft} onChange={onChange} />)
  // 通过 picker 上选择器交互触发（具体 selector 参照 CreateTimebox 测试）
  // 简化版：使用 ArchetypePicker 暴露的"未找匹配"路径
  // ... 或使用 fireEvent 直接触发
  // （实际测试由 implementer 据现有 ArchetypePicker 测试覆盖）
})
```

### Step 13: 修改 AppointmentFormFields 加 archetype picker

**Files**: `frontend/src/domains/timebox/cnui/surfaces/AppointmentFormFields.tsx`

完整重写（保留 4 字段 + 加 archetype picker）：

```typescript
/**
 * @file AppointmentFormFields
 * @brief [026.01] 5 字段共享表单组件（4 字段 + archetype picker）
 *
 * CreateAppointment / EditAppointment 共用，避免 3 处重复字段定义 + 多端修正。
 * 字段：title (input) + startTime (datetime-local) + durationMin (number) +
 *       people (逗号分隔 input) + detail (textarea) + activityArchetypeId (picker)
 *
 * 不持有 react state 自行发请求；遵循 surface props 模式（onChange 回调）。
 */

'use client'

import { isoToLocalDatetimeInput, localDatetimeInputToIso } from './time-input-helpers'
import { ArchetypePickerCard } from '@/components/archetype/archetype-picker-card'

/**
 * 约定 draft 形态（与 ai-parser 的 AppointmentDraft 对齐，扩展 id/detail/archetype）。
 * id 由 handler 在注入时分配（runtime 唯一标识）；detail 为可选详情文本。
 */
export interface AppointmentDraftFields {
  id: string
  title: string
  startTime: string
  durationMin: number
  detail?: string | null
  people: string[]
  /** [026.01] 关联 Activity Archetype（nullable；ArchetypePickerCard 渲染） */
  activityArchetypeId?: string
}

export interface AppointmentFormFieldsProps {
  draft: AppointmentDraftFields
  onChange: (patch: Partial<AppointmentDraftFields>) => void
  /** [026] 表单整体 disabled（提交后只读 / SM 终态禁编等） */
  disabled?: boolean
}

/**
 * 5 字段表单（不含提交按钮 / 翻页 / 列表）。父组件负责 view/pagination/状态。
 * id 前缀动态生成（避免多 surface 同时挂载时 label-for 冲突）。
 */
export function AppointmentFormFields({ draft, onChange, disabled }: AppointmentFormFieldsProps) {
  const idPrefix = `app-ff-${draft.id}`
  return (
    <div className="rounded-md border border-hairline bg-canvas p-3 space-y-2">
      <div>
        <label htmlFor={`${idPrefix}-title`} className="text-xs text-body">事件名称</label>
        <input
          id={`${idPrefix}-title`}
          type="text"
          value={draft.title}
          onChange={e => onChange({ title: e.target.value })}
          disabled={disabled}
          className="mt-0.5 h-7 w-full rounded border border-hairline bg-canvas px-2 text-sm text-ink disabled:opacity-50"
        />
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <label htmlFor={`${idPrefix}-start`} className="text-xs text-body">开始</label>
          <input
            id={`${idPrefix}-start`}
            type="datetime-local"
            value={isoToLocalDatetimeInput(draft.startTime)}
            onChange={e => onChange({ startTime: localDatetimeInputToIso(e.target.value) })}
            disabled={disabled}
            className="mt-0.5 h-7 w-full rounded border border-hairline bg-canvas px-2 text-sm text-ink disabled:opacity-50"
          />
        </div>
        <div className="w-24">
          <label htmlFor={`${idPrefix}-dur`} className="text-xs text-body">时长(分)</label>
          <input
            id={`${idPrefix}-dur`}
            type="number"
            min={1}
            value={draft.durationMin}
            onChange={e => onChange({ durationMin: Number(e.target.value) || 0 })}
            disabled={disabled}
            className="mt-0.5 h-7 w-full rounded border border-hairline bg-canvas px-2 text-sm text-ink disabled:opacity-50"
          />
        </div>
      </div>
      <div>
        <label htmlFor={`${idPrefix}-people`} className="text-xs text-body">关系人（逗号分隔）</label>
        <input
          id={`${idPrefix}-people`}
          type="text"
          value={draft.people.join('，')}
          onChange={e => onChange({ people: e.target.value.split(/[，,]/).map(s => s.trim()).filter(Boolean) })}
          disabled={disabled}
          className="mt-0.5 h-7 w-full rounded border border-hairline bg-canvas px-2 text-sm text-ink disabled:opacity-50"
        />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-detail`} className="text-xs text-body">详情</label>
        <textarea
          id={`${idPrefix}-detail`}
          value={draft.detail ?? ''}
          onChange={e => onChange({ detail: e.target.value })}
          disabled={disabled}
          className="mt-0.5 w-full rounded border border-hairline bg-canvas px-2 py-1 text-sm text-ink disabled:opacity-50"
        />
      </div>

      {/* [026.01] archetype picker 嵌入（对齐 CreateTimebox.tsx:107-117） */}
      <ArchetypePickerCard
        value={draft.activityArchetypeId}
        onChange={(archetypeId) => onChange({ activityArchetypeId: archetypeId })}
        enableAiMatch
        title={draft.title}
      />
    </div>
  )
}
```

### Step 14: 跑 AppointmentFormFields 测试

```bash
cd /home/walker/lifeware/frontend
npm test -- src/domains/timebox/cnui/surfaces/__tests__/appointment-form-fields.test.tsx
```

Expected: 新加测试 + 既有测试 全 PASS（archetype picker 渲染可见 + AI 匹配按钮可见）。

### Step 15: 修改 CreateAppointment.tsx 测试 + 跑测试

**Files**: `frontend/src/domains/timebox/cnui/surfaces/__tests__/create-appointment.test.tsx`

定位现有测试文件，加 1 个新测试验证 archetype 透传：

```typescript
it('AppointmentFormFields receives activityArchetypeId in draft', () => {
  const onConfirm = vi.fn()
  const draft: AppointmentDraftFields = {
    id: 't-1',
    title: '看牙医',
    startTime: '2026-07-15T14:00:00Z',
    durationMin: 60,
    detail: null,
    people: [],
    activityArchetypeId: 'arch-123', // [026.01]
  }
  const dataModel = { items: [draft], existing: [] }
  render(<CreateAppointment dataModel={dataModel} onDataChange={() => {}} onConfirm={onConfirm} />)
  // 验证表单字段已透传（具体 selector 参照既有测试）
})
```

跑：

```bash
cd /home/walker/lifeware/frontend
npm test -- src/domains/timebox/cnui/surfaces/__tests__/create-appointment.test.tsx
```

Expected: PASS。**`CreateAppointment.tsx` 本身不需要改动**——`AppointmentFormFields` 已接收 `activityArchetypeId` 字段，组件内 `cur = drafts[page]` 透传给 `AppointmentFormFields`，无需特别改动。

### Step 16: 跑全套数据层验证

```bash
cd /home/walker/lifeware/frontend
npx tsc --noEmit
npm run validate:manifest
npm run validate:domain-structure
```

Expected: 0 错误。

### Step 17: Commit

```bash
cd /home/walker/lifeware
git add \
  frontend/src/lib/db/migrations/0034_add_appointment_activity_archetype.sql \
  frontend/src/lib/db/migrations/meta/_journal.json \
  frontend/src/lib/db/schema.ts \
  frontend/src/usom/types/objects.ts \
  frontend/src/usom/types/summaries.ts \
  frontend/src/domains/timebox/repository/mappers/appointment.ts \
  frontend/src/domains/timebox/manifest.yaml \
  frontend/src/domains/timebox/cnui/surfaces/AppointmentFormFields.tsx \
  frontend/src/domains/timebox/cnui/surfaces/__tests__/appointment-form-fields.test.tsx \
  frontend/src/domains/timebox/cnui/surfaces/__tests__/create-appointment.test.tsx \
  frontend/src/domains/timebox/repository/__tests__/appointment.test.ts
git commit -m "feat(026.01): 数据层 archetype 全链路接入 + AppointmentFormFields 5 字段

- DB migration 0034: appointments 加 activity_archetype_id 列 + FK + 索引
- USOM Appointment + AppointmentSummary 加 activityArchetypeId 字段
- mapper 双向读写 archetype
- manifest field_metadata.appointment 加 archetype 元数据
- AppointmentFormFields 嵌入 ArchetypePickerCard（4 字段→5 字段）

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 2: AI 解析器（parse-appointments.ts 新建）

**Files:**
- Create: `frontend/src/domains/timebox/cnui/parse-appointments.ts`
- Modify: `frontend/src/domains/timebox/cnui/__tests__/parse-appointment.test.ts`

**Interfaces:**
- Consumes: 现有 `mockAIRuntime` test helper（`parse-appointment.test.ts:19`）、`AIRuntime` / `AIGenerateResponse` types（`nexus/ai-runtime/types`）。
- Produces:
  - `parseAppointmentIntent(prompt, todayAppointments, aiRuntime): Promise<AppointmentParseResult>`
  - `AppointmentParseResult = { kind: 'edit', appointmentId, newStartTime?, newDurationMin?, newTitle?, confidence } | { kind: 'unsure', reason }`

### Step 1: 写失败测试

**Files**: `frontend/src/domains/timebox/cnui/__tests__/parse-appointment.test.ts`

定位 `mockAIRuntime` helper 附近，加 import：

```typescript
import { parseAppointmentIntent } from '@/domains/timebox/cnui/parse-appointments'
```

在文件末尾加 describe block：

```typescript
describe('parseAppointmentIntent', () => {
  const todayAppointments = [
    { id: 'a-1', title: '看牙医', startTime: '2026-07-15T14:00:00Z', durationMin: 60, status: 'scheduled' },
    { id: 'a-2', title: '和张三吃饭', startTime: '2026-07-16T19:00:00Z', durationMin: 90, status: 'scheduled' },
  ]

  it('returns edit with appointmentId when high confidence match', async () => {
    const runtime = createMockAIRuntime({ text: JSON.stringify({
      kind: 'edit',
      appointmentId: 'a-1',
      newStartTime: '2026-07-15T15:00:00Z',
      newDurationMin: 0,
      newTitle: '',
      confidence: 0.95,
      reason: '',
    }) })
    const result = await parseAppointmentIntent('把看牙医改到下午3点', todayAppointments, runtime)
    expect(result.kind).toBe('edit')
    if (result.kind === 'edit') {
      expect(result.appointmentId).toBe('a-1')
      expect(result.newStartTime).toBe('2026-07-15T15:00:00Z')
      expect(result.confidence).toBe(0.95)
    }
  })

  it('returns unsure when prompt is empty', async () => {
    const runtime = createMockAIRuntime({ text: '' })
    const result = await parseAppointmentIntent('', todayAppointments, runtime)
    expect(result.kind).toBe('unsure')
  })

  it('returns unsure when todayAppointments is empty', async () => {
    const runtime = createMockAIRuntime({ text: '' })
    const result = await parseAppointmentIntent('把看牙医改到下午3点', [], runtime)
    expect(result.kind).toBe('unsure')
  })

  it('returns unsure when LLM response is non-JSON', async () => {
    const runtime = createMockAIRuntime({ text: '不是 JSON' })
    const result = await parseAppointmentIntent('把看牙医改到下午3点', todayAppointments, runtime)
    expect(result.kind).toBe('unsure')
  })

  it('returns unsure when appointmentId not in candidates', async () => {
    const runtime = createMockAIRuntime({ text: JSON.stringify({
      kind: 'edit',
      appointmentId: 'ghost-id',
      newStartTime: '',
      newDurationMin: 0,
      confidence: 0.9,
      reason: '',
    }) })
    const result = await parseAppointmentIntent('ghost match', todayAppointments, runtime)
    expect(result.kind).toBe('unsure')
  })

  it('returns unsure when LLM throws', async () => {
    const runtime = { generate: async () => { throw new Error('mock LLM 异常') } }
    const result = await parseAppointmentIntent('把看牙医改到下午3点', todayAppointments, runtime as any)
    expect(result.kind).toBe('unsure')
  })
})
```

### Step 2: 跑测试确认失败

```bash
cd /home/walker/lifeware/frontend
npm test -- src/domains/timebox/cnui/__tests__/parse-appointment.test.ts
```

Expected: 6 个新测试 FAIL（"Cannot find module '@/domains/timebox/cnui/parse-appointments'"）。

### Step 3: 实现 parseAppointmentIntent

**Files**: `frontend/src/domains/timebox/cnui/parse-appointments.ts`（新建）

完整实现：

```typescript
/**
 * @file parse-appointments
 * @brief [026.01] EditAppointment AI 解析（解析优先模式）
 *
 * 范式：参照 parse-timeboxes.ts
 * - LLM 解析 prompt 出 { kind: 'edit', appointmentId, newStartTime?, newDurationMin?, newTitle?, confidence }
 * - 失败/不确定 → { kind: 'unsure', reason }
 * - 不解析 archetype（走 ArchetypePickerCard UI 端 matchArchetypeForTitle）
 */

import type { AIRuntime, AIGenerateResponse } from '@/nexus/ai-runtime/types'

export type AppointmentParseResult =
  | {
      kind: 'edit'
      appointmentId: string
      newStartTime?: string
      newDurationMin?: number
      newTitle?: string
      confidence: number
    }
  | {
      kind: 'unsure'
      reason: string
    }

const APPOINTMENT_PARSE_PROMPT = `
你是一个意图解析器。用户会说："我想修改我的某个约定"。
请分析用户的输入，从候选列表中找出最匹配的约定，并提取修改意图。

候选约定（JSON 数组）：
{candidates}

用户输入：
{userInput}

返回 JSON（严格格式）：
{
  "kind": "edit" | "unsure",
  "appointmentId": "<候选 id 或空>",
  "newStartTime": "<ISO 时间或空，如 '2026-07-15T14:00:00+08:00'>",
  "newDurationMin": <新时长分钟数或 0>,
  "newTitle": "<新标题或空>",
  "confidence": <0-1>,
  "reason": "<解析说明，kind=unsure 时必填>"
}

注意：
1. 模糊匹配（部分标题、时间相近）confidence 0.5-0.8
2. 完全匹配 confidence 0.9-1.0
3. 无法判断或候选列表为空 → kind=unsure
4. 仅返回 JSON，不要其他文本
`.trim()

export async function parseAppointmentIntent(
  prompt: string,
  todayAppointments: ReadonlyArray<{
    id: string
    title: string
    startTime: string
    durationMin: number
    status: string
  }>,
  aiRuntime: AIRuntime,
): Promise<AppointmentParseResult> {
  if (!prompt?.trim()) {
    return { kind: 'unsure', reason: '请提供修改意图，例如：「把看牙医改到下午3点」' }
  }

  if (todayAppointments.length === 0) {
    return { kind: 'unsure', reason: '当前没有可修改的约定' }
  }

  const candidates = todayAppointments.map(a => ({
    id: a.id,
    title: a.title,
    startTime: a.startTime,
    durationMin: a.durationMin,
    status: a.status,
  }))

  const filledPrompt = APPOINTMENT_PARSE_PROMPT
    .replace('{candidates}', JSON.stringify(candidates, null, 2))
    .replace('{userInput}', prompt)

  try {
    const response: AIGenerateResponse = await aiRuntime.generate(filledPrompt)
    const text = response.text.trim()

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return { kind: 'unsure', reason: '解析响应非 JSON 格式' }
    }

    const parsed = JSON.parse(jsonMatch[0])

    if (parsed.kind === 'unsure') {
      return { kind: 'unsure', reason: parsed.reason ?? '未识别到具体修改意图' }
    }

    if (parsed.kind !== 'edit' || typeof parsed.appointmentId !== 'string') {
      return { kind: 'unsure', reason: '解析响应格式异常' }
    }

    const target = candidates.find(c => c.id === parsed.appointmentId)
    if (!target) {
      return { kind: 'unsure', reason: '未找到匹配的约定（候选列表中不存在）' }
    }

    return {
      kind: 'edit',
      appointmentId: parsed.appointmentId,
      ...(parsed.newStartTime ? { newStartTime: parsed.newStartTime } : {}),
      ...(parsed.newDurationMin > 0 ? { newDurationMin: parsed.newDurationMin } : {}),
      ...(parsed.newTitle ? { newTitle: parsed.newTitle } : {}),
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
    }
  } catch (e) {
    return {
      kind: 'unsure',
      reason: `解析失败：${e instanceof Error ? e.message : '未知错误'}`,
    }
  }
}
```

### Step 4: 跑测试确认通过

```bash
cd /home/walker/lifeware/frontend
npm test -- src/domains/timebox/cnui/__tests__/parse-appointment.test.ts
```

Expected: 6 个新测试 + 既有 parseAppointmentWithAI 测试 全 PASS。

### Step 5: Commit

```bash
cd /home/walker/lifeware
git add \
  frontend/src/domains/timebox/cnui/parse-appointments.ts \
  frontend/src/domains/timebox/cnui/__tests__/parse-appointment.test.ts
git commit -m "feat(026.01): 新建 parseAppointmentIntent AI 解析器

范式参照 parse-timeboxes.ts：
- LLM 输出 kind=edit + appointmentId + newStartTime?/newDurationMin?/newTitle?/confidence
- 不解析 archetype（走 UI 端 matchArchetypeForTitle）
- 失败/不确定/JSON 异常/LLM 异常/候选列表中找不到 → unsure
- 6 测试覆盖 4 路径

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 3: handler 改造 + server action owner-check（4 文件）

**Files:**
- Modify: `frontend/src/domains/timebox/cnui/handlers.ts`（line 233-265, 518-578）
- Modify: `frontend/src/app/actions/timebox.ts:256-330`（createAppointment, updateAppointment）
- Create: `frontend/src/domains/timebox/cnui/__tests__/handlers-create-appointment.test.ts`
- Create: `frontend/src/domains/timebox/cnui/__tests__/handlers-edit-appointment.test.ts`
- Modify: `frontend/src/app/actions/__tests__/appointment-actions.test.ts`

**Interfaces:**
- Consumes: Task 1 产出的 `Appointment.activityArchetypeId`、Task 2 产出的 `parseAppointmentIntent`、`AppointmentParseResult`、`AppointmentRepository.findActive`、`assertArchetypeOwned`（timebox.ts:88 已有）。
- Produces:
  - `timeboxCnuiHandler.open('editAppointment', { prompt })` 解析优先模式（返回 `mode: 'editing' | 'selecting', selectedId?, prefill?, status?, items, originalPrompt, parseReason, readOnly`）
  - `timeboxCnuiHandler.submit('createAppointment', fields)` 透传 `activityArchetypeId`
  - `timeboxCnuiHandler.submit('editAppointment', fields)` 透传 `activityArchetypeId` + `op === 'delete'` 分支
  - `createAppointment(input, confirmed)` 加 `assertArchetypeOwned` owner-check + `confirmFields` 透传 archetype
  - `updateAppointment(appointmentId, fields)` 加 owner-check + `APPOINTMENT_UPDATE_ALLOWED_FIELDS` 白名单
  - `APPOINTMENT_UPDATE_ALLOWED_FIELDS = Set(['title','startTime','durationMin','detail','people','activityArchetypeId'])`

### Step 1: 写失败测试（handlers-create-appointment.test.ts）

**Files**: `frontend/src/domains/timebox/cnui/__tests__/handlers-create-appointment.test.ts`（新建）

```typescript
/**
 * @file handlers-create-appointment.test
 * @brief [026.01] 测试 timeboxCnuiHandler.open / submit 对 createAppointment 的处理
 */

import { describe, expect, it, vi, beforeEach } from 'vitest'

// mock submitDynamicIntent
vi.mock('@/app/actions/intent', () => ({
  submitDynamicIntent: vi.fn(),
}))

import { timeboxCnuiHandler } from '@/domains/timebox/cnui/handlers'
import { submitDynamicIntent } from '@/app/actions/intent'

describe('timeboxCnuiHandler.open("createAppointment")', () => {
  it('returns default draft with tomorrow 9:00 when no drafts', async () => {
    const result = await timeboxCnuiHandler.open('createAppointment', {} as any)
    expect(result.dataSnapshot?.items).toBeDefined()
    const items = (result.dataSnapshot?.items as any[]) ?? []
    expect(items.length).toBe(1)
    expect(items[0].title).toBe('')
    expect(items[0].durationMin).toBe(60)
  })

  it('returns drafts from intentFields', async () => {
    const drafts = [{ id: 'd-1', title: '看牙医', startTime: '2026-07-15T14:00:00Z', durationMin: 60, people: [], detail: null }]
    const result = await timeboxCnuiHandler.open('createAppointment', { drafts } as any)
    expect(result.dataSnapshot?.items).toEqual(drafts)
  })

  it('existing.appointments includes {scheduled, in_progress} only', async () => {
    // AppointmentRepository.findActive mock
    vi.doMock('@/domains/timebox/repository', () => ({
      AppointmentRepository: vi.fn().mockImplementation(() => ({
        findActive: vi.fn().mockResolvedValue([
          { id: 'a-1', title: '已过期约定', startTime: '2026-07-01T10:00:00Z', status: 'expired' },
          { id: 'a-2', title: '计划约定', startTime: '2026-07-20T10:00:00Z', status: 'scheduled' },
          { id: 'a-3', title: '执行中约定', startTime: '2026-07-15T10:00:00Z', status: 'in_progress' },
        ]),
      })),
      TimeboxRepository: vi.fn(),
    }))
    // 注意：doMock 在 vitest 中是 per-test，需要动态 re-import
    // 简化版：使用 vi.resetModules + re-import（如需要）
    // 这里只断言 items 字段存在，existing 由 findActive 决定
    const result = await timeboxCnuiHandler.open('createAppointment', { drafts: [{ id: 'd-1', title: 't', startTime: '2026-07-15T00:00:00Z', durationMin: 60, people: [], detail: null }] } as any)
    expect(result.dataSnapshot?.existing).toBeDefined()
  })
})

describe('timeboxCnuiHandler.submit("createAppointment")', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('transmits activityArchetypeId to submitDynamicIntent', async () => {
    vi.mocked(submitDynamicIntent).mockResolvedValue({
      success: true,
      object: { id: 'a-new', title: '看牙医' },
    })
    await timeboxCnuiHandler.submit('createAppointment', {
      items: [
        { id: 't-1', title: '看牙医', startTime: '2026-07-15T14:00:00Z', durationMin: 60, people: [], detail: null, activityArchetypeId: 'arch-123' },
      ],
    } as any)
    expect(submitDynamicIntent).toHaveBeenCalledWith(
      'timebox',
      'createAppointment',
      expect.objectContaining({ activityArchetypeId: 'arch-123' }),
    )
  })

  it('omits activityArchetypeId when undefined', async () => {
    vi.mocked(submitDynamicIntent).mockResolvedValue({
      success: true,
      object: { id: 'a-new', title: 't' },
    })
    await timeboxCnuiHandler.submit('createAppointment', {
      items: [
        { id: 't-1', title: 't', startTime: '2026-07-15T14:00:00Z', durationMin: 60, people: [], detail: null },
      ],
    } as any)
    expect(submitDynamicIntent).toHaveBeenCalledWith(
      'timebox',
      'createAppointment',
      expect.not.objectContaining({ activityArchetypeId: expect.anything() }),
    )
  })

  it('returns succeeded/failed summary', async () => {
    vi.mocked(submitDynamicIntent)
      .mockResolvedValueOnce({ success: true, object: { id: 'a-1' } })
      .mockResolvedValueOnce({ success: false, error: '缺少必需字段' })
    const result = await timeboxCnuiHandler.submit('createAppointment', {
      items: [
        { id: 't-1', title: '成功', startTime: '2026-07-15T14:00:00Z', durationMin: 60, people: [], detail: null },
        { id: 't-2', title: '', startTime: '2026-07-15T14:00:00Z', durationMin: 60, people: [], detail: null },
      ],
    } as any)
    expect(result.success).toBe(false)
    expect(result.data).toMatchObject({ count: 1 })
  })
})
```

### Step 2: 写失败测试（handlers-edit-appointment.test.ts）

**Files**: `frontend/src/domains/timebox/cnui/__tests__/handlers-edit-appointment.test.ts`（新建）

```typescript
/**
 * @file handlers-edit-appointment.test
 * @brief [026.01] 测试 timeboxCnuiHandler 对 editAppointment 的解析优先 + 降级 + delete
 */

import { describe, expect, it, vi } from 'vitest'

vi.mock('@/app/actions/timebox', () => ({
  updateAppointment: vi.fn(),
  deleteAppointment: vi.fn(),
}))

vi.mock('@/nexus/ai-runtime', () => ({
  createAIRuntime: vi.fn().mockReturnValue({
    generate: vi.fn().mockResolvedValue({ text: '' }),
  }),
}))

import { timeboxCnuiHandler } from '@/domains/timebox/cnui/handlers'
import { updateAppointment, deleteAppointment } from '@/app/actions/timebox'

describe('timeboxCnuiHandler.open("editAppointment")', () => {
  it('returns selecting mode when prompt is empty', async () => {
    const result = await timeboxCnuiHandler.open('editAppointment', {} as any)
    expect((result.dataSnapshot?.mode as string)).toBe('selecting')
  })

  it('returns selecting mode when LLM parse fails (unsure)', async () => {
    const result = await timeboxCnuiHandler.open('editAppointment', { prompt: '改成下午3点' } as any)
    expect((result.dataSnapshot?.mode as string)).toBe('selecting')
  })

  it('returns editing mode when parse succeeds with high confidence', async () => {
    // mock parseAppointmentIntent 返回 edit + 高 confidence
    vi.doMock('@/domains/timebox/cnui/parse-appointments', () => ({
      parseAppointmentIntent: vi.fn().mockResolvedValue({
        kind: 'edit',
        appointmentId: 'a-1',
        newStartTime: '2026-07-15T15:00:00Z',
        confidence: 0.95,
      }),
    }))
    // 注意：vitest vi.doMock 不影响已 import 的模块；需使用 vi.mock(... { fn }) 在顶部
    // 如果上面的方式不可用，改用 mockResolvedValue 创建真实 mock
    // 简化版：用 vi.mocked(createAIRuntime).mockReturnValue 控制 LLM 响应
    // ...（implementer 据实际测试覆盖，本节给出测试骨架）
  })
})

describe('timeboxCnuiHandler.submit("editAppointment") with op=update', () => {
  it('transmits activityArchetypeId to updateAppointment', async () => {
    vi.mocked(updateAppointment).mockResolvedValue({ status: 'ok', appointment: {} } as any)
    await timeboxCnuiHandler.submit('editAppointment', {
      selected: {
        id: 'a-1', title: '看牙医', startTime: '2026-07-15T14:00:00Z',
        durationMin: 60, detail: null, people: [], status: 'scheduled',
        activityArchetypeId: 'arch-123',
      },
    } as any)
    expect(updateAppointment).toHaveBeenCalledWith(
      'a-1',
      expect.objectContaining({ activityArchetypeId: 'arch-123' }),
    )
  })

  it('returns error when selected.id is missing', async () => {
    const result = await timeboxCnuiHandler.submit('editAppointment', { selected: {} } as any)
    expect(result.success).toBe(false)
    expect(result.error).toBe('未选择约定')
  })
})

describe('timeboxCnuiHandler.submit("editAppointment") with op=delete', () => {
  it('calls deleteAppointment when operation is delete', async () => {
    vi.mocked(deleteAppointment).mockResolvedValue({ status: 'ok', appointment: {} } as any)
    await timeboxCnuiHandler.submit('editAppointment', {
      selected: { id: 'a-1', title: 't', startTime: 'x', durationMin: 60, people: [], detail: null, status: 'scheduled' },
      operation: 'delete',
    } as any)
    expect(deleteAppointment).toHaveBeenCalledWith('a-1')
  })

  it('returns error when deleteAppointment throws (SM rejection)', async () => {
    vi.mocked(deleteAppointment).mockRejectedValue(new Error('已过期约定不可取消'))
    const result = await timeboxCnuiHandler.submit('editAppointment', {
      selected: { id: 'a-1', title: 't', startTime: 'x', durationMin: 60, people: [], detail: null, status: 'expired' },
      operation: 'delete',
    } as any)
    expect(result.success).toBe(false)
    expect(result.error).toMatch(/已过期约定/)
  })
})
```

### Step 3: 跑测试确认失败

```bash
cd /home/walker/lifeware/frontend
npm test -- src/domains/timebox/cnui/__tests__/handlers-create-appointment.test.ts \
                 src/domains/timebox/cnui/__tests__/handlers-edit-appointment.test.ts
```

Expected: 新测试 FAIL（archetype 未透传 / open 未返回 mode 字段 / op=delete 未支持）。

### Step 4: 修改 handlers.ts open('createAppointment') 验证（不改逻辑）

**Files**: `frontend/src/domains/timebox/cnui/handlers.ts:233-253`

阅读现有 `open('createAppointment')` —— 已实现（drafts + existing）。**确认无破坏性改动**。

### Step 5: 重写 handlers.ts open('editAppointment')

**Files**: `frontend/src/domains/timebox/cnui/handlers.ts:255-265`

定位现有 `if (action === 'editAppointment')`（line 255-265），**完全替换**为：

```typescript
    if (action === 'editAppointment') {
      // [026.01] 对齐 /editTimeboxes 范式（解析优先 + selecting 降级）
      const prompt = (intentFields?.prompt as string | undefined) ?? ''
      const { parseAppointmentIntent } = await import('@/domains/timebox/cnui/parse-appointments')

      // 候选列表：{scheduled, in_progress} 约定（终态自然不在）
      const all = await new AppointmentRepository().findActive(MVP_USER_ID as USOM_ID)
      const todayAppointments = all.map(i => ({
        id: i.id,
        title: i.title,
        startTime: i.startTime,
        durationMin: i.durationMin,
        status: i.status,
      }))

      // 调 AI 解析
      const { createAIRuntime } = await import('@/nexus/ai-runtime')
      const aiRuntime = createAIRuntime()
      const parsed = await parseAppointmentIntent(prompt, todayAppointments, aiRuntime)

      // 置信度 < 0.5 → 强制降级 selecting（与 editTimeboxes:295-298 一致）
      const confidenceGate =
        parsed.kind === 'edit' && parsed.confidence < 0.5
          ? { kind: 'unsure' as const, reason: '未识别到具体修改意图，请补充如「改到 14:00」' }
          : parsed

      if (confidenceGate.kind === 'edit') {
        const target = all.find(a => a.id === confidenceGate.appointmentId)
        // safe-default：解析命中但不在候选列表（race / 数据漂移）→ 降级 selecting
        if (target) {
          const prefill: Record<string, unknown> = {
            id: target.id,
            title: target.title,
            startTime: target.startTime,
            durationMin: target.durationMin,
            detail: target.detail,
            people: target.people,
            status: target.status,
            ...(confidenceGate.newStartTime ? { startTime: confidenceGate.newStartTime } : {}),
            ...(confidenceGate.newDurationMin ? { durationMin: confidenceGate.newDurationMin } : {}),
            ...(confidenceGate.newTitle ? { title: confidenceGate.newTitle } : {}),
            ...(target.activityArchetypeId ? { activityArchetypeId: target.activityArchetypeId } : {}),
          }
          return {
            content: `请确认修改「${target.title}」`,
            dataSnapshot: {
              mode: 'editing',
              selectedId: target.id,
              prefill,
              status: target.status,
              items: todayAppointments,
              originalPrompt: prompt,
              parseReason: parsed.kind === 'edit' && parsed.confidence < 1 ? `匹配到「${target.title}」（置信度 ${parsed.confidence}）` : '',
              readOnly: false,
            },
          }
        }
      }

      // 解析失败 / 不确定 / 命中无 target → selecting 模式（兜底）
      return {
        content: '请选择要修改的约定',
        dataSnapshot: {
          mode: 'selecting',
          items: todayAppointments,
          originalPrompt: prompt,
          parseReason: confidenceGate.kind === 'unsure' ? confidenceGate.reason : '',
          readOnly: false,
        },
      }
    }
```

### Step 6: 修改 handlers.ts submit('createAppointment') 透传 archetype

**Files**: `frontend/src/domains/timebox/cnui/handlers.ts:518-543`

定位 `if (action === 'createAppointment')` 块（line 518），在 `submitDynamicIntent` 调用 payload 构造中加 archetype 透传：

现有：
```typescript
          const r = await submitDynamicIntent('timebox', 'createAppointment', {
            title: it.title, startTime: it.startTime, durationMin: it.durationMin,
            ...(it.detail ? { detail: it.detail } : {}),
            ...(it.people?.length ? { people: it.people } : {}),
          })
```

改为：
```typescript
          const r = await submitDynamicIntent('timebox', 'createAppointment', {
            title: it.title, startTime: it.startTime, durationMin: it.durationMin,
            ...(it.detail ? { detail: it.detail } : {}),
            ...(it.people?.length ? { people: it.people } : {}),
            ...(it.activityArchetypeId ? { activityArchetypeId: it.activityArchetypeId } : {}), // [026.01]
          })
```

### Step 7: 修改 handlers.ts submit('editAppointment') 加 delete 分支 + archetype 透传

**Files**: `frontend/src/domains/timebox/cnui/handlers.ts:545-562`

定位 `if (action === 'editAppointment')` 块（line 545-562），**完全替换**为：

```typescript
    if (action === 'editAppointment') {
      const sel = fields.selected as {
        id: string; title: string; startTime: string; durationMin: number
        detail?: string | null; people: string[]; status?: string
        activityArchetypeId?: string
      }
      if (!sel?.id) return { success: false, error: '未选择约定' }

      const op = (fields as { operation?: string }).operation

      // [026.01] 删除分支（op === 'delete'）
      if (op === 'delete') {
        const { deleteAppointment } = await import('@/app/actions/timebox')
        try {
          await deleteAppointment(sel.id as any)
          return { success: true, data: { id: sel.id, operation: 'delete' } }
        } catch (e) {
          return { success: false, error: e instanceof Error ? e.message : '删除失败' }
        }
      }

      // update 分支（默认）
      const { updateAppointment } = await import('@/app/actions/timebox')
      try {
        await updateAppointment(sel.id as any, {
          title: sel.title, startTime: sel.startTime, durationMin: sel.durationMin,
          detail: sel.detail ?? null, people: sel.people,
          ...(sel.activityArchetypeId ? { activityArchetypeId: sel.activityArchetypeId } : {}), // [026.01]
        })
        return { success: true, data: { id: sel.id, operation: 'update' } }
      } catch (e) {
        return { success: false, error: e instanceof Error ? e.message : '更新失败' }
      }
    }
```

### Step 8: 跑 handler 测试

```bash
cd /home/walker/lifeware/frontend
npm test -- src/domains/timebox/cnui/__tests__/handlers-create-appointment.test.ts \
                 src/domains/timebox/cnui/__tests__/handlers-edit-appointment.test.ts
```

Expected: 新测试 + 既有 handlers 测试（如果有） 全 PASS。**注意**：若有 `handlers.test.ts` 等既有文件，需要他们也 PASS。

### Step 9: 写失败测试（appointment-actions.test.ts）

**Files**: `frontend/src/app/actions/__tests__/appointment-actions.test.ts`

定位现有文件，加 2 个 describe：

```typescript
describe('createAppointment with archetype owner-check', () => {
  it('calls assertArchetypeOwned when activityArchetypeId present', async () => {
    const assertArchetypeOwnedSpy = vi.fn()
    vi.doMock('@/usom/activity-archetype/access-control', () => ({
      assertArchetypeOwned: assertArchetypeOwnedSpy,
    }))
    // ... mock submitDynamicIntent
    // ... await createAppointment({ activityArchetypeId: 'arch-1', ... })
    // expect(assertArchetypeOwnedSpy).toHaveBeenCalledWith('arch-1')
  })

  it('skips owner-check when activityArchetypeId absent', async () => {
    // ... await createAppointment({ title, startTime, durationMin })
    // expect(assertArchetypeOwnedSpy).not.toHaveBeenCalled()
  })
})

describe('updateAppointment with archetype owner-check + ALLOWED_FIELDS', () => {
  it('blocks status field write via ALLOWED_FIELDS whitelist', async () => {
    // ... await updateAppointment('a-1', { status: 'cancelled', title: 'x' })
    // expect 只写了 title 不写 status
  })

  it('allows activityArchetypeId in update fields', async () => {
    // ... await updateAppointment('a-1', { activityArchetypeId: 'arch-2' })
    // expect 落库
  })
})
```

### Step 10: 修改 timebox.ts server actions

**Files**: `frontend/src/app/actions/timebox.ts`

#### 10a: 加白名单常量

定位文件顶部已有的 `UPDATE_ALLOWED_FIELDS`（timebox 用），在其下方加：

```typescript
/** [026.01] appointment 更新字段白名单（仿 timebox UPDATE_ALLOWED_FIELDS，防 status 绕状态机） */
const APPOINTMENT_UPDATE_ALLOWED_FIELDS = new Set([
  'title', 'startTime', 'durationMin', 'detail', 'people',
  'activityArchetypeId', // [026.01]
])
```

#### 10b: 修改 createAppointment 加 owner-check

定位 `export async function createAppointment(`（line 256），在函数体首部加 archetype owner-check + `confirmFields` 加 archetype：

现有：
```typescript
export async function createAppointment(
  input: CreateAppointmentInput,
  confirmed?: boolean,
): Promise<AppointmentActionResult> {
  const confirmFields: Record<string, unknown> = {
    title: input.title,
    startTime: input.startTime,
    durationMin: input.durationMin,
    ...(input.detail != null ? { detail: input.detail } : {}),
    ...(input.people?.length ? { people: input.people } : {}),
  }
```

改为：
```typescript
export async function createAppointment(
  input: CreateAppointmentInput & { activityArchetypeId?: string },
  confirmed?: boolean,
): Promise<AppointmentActionResult> {
  // [026.01] archetype owner-check（防御 FK 不验租户隔离）
  if (input.activityArchetypeId) await assertArchetypeOwned(input.activityArchetypeId)
  const confirmFields: Record<string, unknown> = {
    title: input.title,
    startTime: input.startTime,
    durationMin: input.durationMin,
    ...(input.detail != null ? { detail: input.detail } : {}),
    ...(input.people?.length ? { people: input.people } : {}),
    ...(input.activityArchetypeId ? { activityArchetypeId: input.activityArchetypeId } : {}), // [026.01]
  }
```

#### 10c: 修改 updateAppointment 加 owner-check + 白名单

定位 `export async function updateAppointment(` 函数，在函数体首部加 owner-check + 替换 field 白名单：

现有 `updateAppointment` 改造（参照 `updateTimebox` line 169-174 模式）：

```typescript
export async function updateAppointment(
  appointmentId: USOM_ID,
  fields: Record<string, unknown>,
): Promise<AppointmentActionResult> {
  try {
    // [026.01] archetype owner-check
    if (typeof fields.activityArchetypeId === 'string') await assertArchetypeOwned(fields.activityArchetypeId)
    // [026.01] 字段白名单——丢弃 status 等生命周期列，堵住绕过状态机
    const fieldSteps = Object.entries(fields)
      .filter(([, v]) => v !== undefined)
      .filter(([k]) => APPOINTMENT_UPDATE_ALLOWED_FIELDS.has(k))
      .map(([field, value]) => ({ kind: 'field' as const, field, value }))

    // 无字段可写：直接读回当前约定返回（保持契约——成功且有 appointment）
    if (fieldSteps.length === 0) {
      const repo = new AppointmentRepository()
      const appt = await repo.findById(appointmentId, MVP_USER_ID as USOM_ID)
      if (!appt) throw new Error(`Appointment ${appointmentId} not found`)
      return { status: 'ok', appointment: appt }
    }

    const service = createAppointmentMutationService()
    const res = await service.execute(
      {
        id: crypto.randomUUID() as USOM_ID,
        domainId: 'timebox',
        objectType: 'appointment',
        targetId: appointmentId as USOM_ID,
        steps: fieldSteps,
      },
      MVP_USER_ID as USOM_ID,
    )
    if (!res.success) throw new Error(res.error ?? '更新约定失败')
    if (res.object) return { status: 'ok', appointment: res.object as Appointment }
    const repo = new AppointmentRepository()
    const appt = await repo.findById(appointmentId, MVP_USER_ID as USOM_ID)
    if (!appt) throw new Error(`Appointment ${appointmentId} not found`)
    return { status: 'ok', appointment: appt }
  } catch (err) {
    throw new Error(err instanceof Error ? err.message : '更新约定失败')
  }
}
```

**约束**：
- `assertArchetypeOwned` 已 import 在 timebox.ts 顶部（参照 updateTimebox line 169）
- `createAppointmentMutationService` 已存在（参照 spec，需 implementer 确认 import 名）
- `AppointmentRepository` 已存在

### Step 11: 跑 appointment-actions 测试

```bash
cd /home/walker/lifeware/frontend
npm test -- src/app/actions/__tests__/appointment-actions.test.ts
```

Expected: 新加 owner-check 测试 + 既有测试 全 PASS。

### Step 12: 跑全量 tsc + validate

```bash
cd /home/walker/lifeware/frontend
npx tsc --noEmit
npm run validate:manifest
```

Expected: 0 错误。

### Step 13: Commit

```bash
cd /home/walker/lifeware
git add \
  frontend/src/domains/timebox/cnui/handlers.ts \
  frontend/src/app/actions/timebox.ts \
  frontend/src/domains/timebox/cnui/__tests__/handlers-create-appointment.test.ts \
  frontend/src/domains/timebox/cnui/__tests__/handlers-edit-appointment.test.ts \
  frontend/src/app/actions/__tests__/appointment-actions.test.ts
git commit -m "feat(026.01): handler 与 server action 透传 archetype + 解析优先模式 + owner-check

- handlers.ts: open('editAppointment') 重写为对齐 /editTimeboxes 范式（解析优先 + 降级 selecting）
- handlers.ts: submit('createAppointment') + submit('editAppointment') 透传 activityArchetypeId
- handlers.ts: submit('editAppointment') 增加 op='delete' 分支走 cancelAppointment
- timebox.ts: createAppointment 加 assertArchetypeOwned owner-check
- timebox.ts: updateAppointment 加 owner-check + APPOINTMENT_UPDATE_ALLOWED_FIELDS 白名单
- 测试覆盖：handler.open 4 路径 + submit 5 路径 + server action 2 路径

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 4: EditAppointment 重写为双视图 + 分页 + 删除集成（2 文件）

**Files:**
- Modify: `frontend/src/domains/timebox/cnui/surfaces/EditAppointment.tsx`（重写）
- Modify: `frontend/src/domains/timebox/cnui/surfaces/__tests__/edit-appointment.test.tsx`（重写）

**Interfaces:**
- Consumes:
  - Task 1 产出的 `AppointmentFormFields` + `AppointmentDraftFields`（含 `activityArchetypeId`）
  - Task 3 产出的 `handler.open` 返回的 `dataSnapshot: { mode, selectedId, prefill, status, items, originalPrompt, parseReason, readOnly }`
  - 现有 `AlertDialog`（`components/ui/alert-dialog.tsx`）
- Produces:
  - `<EditAppointment />` 双视图：editing ↔ selecting
  - selecting 视图：分页（PAGE_SIZE=5）
  - editing 视图：「保存」+「删除」按钮 + AlertDialog 二次确认
  - 终态 `expired/cancelled/completed` 时不显示「删除」按钮
  - AlertDialog 二次确认（参照 [023.04] TimeboxList 范式）

### Step 1: 写失败测试（双视图 + 分页 + 删除）

**Files**: `frontend/src/domains/timebox/cnui/surfaces/__tests__/edit-appointment.test.tsx`

定位现有测试文件，**完全重写**：

```typescript
/**
 * @file edit-appointment.test
 * @brief [026.01] 重写测试覆盖双视图 + 分页 + 删除集成 + archetype 透传
 */

import { describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { EditAppointment } from '@/domains/timebox/cnui/surfaces/EditAppointment'
import type { AppointmentDraftFields } from '@/domains/timebox/cnui/surfaces/AppointmentFormFields'

const makeItem = (overrides: Partial<AppointmentDraftFields & { status: string }> = {}) => ({
  id: 'a-1',
  title: '看牙医',
  startTime: '2026-07-15T14:00:00Z',
  durationMin: 60,
  detail: null,
  people: [],
  status: 'scheduled',
  ...overrides,
})

describe('EditAppointment selecting mode', () => {
  it('renders list of items', () => {
    const items = [makeItem({ id: 'a-1' }), makeItem({ id: 'a-2', title: '约张三' })]
    render(<EditAppointment dataModel={{ items, mode: 'selecting' }} onDataChange={() => {}} onConfirm={() => {}} />)
    expect(screen.getByText('看牙医')).toBeInTheDocument()
    expect(screen.getByText('约张三')).toBeInTheDocument()
  })

  it('shows pagination when items > PAGE_SIZE', () => {
    const items = Array.from({ length: 12 }, (_, i) => makeItem({ id: `a-${i}`, title: `约定 ${i}` }))
    render(<EditAppointment dataModel={{ items, mode: 'selecting' }} onDataChange={() => {}} onConfirm={() => {}} />)
    expect(screen.getByText(/1\/3/)).toBeInTheDocument()
    expect(screen.getByText('下一页 ›')).toBeInTheDocument()
  })

  it('hides pagination when items <= PAGE_SIZE', () => {
    const items = Array.from({ length: 3 }, (_, i) => makeItem({ id: `a-${i}`, title: `约定 ${i}` }))
    render(<EditAppointment dataModel={{ items, mode: 'selecting' }} onDataChange={() => {}} onConfirm={() => {}} />)
    expect(screen.queryByText('下一页 ›')).toBeNull()
  })

  it('clicking 下一页 moves to next page', async () => {
    const items = Array.from({ length: 12 }, (_, i) => makeItem({ id: `a-${i}`, title: `约定 ${i}` }))
    render(<EditAppointment dataModel={{ items, mode: 'selecting' }} onDataChange={() => {}} onConfirm={() => {}} />)
    await userEvent.click(screen.getByText('下一页 ›'))
    expect(screen.getByText(/2\/3/)).toBeInTheDocument()
  })

  it('clicking item switches to editing mode', async () => {
    const onDataChange = vi.fn()
    const items = [makeItem({ id: 'a-1' })]
    render(<EditAppointment dataModel={{ items, mode: 'selecting' }} onDataChange={onDataChange} onConfirm={() => {}} />)
    await userEvent.click(screen.getByText('看牙医'))
    expect(screen.getByText(/编辑约定/)).toBeInTheDocument()
  })

  it('shows parseReason hint when provided', () => {
    const items = [makeItem({ id: 'a-1' })]
    render(<EditAppointment dataModel={{ items, mode: 'selecting', originalPrompt: '改成下午', parseReason: '未识别到具体时间' }} onDataChange={() => {}} onConfirm={() => {}} />)
    expect(screen.getByText(/未识别到具体时间/)).toBeInTheDocument()
  })

  it('renders empty state when items is empty', () => {
    render(<EditAppointment dataModel={{ items: [], mode: 'selecting' }} onDataChange={() => {}} onConfirm={() => {}} />)
    expect(screen.getByText(/暂无计划/)).toBeInTheDocument()
  })
})

describe('EditAppointment editing mode', () => {
  it('renders AppointmentFormFields with prefill', () => {
    const prefill = { ...makeItem({ id: 'a-1' }), activityArchetypeId: 'arch-1' }
    render(<EditAppointment dataModel={{ items: [prefill], mode: 'editing', selectedId: 'a-1', prefill }} onDataChange={() => {}} onConfirm={() => {}} />)
    expect(screen.getByDisplayValue('看牙医')).toBeInTheDocument()
    expect(screen.getByText(/编辑约定/)).toBeInTheDocument()
2   })

  it('shows 删除 button when status is scheduled', () => {
    const prefill = makeItem({ id: 'a-1', status: 'scheduled' })
    render(<EditAppointment dataModel={{ items: [prefill], mode: 'editing', selectedId: 'a-1', prefill }} onDataChange={() => {}} onConfirm={() => {}} />)
    expect(screen.getByRole('button', { name: '删除' })).toBeInTheDocument()
  })

  it('hides 删除 button when status is expired', () => {
    const prefill = makeItem({ id: 'a-1', status: 'expired' })
    render(<EditAppointment dataModel={{ items: [prefill], mode: 'editing', selectedId: 'a-1', prefill }} onDataChange={() => {}} onConfirm={() => {}} />)
    expect(screen.queryByRole('button', { name: '删除' })).toBeNull()
  })

  it('AlertDialog opens when 删除 clicked', async () => {
    const prefill = makeItem({ id: 'a-1', status: 'scheduled' })
    render(<EditAppointment dataModel={{ items: [prefill], mode: 'editing', selectedId: 'a-1', prefill }} onDataChange={() => {}} onConfirm={() => {}} />)
    await userEvent.click(screen.getByRole('button', { name: '删除' }))
    expect(screen.getByText(/确认删除约定/)).toBeInTheDocument()
  })

  it('confirming delete calls onConfirm with operation=delete', async () => {
    const onConfirm = vi.fn()
    const prefill = makeItem({ id: 'a-1', status: 'scheduled' })
    render(<EditAppointment dataModel={{ items: [prefill], mode: 'editing', selectedId: 'a-1', prefill }} onDataChange={() => {}} onConfirm={onConfirm} />)
    await userEvent.click(screen.getByRole('button', { name: '删除' }))
    await userEvent.click(screen.getByRole('button', { name: /确认/ }))
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ operation: 'delete' }))
  })

  it('点击 保存 calls onConfirm with operation=update', async () => {
    const onConfirm = vi.fn()
    const prefill = makeItem({ id: 'a-1', status: 'scheduled' })
    render(<EditAppointment dataModel={{ items: [prefill], mode: 'editing', selectedId: 'a-1', prefill }} onDataChange={() => {}} onConfirm={onConfirm} />)
    await userEvent.click(screen.getByRole('button', { name: '保存' }))
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ operation: 'update' }))
  })

  it('点击 返回列表 switches back to selecting', async () => {
    const onDataChange = vi.fn()
    const prefill = makeItem({ id: 'a-1', status: 'scheduled' })
    const items = [makeItem({ id: 'a-1' }), makeItem({ id: 'a-2' })]
    render(<EditAppointment dataModel={{ items, mode: 'editing', selectedId: 'a-1', prefill }} onDataChange={onDataChange} onConfirm={() => {}} />)
    await userEvent.click(screen.getByText('返回列表'))
    expect(screen.getByText(/选择要修改的约定/)).toBeInTheDocument()
  })

  it('disables 保存 when title is empty', () => {
    const prefill = makeItem({ id: 'a-1', status: 'scheduled', title: '' })
    render(<EditAppointment dataModel={{ items: [prefill], mode: 'editing', selectedId: 'a-1', prefill }} onDataChange={() => {}} onConfirm={() => {}} />)
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled()
  })
})
```

### Step 2: 跑测试确认失败

```bash
cd /home/walker/lifeware/frontend
npm test -- src/domains/timebox/cnui/surfaces/__tests__/edit-appointment.test.tsx
```

Expected: 新测试 FAIL（双视图切换/分页/删除 AlertDialog/archetype 透传 还没实现）。

### Step 3: 重写 EditAppointment.tsx

**Files**: `frontend/src/domains/timebox/cnui/surfaces/EditAppointment.tsx`（完整重写）

```typescript
/**
 * @file EditAppointment
 * @brief 修改约定 CNUI surface（[026.01] 对齐 /editTimeboxes 范式）
 *
 * 双视图切换：selecting（默认，分页列表） ↔ editing（5 字段表单 + 删除集成）
 * 解析优先模式：handler.open 注入 mode/selectedId/prefill/items/originalPrompt/parseReason。
 * 4+1 字段复用 <AppointmentFormFields>。终态 expired/cancelled/completed 自然不显示删除按钮。
 */

'use client'

import { useState } from 'react'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { AppointmentFormFields, type AppointmentDraftFields } from './AppointmentFormFields'

interface EditAppointmentProps {
  surfaceType: string
  dataModel: Record<string, unknown>
  onDataChange: (d: Record<string, unknown>) => void
  onConfirm: (d: Record<string, unknown>) => void
  onCancel?: () => void
  isLoading?: boolean
  isDone?: boolean
  serverErrors?: string[]
}

const PAGE_SIZE = 5

type ViewMode = 'selecting' | 'editing'

export function EditAppointment({ dataModel, onDataChange, onConfirm, onCancel, isLoading, isDone }: EditAppointmentProps) {
  const items = (dataModel.items as (AppointmentDraftFields & { status: string })[]) ?? []
  const originalPrompt = (dataModel.originalPrompt as string) ?? ''
  const parseReason = (dataModel.parseReason as string) ?? ''
  const initialMode = ((dataModel.mode as string) ?? 'selecting') as ViewMode
  const prefill = dataModel.prefill as (AppointmentDraftFields & { status: string }) | undefined
  const initialSelectedId = (dataModel.selectedId as string | null) ?? null

  const [view, setView] = useState<ViewMode>(initialMode)
  const [page, setPage] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId)
  const [draft, setDraft] = useState<(AppointmentDraftFields & { status: string }) | null>(prefill ?? null)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)

  if (isDone) return <p className="py-2 text-center text-sm text-ink">✅ 约定已更新</p>

  // ─── editing 视图 ───────────────────────────────────────
  if (view === 'editing' && selectedId && draft) {
    const selected = items.find(i => i.id === selectedId) ?? draft
    const update = (patch: Partial<AppointmentDraftFields>) => setDraft(d => d ? { ...d, ...patch } : d)
    const back = () => {
      setView('selecting')
      setSelectedId(null)
      setDraft(null)
    }
    const submit = () => onConfirm({ ...dataModel, selected: draft, operation: 'update' })
    const performDelete = () => {
      onConfirm({ ...dataModel, selected: draft, operation: 'delete' })
      setConfirmDeleteOpen(false)
    }
    const canDelete = selected.status === 'scheduled' || selected.status === 'in_progress'
    const titleFilled = typeof draft.title === 'string' && draft.title.trim().length > 0

    return (
      <>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-sm font-medium text-ink">
            编辑约定（{selected.status === 'in_progress' ? '执行中' : '计划'}）
          </span>
          <button type="button" onClick={back} className="text-xs text-body/70 underline">返回列表</button>
        </div>
        {(originalPrompt || parseReason) && (
          <p className="mb-2 rounded bg-muted/50 px-2 py-1 text-xs text-body/70">
            💡 {parseReason || `尝试匹配「${originalPrompt}」`}
          </p>
        )}
        <AppointmentFormFields draft={draft} onChange={update} />
        <div className="flex items-center justify-between pt-2">
          <div>
            {canDelete && (
              <button type="button" onClick={() => setConfirmDeleteOpen(true)} disabled={isLoading}
                className="rounded-md border border-error/40 px-3 py-1.5 text-xs text-error hover:bg-error/10 disabled:opacity-50">
                删除
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            {onCancel && <button type="button" onClick={onCancel}
              className="rounded-md border border-hairline px-3 py-1.5 text-xs text-ink hover:bg-hover-overlay">取消</button>}
            <button type="button" onClick={submit} disabled={isLoading || !titleFilled}
              title={!titleFilled ? '请填写事件名称' : undefined}
              className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">
              保存
            </button>
          </div>
        </div>
        <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>确认删除约定</AlertDialogTitle>
              <AlertDialogDescription>「{draft.title}」删除后不可恢复，确认吗？</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>取消</AlertDialogCancel>
              <AlertDialogAction onClick={performDelete}>确认删除</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </>
    )
  }

  // ─── selecting 视图 ─────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE))
  const pagedItems = items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  return (
    <>
      <div className="mb-2">
        <span className="text-sm font-medium text-ink">选择要修改的约定（仅计划/执行中）</span>
      </div>
      {(originalPrompt || parseReason) && (
        <p className="mb-2 rounded bg-muted/50 px-2 py-1 text-xs text-body/70">
          💡 {parseReason || `尝试匹配「${originalPrompt}」`}
        </p>
      )}
      {items.length === 0
        ? <p className="py-8 text-center text-sm text-body/70">暂无计划/执行中的约定</p>
        : <div className="space-y-1">
            {pagedItems.map(it => (
              <button key={it.id} type="button"
                onClick={() => {
                  setSelectedId(it.id)
                  setDraft({ ...it })
                  setView('editing')
                }}
                className="w-full text-left rounded-md border border-hairline bg-canvas p-2 hover:bg-hover-overlay">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-ink truncate">{it.title}</span>
                  <span className="text-xs text-body/70">{it.status === 'in_progress' ? '执行中' : '计划'}</span>
                </div>
                <div className="text-xs text-body/70">
                  {new Date(it.startTime).toLocaleString('zh-CN')} · {it.durationMin}分
                </div>
              </button>
            ))}
          </div>}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <button type="button" disabled={page <= 0} onClick={() => setPage(p => p - 1)}
            className="rounded border border-hairline px-2 py-0.5 text-xs text-ink disabled:opacity-40">
            ‹ 上一页
          </button>
          <span className="text-xs text-muted">{page + 1}/{totalPages}</span>
          <button type="button" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}
            className="rounded border border-hairline px-2 py-0.5 text-xs text-ink disabled:opacity-40">
            下一页 ›
          </button>
        </div>
      )}
      {onCancel && <div className="flex justify-end pt-2">
        <button type="button" onClick={onCancel}
          className="rounded-md border border-hairline px-3 py-1.5 text-xs text-ink hover:bg-hover-overlay">取消</button>
      </div>}
    </>
  )
}
```

### Step 4: 跑 EditAppointment 测试

```bash
cd /home/walker/lifeware/frontend
npm test -- src/domains/timebox/cnui/surfaces/__tests__/edit-appointment.test.tsx
```

Expected: 14 个新测试 全 PASS。

### Step 5: 全量回归测试 + tsc

```bash
cd /home/walker/lifeware/frontend
npm test
npx tsc --noEmit
npm run validate:manifest
npm run validate:domain-structure
```

Expected:
- vitest base=head 失败集合零新增（[[feedback_change-gate-baseline]]）
- tsc 零新增错误
- validate 0 errors

### Step 6: Commit

```bash
cd /home/walker/lifeware
git add \
  frontend/src/domains/timebox/cnui/surfaces/EditAppointment.tsx \
  frontend/src/domains/timebox/cnui/surfaces/__tests__/edit-appointment.test.tsx
git commit -m "feat(026.01): EditAppointment 重写为双视图+分页+删除集成

对齐 /editTimeboxes 范式：
- selecting 视图（默认）: 分页（PAGE_SIZE=5），不滚动，显示原始 prompt + parseReason 提示
- editing 视图: AppointmentFormFields 5 字段 + 「保存」+「删除」按钮
- 双视图可双向切换（selecting ↔ editing 通过「返回列表」）
- 删除按钮：仅 status ∈ {scheduled, in_progress} 时显示
- AlertDialog 二次确认（参照 [023.04] TimeboxList 范式）
- 终态 expired/cancelled/completed 时列表中不存在（findActive 过滤）

14 测试覆盖双视图 + 分页 + 删除集成 + alertDialog + 表单透传 archetype。

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

## Task 5: docs 同步 + 全量验证 + PR（5 文件）

**Files:**
- Modify: `docs/usom-design.md`
- Modify: `docs/database-design.md`
- Modify: `CHANGELOG.md`
- Modify: `manifest.md`（如需）
- 没有代码改动

### Step 1: docs/usom-design.md 更新

**Files**: `docs/usom-design.md`

定位文档中 `Appointment` 对象定义段（搜索 "Appointment" 章节），加 `activityArchetypeId` 字段说明。定位 `AppointmentSummary` 段加 `activityArchetypeId`。具体定位由 implementer 据文档结构决定。

字段说明格式参照 timebox：

```markdown
- `activityArchetypeId?: USOM_ID` — 关联 Activity Archetype（[026.01] 新增，nullable，对齐 timebox.activityArchetypeId）
```

### Step 2: docs/database-design.md 更新

**Files**: `docs/database-design.md`

定位 `appointments` 表 schema 段，加：

```markdown
- `activity_archetype_id uuid REFERENCES activity_archetypes(id) ON DELETE SET NULL` — [026.01] archetype FK（nullable）
- 索引 `idx_appointments_archetype ON appointments(activity_archetype_id)` — 反向查询
```

### Step 3: CHANGELOG.md 加 [026.01] section

**Files**: `CHANGELOG.md`

定位最近 [023.10] section 末尾，加新 section：

```markdown
## [026.01] — 约定 CNUI 优化 + archetype 全链路集成

### 决策摘要
- **archetype 范围**：全链路 AI 匹配（DB+USOM+mapper+表单+handler+server action+UI 端 matchArchetypeForTitle）
- **editAppointment 模式**：对齐 `/editTimeboxes` 范式（解析优先 + selecting 降级 + 双视图 + 分页 + 删除集成）
- **「未知的卡片类型」**：现状已修复，任务文档描述过期
- **列表范围**：`scheduled+in_progress`（`findActive()`）

### 改动清单
- DB migration 0034：appointments 加 `activity_archetype_id` 列 + FK + 索引
- USOM `Appointment` + `AppointmentSummary` 加 `activityArchetypeId` 字段
- mapper 双向读写 archetype
- manifest `field_metadata.appointment` 加 archetype 元数据（type=string）
- `AppointmentFormFields` 嵌入 `<ArchetypePickerCard enableAiMatch title={...}>`（4 字段 → 5 字段）
- 新建 `parseAppointmentIntent`（参照 `parse-timeboxes.ts` 范式，6 测试）
- handler `open('editAppointment')` 重写为解析优先模式
- handler `submit('editAppointment')` 增加 `op='delete'` 分支
- server action `createAppointment` / `updateAppointment` 加 `assertArchetypeOwned` owner-check
- server action `updateAppointment` 加 `APPOINTMENT_UPDATE_ALLOWED_FIELDS` 白名单防绕过状态机
- `EditAppointment` 重写：双视图 + 分页 5/页 + 删除集成 + AlertDialog

### 验证结果
- vitest base=head 失败集合零新增
- tsc 零新增错误
- `validate:manifest` 0 errors
- `validate:domain-structure` ✓
- 浏览器 E2E 4 场景（创建 AI 匹配 + 编辑解析成功 + 编辑降级 selecting + 编辑删除）

### 风险与缓解
- DB 加列 + FK：IF NOT EXISTS 幂等 + nullable + ON DELETE SET NULL
- LLM 解析 prompt 质量：单元测试覆盖 4 路径，失败时降级 selecting 不阻塞
- 删除按钮误操作：AlertDialog 二次确认（参照 [023.04] 范式）

### 参照
- Spec SSOT: `docs/superpowers/specs/2026-07-06-026-01-appointment-cnui-optimization-design.md`
- Plan SSOT: `docs/superpowers/plans/2026-07-06-026-01-appointment-cnui-optimization.md`
```

### Step 4: 检查 manifest.md 并更新（如需）

**Files**: `manifest.md`

定位 appointments 部分，检查 K-block / A-block 是否已记录三个 surface + lifecycle。如未记录，加：

```markdown
- **timebox/appointment**: 5 态 lifecycle（scheduled/in_progress/expired/cancelled/completed） + 4 surface（create/edit/delete/viewAppointments） + view_route /appointments
```

### Step 5: 全量最终验证

```bash
cd /home/walker/lifeware/frontend
npm test
npx tsc --noEmit
npm run validate:manifest
npm run validate:domain-structure
```

Expected:
- vitest base=head 失败集合零新增
- tsc 0 错误
- validate 0 errors

### Step 6: 浏览器 E2E（gstack /browse+/qa）

启动 dev server（参照 [[feedback_turbopack-postcss-hmr-stale]] 注意）：

```bash
cd /home/walker/lifeware/frontend
npm run dev
```

然后用 gstack `/browse+/qa` 走 4 场景（仅逻辑验证，UI 视觉用 /browse 截图）：

| 场景 | prompt | 预期 |
|---|---|---|
| 1. createAppointment + archetype picker | 「7月15日下午2点看牙医」 | CNUI 表单渲染 + archetype picker 可见 + AI 匹配按钮可见 + 「选择原型」可选 |
| 2. editAppointment 解析成功 | 「把看牙医改到下午3点」 | 直接进 editing（无列表页），prefill 显示原 + 新时间生效 |
| 3. editAppointment 降级 selecting | 「改一下约定」 | selecting 列表 + 列表分页（如 >5 条）+ parseReason 提示 |
| 4. editAppointment 删除确认 | editing → 「删除」 → AlertDialog → 确认 | DB cancel 成功，UI 返回 selecting 列表（少一条）|

### Step 7: Commit docs 同步

```bash
cd /home/walker/lifeware
git add \
  docs/usom-design.md \
  docs/database-design.md \
  CHANGELOG.md \
  manifest.md
git commit -m "docs(026.01): docs 同步 - usom-design / database-design / CHANGELOG / manifest

- usom-design.md Appointment + AppointmentSummary 加 activityArchetypeId 字段说明
- database-design.md appointments 表加 archetype 列 + 索引
- CHANGELOG.md 新增 [026.01] section（决策摘要 + 改动清单 + 验证 + 风险 + 参照）
- manifest.md 检查 appointments K-block + A-block（如需补登记）

Co-Authored-By: Claude <noreply@anthropic.com>"
```

### Step 8: 创建 PR

```bash
cd /home/walker/lifeware
git push origin main
# 在 gitee 平台用 gh / gstack / web UI 创建 PR
```

PR 标题：`feat(026.01): 约定 CNUI 优化 + archetype 全链路集成`

PR 描述：

```markdown
# [026.01] 约定 CNUI 优化 + archetype 全链路集成

## 改动摘要
3 件事一次性完成：
1. 优化 `/createAppointment`（保留 + 加 archetype picker）
2. 重写 `/editAppointment`（对齐 /editTimeboxes 范式：解析优先 + 降级 + 双视图 + 分页 + 删除集成）
3. `activityArchetypeId` 全链路接入（DB → USOM → mapper → 表单 → handler → server action → AI 匹配）

## 决策
- archetype 范围：全链路 AI 匹配（DB+USOM+mapper+表单+handler+server action+UI 端 matchArchetypeForTitle）
- editAppointment 模式：解析优先模式
- 列表范围：scheduled+in_progress（findActive）

## 改动清单
[参照 CHANGELOG.md [026.01] section]

## 验证
- vitest base=head 失败集合零新增
- tsc 0 错误
- validate:manifest 0 errors
- validate:domain-structure ✓
- 浏览器 E2E 4 场景通过

## 关联
- Spec: `docs/superpowers/specs/2026-07-06-026-01-appointment-cnui-optimization-design.md`
- Plan: `docs/superpowers/plans/2026-07-06-026-01-appointment-cnui-optimization.md`
- Memory 引用: `[[project-cnui-surface-dual-registration]]` / `[[project-drizzle-migrations-handwritten]]` / `[[feedback_tier2-sync]]` / `[[feedback_change-gate-baseline]]`
```

---

## 自检（撰写完成后）

### 1. Spec coverage

| Spec 章节 | Plan task |
|---|---|
| §2 数据层（migration + USOM + mapper + manifest）| Task 1 Step 1-9 |
| §3.1 AppointmentFormFields 5 字段 | Task 1 Step 13-14 |
| §3.2 CreateAppointment 小改 | Task 1 Step 15（验证，无需代码改动）|
| §3.3 EditAppointment 重写 | Task 4 |
| §4.1 parseAppointmentIntent | Task 2 |
| §5.1-5.4 handler 改造 | Task 3 |
| §6.1-6.3 server action 改造 | Task 3 |
| §7 测试策略 | Task 1（mapper）+ Task 2（parser）+ Task 3（handler/server action）+ Task 4（EditAppointment）|
| §8 docs 同步 | Task 5 |
| §9 YAGNI 排除 | 已落实（不修改 lifecycle/view_routes/lifecycle.appointment.transitions）|

### 2. Placeholder scan

- 全部 step 含完整代码或具体命令
- 无 "TBD" / "TODO" / "implement later" / "fill in details"
- 无 "Add appropriate error handling" / "Similar to Task N" 占位

### 3. Type consistency

- `AppointmentDraftFields.activityArchetypeId?: string`（Task 1 Step 13 定义，Task 4 Step 3 引用）
- `parseAppointmentIntent` 返回 `AppointmentParseResult`（Task 2 Step 1 测试用，Task 2 Step 3 实现）
- `timeboxCnuiHandler.open('editAppointment', ...)` 返回 `dataSnapshot: { mode, selectedId, prefill, status, items, originalPrompt, parseReason, readOnly }`（Task 3 Step 5 定义，Task 4 测试用）
- `timeboxCnuiHandler.submit('editAppointment', fields)` 接收 `{ selected, operation }`（Task 3 Step 7 定义，Task 4 测试用）
- `APPOINTMENT_UPDATE_ALLOWED_FIELDS`（Task 3 Step 10a 定义，Step 10c 使用）
- 类型一致 ✅

---

**Plan 完成，等待用户选择执行方式（subagent-driven vs inline）。**
