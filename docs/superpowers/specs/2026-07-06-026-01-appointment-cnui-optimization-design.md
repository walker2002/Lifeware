# [026.01] 约定功能 CNUI 优化 + archetype 集成 — 设计文档

## 0. 元数据

| 项 | 值 |
|---|---|
| 任务编号 | `[026.01]` |
| 设计阶段 | 设计 APPROVED（2026-07-06，brainstorming 5 节批准） |
| 父任务 | `[026]` 行程计划管理（已 ship-ready, 2026-07-03） |
| 依赖 | `[023.05-2]` appointment 命名 PR2（已 ship-ready） |
| 后续 | `[023.11]` 之后的下一步；为 [027] 完成链路做准备 |
| 状态 | 待 implementation（writing-plans 待启动）|

## 1. 目标与背景

### 1.1 目标

完成 `[026.01]` 三个子任务：

1. **优化** `/createAppointment` CNUI（保留多草稿翻页 + 切已有列表形态，加 archetype picker）
2. **重写** `/editAppointment` CNUI（对齐 `/editTimeboxes` 范式：解析优先 + selecting 降级 + 双视图切换 + 分页 + 删除集成）
3. **接入** `activityArchetypeId` 全链路（DB → USOM → mapper → 表单 → handler → server action → AI 匹配），对齐 `createTimebox` 范式

### 1.2 现状（基于代码精确比对）

#### 1.2.1 「未知的卡片类型」—— ❌ 已不存在

| 注册点 | 位置 | 状态 |
|---|---|---|
| 客户端 `cnuiRegistry.register` | `frontend/src/domains/timebox/index.ts:67-80` | ✅ 三个 surface 全注册 |
| Server `surfaceHandlers` map | `frontend/src/domains/timebox/cnui/handlers.ts:656-658` | ✅ 三个 key 全有 |
| Manifest K+A 双声明 | `frontend/src/domains/timebox/manifest.yaml:111-143, 452-460` | ✅ intent_triggers + cnui_surfaces 全声明 |

任务文档「目前提示'未知的卡片类型：'」是过期描述。[026] 已 ship-ready，注册链路完整。

#### 1.2.2 实际差距

**A. activityArchetypeId 全链路未接入**（最大工作量）

| 层 | 现状 |
|---|---|
| DB schema `appointments` 表 | 无 `activityArchetypeId` 列 |
| USOM `Appointment` 类型（`usom/types/objects.ts:636`） | 字段列表无 |
| USOM `AppointmentSummary`（`usom/types/summaries.ts:54`） | 缺字段 |
| mapper `appointment.ts`（`domains/timebox/repository/mappers/`） | 不读写 |
| manifest `field_metadata.appointment`（`manifest.yaml:285-308`） | 5 字段，缺 archetype |
| `AppointmentFormFields.tsx`（`domains/timebox/cnui/surfaces/`） | 4 字段表单 |
| handler `submit('createAppointment')`（`handlers.ts:518-543`） | 不透传 archetype |
| handler `submit('editAppointment')`（`handlers.ts:545-562`） | 不透传 |
| server action `createAppointment`（`app/actions/timebox.ts:256-280`） | 无 owner-check |
| server action `updateAppointment` | 无 owner-check |
| AI 解析 `parseAppointmentWithAI`（`nexus/core/intent-engine/ai-parser.ts:635`）+ prompt（`:520`） | prompt 不输出 archetype |

**B. CreateAppointment 形态**：现状基本符合任务文档精神，保留 + 加 archetype picker。

**C. EditAppointment 形态**：现状是单向 selecting → editing，不符合任务文档「双向切换 + 分页 + 删除集成」要求。

#### 1.2.3 决策摘要（用户确认）

| 决策 | 选项 | 来源 |
|---|---|---|
| archetype 范围 | **全链路 AI 匹配**（对齐 createTimebox） | 用户 |
| editAppointment 模式 | **对齐 `/editTimeboxes` 范式**（解析优先 + 降级 + 分页 + 双视图 + 删除集成） | 用户 |
| 「已有列表 / selecting 列表」范围 | **`scheduled+in_progress`**（`findActive()`） | 用户 |
| 「未知的卡片类型」问题 | 文档过期描述，无须处理 | 复现结论 |

## 2. 数据层改动

### 2.1 DB migration 0034

**文件**：`frontend/src/lib/db/migrations/0034_add_appointment_activity_archetype.sql`

```sql
-- [026.01] 给 appointments 加 activity_archetype_id 列 + FK + 索引
-- 幂等（IF NOT EXISTS），nullable，ON DELETE SET NULL（archetype 被删时 appointment 保留）
ALTER TABLE appointments
  ADD COLUMN IF NOT EXISTS activity_archetype_id uuid
    REFERENCES activity_archetypes(id) ON DELETE SET NULL;

-- 索引：archetype 反向查询「哪些 appointment 用这个原型」
CREATE INDEX IF NOT EXISTS idx_appointments_archetype
  ON appointments(activity_archetype_id)
  WHERE activity_archetype_id IS NOT NULL;
```

**journal**：`frontend/src/lib/db/migrations/meta/_journal.json` 登 idx=34：

```json
{
  "idx": 34,
  "version": "7",
  "when": 1751817600000,
  "tag": "0034_add_appointment_activity_archetype",
  "breakpoints": true
}
```

**约束**：
- 参照 `[[project-drizzle-migrations-handwritten]]`（手写 SQL + psql + 登记 journal）
- dev DB 跑通 + 不破坏已存在数据
- 不动 schema.ts enum（status 仍是 5 态）

### 2.2 USOM 改动

**`frontend/src/usom/types/objects.ts:636`** —— `Appointment` 接口加字段：

```typescript
export interface Appointment {
  id:             USOM_ID
  status:         AppointmentStatus
  title:          string
  detail:         string | null
  startTime:      Timestamp
  durationMin:    number
  people:         string[]
  /** [026.01] 关联 Activity Archetype（nullable，对齐 timebox.activityArchetypeId） */
  activityArchetypeId?: USOM_ID
  userId:         USOM_ID
  createdAt:      Timestamp
  updatedAt:      Timestamp
  inProgressAt:   Timestamp | null
  expiredAt:      Timestamp | null
  completedAt:    Timestamp | null
  cancelledAt:    Timestamp | null
  schemaVersion:  number
}
```

**`frontend/src/usom/types/summaries.ts:54`** —— `AppointmentSummary` 加字段：

```typescript
export interface AppointmentSummary {
  id:        USOM_ID
  title:     string
  startTime: Timestamp
  durationMin: number
  status:    AppointmentStatus
  detail?:   string | null
  people?:   string[]
  /** [026.01] 编辑入口零延迟透传 archetype（与 detail/people 同性质） */
  activityArchetypeId?: USOM_ID
}
```

### 2.3 mapper 改动

**`frontend/src/domains/timebox/repository/mappers/appointment.ts`**：

```typescript
export function appointmentRowToUSOM(row: AppointmentRow): Appointment {
  return {
    id: row.id as USOM_ID,
    status: row.status as AppointmentStatus,
    title: row.title,
    detail: row.detail,
    startTime: row.startTime.toISOString(),
    durationMin: row.durationMin,
    people: (row.people as string[]) ?? [],
    userId: row.userId as USOM_ID,
    /** [026.01] archetype FK 映射（nullable） */
    activityArchetypeId: (row.activityArchetypeId ?? undefined) as USOM_ID | undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    inProgressAt: row.inProgressAt ? row.inProgressAt.toISOString() : null,
    expiredAt: row.expiredAt ? row.expiredAt.toISOString() : null,
    completedAt: row.completedAt ? row.completedAt.toISOString() : null,
    cancelledAt: row.cancelledAt ? row.cancelledAt.toISOString() : null,
    schemaVersion: row.schemaVersion,
  }
}

export function appointmentUSOMToRow(it: Appointment, userId: USOM_ID): AppointmentRow {
  return {
    id: it.id as any,
    userId: userId as any,
    schemaVersion: it.schemaVersion,
    title: it.title,
    detail: it.detail,
    startTime: new Date(it.startTime) as any,
    durationMin: it.durationMin,
    people: it.people as any,
    /** [026.01] archetype FK 落库（nullable） */
    activityArchetypeId: (it.activityArchetypeId ?? null) as any,
    status: it.status,
    inProgressAt: it.inProgressAt ? new Date(it.inProgressAt) as any : null,
    expiredAt: it.expiredAt ? new Date(it.expiredAt) as any : null,
    completedAt: it.completedAt ? new Date(it.completedAt) as any : null,
    cancelledAt: it.cancelledAt ? new Date(it.cancelledAt) as any : null,
    createdAt: new Date(it.createdAt) as any,
    updatedAt: new Date(it.updatedAt) as any,
  } as AppointmentRow
}
```

### 2.4 manifest 改动（区块 C）

**`frontend/src/domains/timebox/manifest.yaml`** `field_metadata.appointment` 子表追加：

```yaml
appointment:
  title:
    type: string
    label: 标题
    required: true
  startTime:
    type: time
    label: 开始时间
    required: true
  durationMin:
    type: number
    label: 时长(分钟)
    required: true
    mutation_mode: FactField
  detail:
    type: string
    label: 详情
    required: false
    mutation_mode: ContentField
  people:
    type: json
    label: 关系人
    required: false
    mutation_mode: ContentField
  # [026.01] archetype FK 字段元数据
  activityArchetypeId:
    type: archetype_ref
    label: 活动原型
    required: false
    mutation_mode: ContentField
```

**约束**：
- 不动区块 A（intent_triggers）—— `createAppointment` / `editAppointment` / `deleteAppointment` 已声明
- 不动区块 B（lifecycle）—— appointment 5 态 SM 已完整
- 不动区块 G（view_routes）—— `viewAppointments` 已注册
- 不动区块 K（cnui_surfaces）—— 三个 appointment surface 已声明

### 2.5 schema.ts 改动

**`frontend/src/lib/db/schema.ts:389`** `appointments` 表加列：

```typescript
export const appointments = pgTable('appointments', {
  id:           uuid('id').primaryKey().defaultRandom(),
  userId:       uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  schemaVersion: integer('schema_version').notNull().default(1),
  title:        text('title').notNull(),
  detail:       text('detail'),
  startTime:    timestamp('start_time', { withTZ: true }).notNull(),
  durationMin:  integer('duration_min').notNull(),
  people:       jsonb('people').notNull().$type<string[]>().default([]),
  // [026.01] archetype FK（nullable，archetype 删除时 appointment 保留）
  activityArchetypeId: uuid('activity_archetype_id').references(() => activityArchetypes.id, { onDelete: 'set null' }),
  status:       text('status', { enum: ['scheduled', 'in_progress', 'expired', 'cancelled', 'completed'] }).notNull().default('scheduled'),
  inProgressAt: timestamp('in_progress_at', { withTZ: true }),
  expiredAt:    timestamp('expired_at', { withTZ: true }),
  completedAt:  timestamp('completed_at', { withTZ: true }),
  cancelledAt:  timestamp('cancelled_at', { withTZ: true }),
  createdAt:    timestamp('created_at', { withTZ: true }).notNull().defaultNow(),
  updatedAt:    timestamp('updated_at', { withTZ: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_appointments_user_status_start').on(table.userId, table.status, table.startTime),
  index('idx_appointments_user_status').on(table.userId, table.status),
  // [026.01] archetype 反向查询索引（部分索引，仅非空值）
  index('idx_appointments_archetype').on(table.activityArchetypeId).where(sql`${table.activityArchetypeId} IS NOT NULL`),
])
```

**约束**：仅加列 + 索引，不动 enum / status / SM 推进逻辑。

## 3. CNUI 表单改动

### 3.1 AppointmentFormFields —— 4 字段 → 5 字段

**`frontend/src/domains/timebox/cnui/surfaces/AppointmentFormFields.tsx`**：

```typescript
'use client'

import { isoToLocalDatetimeInput, localDatetimeInputToIso } from './time-input-helpers'
import { ArchetypePickerCard } from '@/components/archetype/archetype-picker-card'

/** [026.01] AppointmentDraftFields 加 archetype 字段 */
export interface AppointmentDraftFields {
  id: string
  title: string
  startTime: string
  durationMin: number
  detail?: string | null
  people: string[]
  /** [026.01] 关联 Activity Archetype（nullable） */
  activityArchetypeId?: string
}

export interface AppointmentFormFieldsProps {
  draft: AppointmentDraftFields
  onChange: (patch: Partial<AppointmentDraftFields>) => void
  disabled?: boolean
}

export function AppointmentFormFields({ draft, onChange, disabled }: AppointmentFormFieldsProps) {
  const idPrefix = `app-ff-${draft.id}`
  return (
    <div className="rounded-md border border-hairline bg-canvas p-3 space-y-2">
      {/* 4 字段（保持原状） */}
      <div>
        <label htmlFor={`${idPrefix}-title`} className="text-xs text-body">事件名称</label>
        <input id={`${idPrefix}-title`} type="text" value={draft.title}
          onChange={e => onChange({ title: e.target.value })} disabled={disabled}
          className="mt-0.5 h-7 w-full rounded border border-hairline bg-canvas px-2 text-sm text-ink disabled:opacity-50" />
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <label htmlFor={`${idPrefix}-start`} className="text-xs text-body">开始</label>
          <input id={`${idPrefix}-start`} type="datetime-local"
            value={isoToLocalDatetimeInput(draft.startTime)}
            onChange={e => onChange({ startTime: localDatetimeInputToIso(e.target.value) })}
            disabled={disabled}
            className="mt-0.5 h-7 w-full rounded border border-hairline bg-canvas px-2 text-sm text-ink disabled:opacity-50" />
        </div>
        <div className="w-24">
          <label htmlFor={`${idPrefix}-dur`} className="text-xs text-body">时长(分)</label>
          <input id={`${idPrefix}-dur`} type="number" min={1} value={draft.durationMin}
            onChange={e => onChange({ durationMin: Number(e.target.value) || 0 })}
            disabled={disabled}
            className="mt-0.5 h-7 w-full rounded border border-hairline bg-canvas px-2 text-sm text-ink disabled:opacity-50" />
        </div>
      </div>
      <div>
        <label htmlFor={`${idPrefix}-people`} className="text-xs text-body">关系人（逗号分隔）</label>
        <input id={`${idPrefix}-people`} type="text" value={draft.people.join('，')}
          onChange={e => onChange({ people: e.target.value.split(/[，,]/).map(s => s.trim()).filter(Boolean) })}
          disabled={disabled}
          className="mt-0.5 h-7 w-full rounded border border-hairline bg-canvas px-2 text-sm text-ink disabled:opacity-50" />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-detail`} className="text-xs text-body">详情</label>
        <textarea id={`${idPrefix}-detail`} value={draft.detail ?? ''}
          onChange={e => onChange({ detail: e.target.value })} disabled={disabled}
          className="mt-0.5 w-full rounded border border-hairline bg-canvas px-2 py-1 text-sm text-ink disabled:opacity-50" />
      </div>

      {/* [026.01] archetype picker 嵌入（与 CreateTimebox.tsx:107-117 同款） */}
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

**约束**：
- archetype picker 位置：detail 字段下方（与 createTimebox 一致）
- `title` 传 picker 用于 AI 匹配
- archetype 字段不进入必填校验

### 3.2 CreateAppointment —— 小改（保留 + 加 archetype）

**`frontend/src/domains/timebox/cnui/surfaces/CreateAppointment.tsx`**：

保留：
- 多草稿翻页 + 切「已有列表」（防重复）
- RC-A 必填校验
- 4 字段表单 → 5 字段表单（透传 `activityArchetypeId`）

改动点：
- `cur = drafts[page]` 直接透传 archetype picker 行为由 `AppointmentFormFields` 内部处理
- `update(patch)` 已支持任意字段（`Partial<AppointmentDraftFields>`），无需改

**约束**：不重写 view/pagination/状态切换逻辑。

### 3.3 EditAppointment —— 重写为 /editTimeboxes 范式

**`frontend/src/domains/timebox/cnui/surfaces/EditAppointment.tsx`** 重写后结构：

```typescript
'use client'

import { useState } from 'react'
import { AlertDialog } from '@/components/ui/alert-dialog'
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

export function EditAppointment({ dataModel, onDataChange, onConfirm, onCancel, isLoading, isDone }: EditAppointmentProps) {
  const items = (dataModel.items as (AppointmentDraftFields & { status: string })[]) ?? []
  const originalPrompt = (dataModel.originalPrompt as string) ?? ''
  const parseReason = (dataModel.parseReason as string) ?? ''
  const initialMode = ((dataModel.mode as string) ?? 'selecting') as 'selecting' | 'editing'
  const prefill = dataModel.prefill as (AppointmentDraftFields & { id: string; status: string }) | undefined
  const initialSelectedId = (dataModel.selectedId as string | null) ?? null

  const [view, setView] = useState<'selecting' | 'editing'>(initialMode)
  const [page, setPage] = useState(0)
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId)
  const [draft, setDraft] = useState<(AppointmentDraftFields & { status: string }) | null>(prefill ?? null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  if (isDone) return <p className="py-2 text-center text-sm text-ink">✅ 约定已更新</p>

  // ─── editing 视图 ───────────────────────────────────────
  if (view === 'editing' && selectedId && draft) {
    const selected = items.find(i => i.id === selectedId) ?? draft
    const update = (patch: Partial<AppointmentDraftFields>) => setDraft(d => d ? { ...d, ...patch } : d)
    const back = () => { setView('selecting'); setSelectedId(null); setDraft(null) }
    const submit = () => onConfirm({ ...dataModel, selected: draft, operation: 'update' })
    const remove = async () => {
      onConfirm({ ...dataModel, selected: draft, operation: 'delete' })
      setConfirmDelete(false)
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
        {originalPrompt && parseReason && (
          <p className="mb-2 rounded bg-muted/50 px-2 py-1 text-xs text-body/70">
            💡 {parseReason}
          </p>
        )}
        <AppointmentFormFields draft={draft} onChange={update} />
        <div className="flex items-center justify-between pt-2">
          <div>
            {canDelete && (
              <button type="button" onClick={() => setConfirmDelete(true)} disabled={isLoading}
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
        {/* AlertDialog 二次确认 */}
        <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}
          title="确认删除约定" description={`「${draft.title}」删除后不可恢复，确认吗？`}
          onConfirm={remove} onCancel={() => setConfirmDelete(false)} />
      </>
    )
  }

  // ─── selecting 视图 ─────────────────────────────────────
  const totalPages = Math.ceil(items.length / PAGE_SIZE)
  const pagedItems = items.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)

  return (
    <>
      <div className="mb-2">
        <span className="text-sm font-medium text-ink">
          选择要修改的约定（仅计划/执行中）
        </span>
      </div>
      {originalPrompt && parseReason && (
        <p className="mb-2 rounded bg-muted/50 px-2 py-1 text-xs text-body/70">
          💡 {parseReason}
        </p>
      )}
      {items.length === 0
        ? <p className="py-8 text-center text-sm text-body/70">暂无计划/执行中的约定</p>
        : <div className="space-y-1">
            {pagedItems.map(it => (
              <button key={it.id} type="button"
                onClick={() => { setSelectedId(it.id); setDraft(it); setView('editing') }}
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
            className="rounded border border-hairline px-2 py-0.5 text-xs text-ink disabled:opacity-40">‹ 上一页</button>
          <span className="text-xs text-muted">{page + 1}/{totalPages}</span>
          <button type="button" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}
            className="rounded border border-hairline px-2 py-0.5 text-xs text-ink disabled:opacity-40">下一页 ›</button>
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

**约束**：
- 复用 `AppointmentFormFields`（5 字段 + archetype picker）
- 分页：`PAGE_SIZE = 5`，不用滚动（与 `pagination.ts` 思路一致，但简化为本地 page state）
- 双视图：`selecting ↔ editing`，editing 顶部有「返回列表」按钮
- 删除按钮：仅 `status ∈ {scheduled, in_progress}` 时显示（终态自然不显示）
- AlertDialog 二次确认（参照 [023.04] TimeboxList 范式）

## 4. AI 解析层（新建）

### 4.1 `parse-appointments.ts`

**`frontend/src/domains/timebox/cnui/parse-appointments.ts`**（参照 `parse-timeboxes.ts`）：

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
      newStartTime?: string // ISO UTC
      newDurationMin?: number
      newTitle?: string
      confidence: number // 0-1
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
`

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

    // 尝试解析 JSON（容忍 markdown 包裹）
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

    // 验证 appointmentId 在候选列表中
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

**约束**：
- 不解析 archetype（与 createTimebox 一致，archetype 走 UI 端 matchArchetypeForTitle）
- 仅 title/startTime/durationMin 三个字段参与匹配
- 不解析 people/detail（不在「修改」范围）
- 候选列表 = `findActive()`（{scheduled, in_progress}）

## 5. handler 改动

### 5.1 `open('createAppointment')` —— **保留**

**`frontend/src/domains/timebox/cnui/handlers.ts:233-253`** 无改动。

### 5.2 `open('editAppointment')` —— **重写**

**`frontend/src/domains/timebox/cnui/handlers.ts:255-265`** 重写为对齐 `editTimeboxes` 范式：

```typescript
if (action === 'editAppointment') {
  // [026.01] 对齐 /editTimeboxes 范式（解析优先 + selecting 降级）
  const prompt = (intentFields?.prompt as string | undefined) ?? ''
  const { parseAppointmentIntent } = await import('@/domains/timebox/cnui/parse-appointments')

  // 候选列表：当日 {scheduled, in_progress} 约定
  const all = await new AppointmentRepository().findActive(MVP_USER_ID as USOM_ID)
  const todayAppointments = all.map(i => ({
    id: i.id,
    title: i.title,
    startTime: i.startTime,
    durationMin: i.durationMin,
    status: i.status,
  }))

  // 调 AI 解析（aiRuntime 在 [023.08] 已模式化注入）
  const { createAIRuntime } = await import('@/nexus/ai-runtime')
  const aiRuntime = createAIRuntime()
  const parsed = await parseAppointmentIntent(prompt, todayAppointments, aiRuntime)

  // 置信度 < 0.5 → 强制降级 selecting
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

**约束**：
- 复用 `parseAppointmentIntent`（新建，4.1 节）
- confidenceGate 与 editTimeboxes 一致
- safe-default：解析命中不在候选列表 → silent fallback selecting（不 crash）

### 5.3 `submit('createAppointment')` —— 透传 archetype

**`frontend/src/domains/timebox/cnui/handlers.ts:518-543`** 改动一处：

```typescript
if (action === 'createAppointment') {
  const { submitDynamicIntent } = await import('@/app/actions/intent')
  const items = (fields.items as any[]) ?? []
  const succeeded: string[] = []
  const failed: { title: string; error: string }[] = []
  for (const it of items) {
    try {
      const r = await submitDynamicIntent('timebox', 'createAppointment', {
        title: it.title, startTime: it.startTime, durationMin: it.durationMin,
        ...(it.detail ? { detail: it.detail } : {}),
        ...(it.people?.length ? { people: it.people } : {}),
        ...(it.activityArchetypeId ? { activityArchetypeId: it.activityArchetypeId } : {}), // [026.01]
      })
      if (r.success) succeeded.push((r.object as any)?.id ?? it.title)
      else failed.push({ title: it.title ?? '未命名', error: r.error ?? '创建失败' })
    } catch (e) {
      failed.push({ title: it.title ?? '未命名', error: e instanceof Error ? e.message : '创建失败' })
    }
  }
  // ... (return 同原状)
}
```

### 5.4 `submit('editAppointment')` —— 透传 archetype + 增加 delete 分支

**`frontend/src/domains/timebox/cnui/handlers.ts:545-562`** 改造：

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

## 6. server action 改动

### 6.1 `createAppointment` 加 owner-check

**`frontend/src/app/actions/timebox.ts:256-280`** 改造：

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
  const result = await submitDynamicIntent('timebox', 'createAppointment', confirmFields, confirmed)
  // ... (return 同原状)
}
```

### 6.2 `updateAppointment` 加 owner-check

**`frontend/src/app/actions/timebox.ts`** `updateAppointment` 函数（约 line 282-330，调研时未完整看到，需确认）改造：

```typescript
export async function updateAppointment(
  appointmentId: string,
  fields: Record<string, unknown>,
): Promise<AppointmentActionResult> {
  // [026.01] archetype owner-check
  if (typeof fields.activityArchetypeId === 'string') await assertArchetypeOwned(fields.activityArchetypeId)

  // [026.01] 字段白名单加 activityArchetypeId
  const fieldSteps = Object.entries(fields)
    .filter(([, v]) => v !== undefined)
    .filter(([k]) => APPOINTMENT_UPDATE_ALLOWED_FIELDS.has(k))
    .map(([field, value]) => ({ kind: 'field' as const, field, value }))

  // ... (其余逻辑同 updateTimebox)
}
```

**新增白名单常量**（在 `timebox.ts` 顶部）：

```typescript
/** [026.01] appointment 更新字段白名单（仿 timebox UPDATE_ALLOWED_FIELDS） */
const APPOINTMENT_UPDATE_ALLOWED_FIELDS = new Set([
  'title', 'startTime', 'durationMin', 'detail', 'people',
  'activityArchetypeId', // [026.01]
])
```

### 6.3 `assertArchetypeOwned` 函数

**位置确认**：`frontend/src/app/actions/timebox.ts` 已 import 并使用（参照 `updateTimebox` line 169），无需新建。

## 7. 测试策略

### 7.1 单元测试（vitest）

| 测试文件 | 现状 | 增量 |
|---|---|---|
| `cnui/__tests__/parse-appointment.test.ts` | 已存在（mockAIRuntime） | 加 `parseAppointmentIntent` 用例：解析成功、解析失败、解析不确定、LLM 异常、JSON 解析失败 |
| `cnui/__tests__/handlers-create-appointment.test.ts` | 新建 | handler.open 默认 draft + handler.submit 透传 archetype + 部分失败汇总 |
| `cnui/__tests__/handlers-edit-appointment.test.ts` | 新建 | open 解析成功/降级/命中无 target + submit update/delete 分支 + archetype 透传 |
| `cnui/surfaces/__tests__/create-appointment.test.tsx` | 已存在 | 加 archetype pickerCard 渲染 + AI 匹配按钮触发 + 翻页透传 |
| `cnui/surfaces/__tests__/edit-appointment.test.tsx` | 已存在 | **重写**：双视图切换 + 分页（5 条/页）+ AI 解析注入 + 删除按钮 + AlertDialog |
| `cnui/surfaces/__tests__/appointment-form-fields.test.tsx` | 已存在 | 加 archetype pickerCard 集成 + 5 字段渲染 |
| `__tests__/appointment-repository.test.ts` | 检查存在性 | 加 archetype 字段读写 |

### 7.2 类型检查

- `cd frontend && npx tsc --noEmit` 零新增错误
- 聚焦被改文件 + 依赖（USOM/mapper/handler/server action/tests）

### 7.3 集成验证

- `cd frontend && npm run validate:manifest` —— manifest 验证
- `cd frontend && npm run validate:domain-structure` —— domain 结构验证
- dev DB 跑 migration 0034 不破坏已存在数据

### 7.4 浏览器 E2E（gstack `/browse+/qa`）

| 场景 | 入口 | 预期 |
|---|---|---|
| createAppointment AI 匹配 | `/createAppointment`「7月15日下午2点看牙医」 | CNUI 表单渲染 + archetype picker 可见 + AI 匹配按钮可见 + 选完看牙医+看牙 |
| createAppointment 多 draft | 同上 | 翻页正常 + 切「已有约定」可见 |
| editAppointment 解析成功 | `/editAppointment`「把看牙医改到下午3点」 | 直接进 editing + 字段 prefill 改后时间 + 保存 → DB 落库 |
| editAppointment 解析失败 | `/editAppointment`「改一下约定」 | selecting 列表 + 分页可见（>5 条时）+ 选中 → editing |
| editAppointment 删除 | editing 视图 → 删除 → AlertDialog → 确认 | DB cancel + 返回 selecting 列表（少一条）|
| editAppointment 终态不显示删除 | DB 改 status=expired → editing | 删除按钮不显示 |

### 7.5 基线对比

参照 `[[feedback_change-gate-baseline]]`：
- **不用硬编码预存失败数**
- 用 base/head 失败集合对比，聚焦被改文件
- 接受 pre-existing flake（已知 [025] PG 集成 flake 等）

## 8. docs 同步（强约束）

按 `[[feedback_tier2-sync]]`：

| 文档 | 改动 |
|---|---|
| `docs/usom-design.md` | Appointment 对象加 `activityArchetypeId` 字段说明 + AppointmentSummary 加字段 |
| `docs/database-design.md` | appointments 表 schema 段加列 + 索引 |
| `CHANGELOG.md` | 新增 `[026.01]` section：决策摘要 + 改动清单 + 验证结果 + 风险 |
| `manifest.md` | 检查 appointments K-block + A-block 是否已记录（如未记录，追加）|

## 9. YAGNI 排除（不做）

| 项 | 不做的理由 |
|---|---|
| lifecycle.transitions 改动 | appointment 5 态 SM 已完整 |
| view_routes 改动 | `/appointments` 路由已存在 |
| `viewAppointments` page 改动 | 与本任务无关 |
| `AppointmentWorkspace` 改动 | Drawer 已用 AppointmentFormFields，自动继承 |
| AppointmentSummary 加 detail/people 字段 | 已有 |
| reconcileAppointmentStatuses 改动 | 与 archetype 无关 |
| LLM prompt 直接输出 archetype | 走 matchArchetypesForTitles 后端规则轮+LLM 兜底范式（对齐 createTimebox）|
| deleteAppointment handler 改动 | 已成熟，集成 `op === 'delete'` 分支即可 |
| 编辑 appointment 的 people/detail 解析 | 不在「修改」范围（仅 startTime/durationMin/title 参与 AI 解析）|

## 10. 风险评估

| 风险 | 缓解 |
|---|---|
| migration 0034 加列 + FK，prod 环境已存在的 appointment 数据 | `IF NOT EXISTS` + nullable + `ON DELETE SET NULL`，已存在行 archetype_id = NULL 不破坏 |
| `assertArchetypeOwned` 跨模块依赖（timebox 模块导出的 helper）| 已确认在 `app/actions/timebox.ts` 中可访问（`updateTimebox` line 169 已用）|
| LLM 解析 prompt 质量不确定 | 写 `parse-appointment.test.ts` 覆盖 4 路径；失败时降级 selecting 不阻塞主流程 |
| EditAppointment 重写可能引入 selector 边界 bug | 重写配套完整单测覆盖 4 模式（空/解析成功/解析失败/选中后编辑）|
| 删除按钮误操作 | AlertDialog 二次确认（参照 [023.04] TimeboxList 范式）|
| 删除触发 needs_confirm | 直接走 submitDynamicIntent('timebox', 'cancelAppointment', ...)，捕获 needsConfirmation 错误时让 UI 弹 AlertDialog |
| createAIRuntime 调用 | 已确认在 `timeboxCnuiHandler` 中可用（`editTimeboxes` 已用 `createAIRuntime`）|

## 11. 整体交付范围

- **新建文件**：migration 0034 SQL + parse-appointments.ts + 2 handler 测试文件
- **修改文件**：
  - `frontend/src/lib/db/schema.ts`（appointments 表）
  - `frontend/src/lib/db/migrations/meta/_journal.json`
  - `frontend/src/usom/types/objects.ts`（Appointment）
  - `frontend/src/usom/types/summaries.ts`（AppointmentSummary）
  - `frontend/src/domains/timebox/repository/mappers/appointment.ts`
  - `frontend/src/domains/timebox/manifest.yaml`（field_metadata.appointment）
  - `frontend/src/domains/timebox/cnui/surfaces/AppointmentFormFields.tsx`
  - `frontend/src/domains/timebox/cnui/surfaces/CreateAppointment.tsx`
  - `frontend/src/domains/timebox/cnui/surfaces/EditAppointment.tsx`（重写）
  - `frontend/src/domains/timebox/cnui/handlers.ts`
  - `frontend/src/app/actions/timebox.ts`
  - 测试文件若干
- **docs 同步**：usom-design + database-design + CHANGELOG + manifest.md 检查
- **PR 策略**：1 个 PR（三个子任务耦合强，分开合并会出半成品）

## 12. SSOT 与引用

- 本设计 SSOT：`docs/superpowers/specs/2026-07-06-026-01-appointment-cnui-optimization-design.md`
- 父设计：`~/.gstack/.../walker-main-design-20260703-026-itinerary-design.md`（[026] APPROVED）
- 参照实现：`/createTimebox`（CNUI 范式）+ `/editTimeboxes`（解析优先范式）+ ArchetypePickerCard（[023.11]）
- 相关 memory：
  - `[[project-cnui-surface-dual-registration]]` —— surface 双注册铁律
  - `[[feedback_cnui-checkpoints]]` —— CUC-01~CUC-12 自检清单
  - `[[feedback_tier2-sync]]` —— USOM/DB 变更必须先更新 docs/
  - `[[project-drizzle-migrations-handwritten]]` —— 手写 SQL + psql + journal
  - `[[feedback_change-gate-baseline]]` —— 用 base/head 失败集合对比
  - `[[feedback_ui-verify-visual-not-functional]]` —— UI 验证用 /browse
  - `[[project-energy-dimension-constitution-gap]]` —— archetype 维度合规

---

**APPROVED 等待用户审阅 spec 文件**。