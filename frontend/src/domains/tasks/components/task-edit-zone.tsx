/**
 * @file task-edit-zone
 * @brief A 区 — 任务信息 inline 编辑区域（[018-G3] R3：page-level realtime blur 校验）
 *
 * 支持字段：title、description、priority、energyRequired、tracking、
 * estimatedDuration（双输入框）、dueDate。字段变更暂存 draft，统一保存。
 */

'use client'

import { useState, useCallback } from 'react'
import { Pencil, Check, X } from 'lucide-react'
import type { Task } from '../../../usom/types/objects'
import { Priority, EnergyLevel } from '../../../usom/types/primitives'
import type { TrackingMode } from '../../../usom/types/primitives'
import { cn } from '@/lib/utils'
import { updateTask } from '@/app/actions/tasks'
import { parseDurationToMinutes, durationHours, durationMinutes } from '@/lib/format-duration'
import { ArchetypePicker } from '@/components/archetype/archetype-picker'

// [018-G3] R3：page-level realtime blur 校验
import { useManifestRules } from '@/nexus/rules/use-manifest-rules'
import { taskRuleRegistry } from '../rules-registry'

// ─── 类型定义 ──────────────────────────────────────────────────────────

/** TaskEditZone 组件 Props */
interface TaskEditZoneProps {
  /** 当前任务对象 */
  task: Task
  /** 任务更新回调 */
  onTaskUpdate: (task: Task) => void
  /** 脏数据状态变更回调 */
  onDirtyChange?: (dirty: boolean) => void
}

// ─── 常量映射 ──────────────────────────────────────────────────────────

/** 优先级标签映射 */
const PRIORITY_LABELS: Record<string, string> = {
  critical: '紧急',
  high: '高',
  medium: '中',
  low: '低',
}

/** 能量等级标签映射 */
const ENERGY_LABELS: Record<string, string> = {
  high: '高能量',
  medium: '中能量',
  low: '低能量',
}

/** 追踪模式标签映射 */
const TRACKING_LABELS: Record<string, string> = {
  none: '不追踪',
  check_in: '打卡',
  log: '日志',
  review: '复盘',
}

// ─── InlineEdit 辅助组件 ───────────────────────────────────────────────

/**
 * Inline 编辑包装器
 * 点击子元素进入编辑模式，blur/Enter 保存，Escape 取消
 */
function InlineEdit({
  value,
  onSave,
  className,
  children,
  inputClassName,
  placeholder,
}: {
  value: string
  onSave: (value: string) => Promise<void>
  className?: string
  children?: React.ReactNode
  inputClassName?: string
  placeholder?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)

  const handleSave = useCallback(async () => {
    if (draft === value) { setEditing(false); return }
    setSaving(true)
    try {
      await onSave(draft)
    } finally {
      setSaving(false)
      setEditing(false)
    }
  }, [draft, value, onSave])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSave() }
    if (e.key === 'Escape') { setDraft(value); setEditing(false) }
  }, [handleSave, value])

  if (!editing) {
    return (
      <span
        className={cn('cursor-pointer rounded-sm px-0.5 hover:bg-hover-overlay transition-colors', className)}
        onClick={() => { setDraft(value); setEditing(true) }}
        title="点击编辑"
      >
        {children ?? (value || <span className="text-muted-soft">{placeholder}</span>)}
      </span>
    )
  }

  return (
    <span className="relative inline-flex items-center gap-1">
      <input
        autoFocus
        type="text"
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        disabled={saving}
        className={cn(
          'rounded-md border border-hairline bg-canvas px-2 py-0.5 text-sm text-ink',
          'focus:outline-none focus:ring-2 focus:ring-focus-ring',
          inputClassName,
        )}
        placeholder={placeholder}
      />
      {saving && <span className="text-xs text-muted-soft animate-pulse">…</span>}
    </span>
  )
}

/**
 * Inline 文本区域编辑
 */
function InlineTextarea({
  value,
  onSave,
  placeholder,
}: {
  value: string
  onSave: (value: string) => Promise<void>
  placeholder?: string
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)

  const handleSave = useCallback(async () => {
    if (draft === value) { setEditing(false); return }
    setSaving(true)
    try {
      await onSave(draft)
    } finally {
      setSaving(false)
      setEditing(false)
    }
  }, [draft, value, onSave])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setDraft(value); setEditing(false) }
  }, [value])

  if (!editing) {
    return (
      <div
        className="cursor-pointer rounded-sm px-0.5 py-1 text-sm text-body hover:bg-hover-overlay transition-colors min-h-[1.5rem]"
        onClick={() => { setDraft(value); setEditing(true) }}
        title="点击编辑"
      >
        {value || <span className="text-muted-soft">{placeholder ?? '点击添加描述...'}</span>}
      </div>
    )
  }

  return (
    <div className="relative">
      <textarea
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        disabled={saving}
        rows={3}
        className="w-full rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-focus-ring resize-y"
        placeholder={placeholder ?? '点击添加描述...'}
      />
      {saving && <span className="absolute bottom-2 right-2 text-xs text-muted-soft animate-pulse">保存中…</span>}
    </div>
  )
}

// ─── TaskEditZone 主组件 ────────────────────────────────────────────────

/**
 * A 区 — 任务信息 inline 编辑区域
 * @param props - 组件属性
 */
export function TaskEditZone({ task, onTaskUpdate, onDirtyChange }: TaskEditZoneProps) {
  /** 变更字段草稿（key=字段名, value=新值） */
  const [draft, setDraft] = useState<Record<string, unknown>>({})
  const [saving, setSaving] = useState(false)

  // [020] registry 即 SSOT：realtime meta 从 registry 派生，直传 registry（删 getRealtimeRules 中转）
  const { errors: fieldErrors, validateField } = useManifestRules(taskRuleRegistry)

  /** 是否有未保存变更 */
  const hasChanges = Object.keys(draft).length > 0

  /** 字段变更回调 — 更新 draft 而非直接保存 */
  const updateDraft = useCallback((field: string, value: unknown) => {
    setDraft(prev => ({ ...prev, [field]: value }))
    onDirtyChange?.(true)
  }, [onDirtyChange])

  /** 批量保存 — 合并所有变更字段到一次 updateTask 调用 */
  const saveAll = useCallback(async () => {
    if (Object.keys(draft).length === 0) return
    setSaving(true)
    try {
      const updated = await updateTask(task.id, draft)
      setDraft({})
      onTaskUpdate(updated)
      onDirtyChange?.(false)
    } finally {
      setSaving(false)
    }
  }, [draft, task.id, onTaskUpdate, onDirtyChange])

  /** 解析 notes JSON 字段中的特定部分 */
  const parseNotesField = (notes: string | null | undefined, key: 'acceptance' | 'output'): string => {
    if (!notes) return ''
    try {
      const parsed = JSON.parse(notes)
      if (typeof parsed === 'object' && parsed !== null) {
        return (parsed as Record<string, string>)[key] || ''
      }
    } catch {
      // 非 JSON 格式（旧数据），整体作为验收标准显示
      if (key === 'acceptance') return notes
    }
    return ''
  }

  /** 保存 notes JSON 字段中的特定部分 */
  const saveNotesField = async (key: 'acceptance' | 'output', value: string) => {
    let current: Record<string, string> = {}
    if (task.notes) {
      try {
        const parsed = JSON.parse(task.notes)
        if (typeof parsed === 'object' && parsed !== null) {
          current = parsed as Record<string, string>
        } else {
          current = { acceptance: task.notes }
        }
      } catch {
        current = { acceptance: task.notes }
      }
    }
    current[key] = value
    updateDraft('notes', JSON.stringify(current))
  }

  return (
    <div className="flex flex-col gap-5">
      {/* ── 标题行 ── */}
      <div className="flex items-start gap-2">
        <InlineEdit
          value={(draft.title as string) ?? task.title}
          onSave={async val => updateDraft('title', val)}
          className="text-2xl font-display font-semibold text-ink leading-tight"
          inputClassName="text-2xl font-display font-semibold w-full"
        />
      </div>

      {/* ── 描述 ── */}
      <div>
        <InlineTextarea
          value={(draft.description as string) ?? task.description ?? ''}
          onSave={async val => updateDraft('description', val)}
          placeholder="点击添加描述..."
        />
      </div>

      {/* ── 属性网格 ── */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        {/* 优先级 */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-body w-16 shrink-0">优先级</label>
          <select
            value={(draft.priority as string) ?? task.priority}
            onChange={e => { updateDraft('priority', e.target.value) }}
            onBlur={() => validateField('priority', (draft.priority as string) ?? task.priority)}
            disabled={saving}
            onClick={e => e.stopPropagation()}
            className="h-8 w-full rounded-md border border-hairline bg-canvas px-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-focus-ring"
          >
            {Object.entries(PRIORITY_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          {(fieldErrors.priority) && (
            <p className="text-xs text-error mt-0.5">{fieldErrors.priority}</p>
          )}
        </div>

        {/* 能量需求 */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-body w-16 shrink-0">能量需求</label>
          <select
            value={(draft.energyRequired as string) ?? task.energyRequired}
            onChange={e => updateDraft('energyRequired', e.target.value)}
            onBlur={() => validateField('energyRequired', (draft.energyRequired as string) ?? task.energyRequired)}
            disabled={saving}
            onClick={e => e.stopPropagation()}
            className="h-8 w-full rounded-md border border-hairline bg-canvas px-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-focus-ring"
          >
            {Object.entries(ENERGY_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
          {(fieldErrors.energyRequired) && (
            <p className="text-xs text-error mt-0.5">{fieldErrors.energyRequired}</p>
          )}
        </div>

        {/* 追踪模式 */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-body w-16 shrink-0">追踪模式</label>
          <select
            value={(draft.tracking as string) ?? task.tracking}
            onChange={e => updateDraft('tracking', e.target.value)}
            disabled={saving}
            onClick={e => e.stopPropagation()}
            className="h-8 w-full rounded-md border border-hairline bg-canvas px-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-focus-ring"
          >
            {Object.entries(TRACKING_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>

        {/* 预估时长 */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-body w-16 shrink-0">预估时长</label>
          <DurationEdit
            value={task.estimatedDuration}
            onSave={async val => updateDraft('estimatedDuration', val)}
            saving={saving}
            onValidate={val => validateField('estimatedDuration', val)}
          />
          {(fieldErrors.estimatedDuration) && (
            <p className="text-xs text-error mt-0.5">{fieldErrors.estimatedDuration}</p>
          )}
        </div>

        {/* 开始时间 */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-body w-16 shrink-0">开始时间</label>
          <input
            type="date"
            value={(draft.startDate as string) ?? task.startDate ?? ''}
            onChange={e => updateDraft('startDate', e.target.value || undefined)}
            disabled={saving}
            onClick={e => e.stopPropagation()}
            className="h-8 rounded-md border border-hairline bg-canvas px-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-focus-ring"
          />
        </div>

        {/* 截止日期 */}
        <div className="flex items-center gap-2 col-span-2">
          <label className="text-xs text-body w-16 shrink-0">截止日期</label>
          <input
            type="date"
            value={(draft.dueDate as string) ?? task.dueDate ?? ''}
            onChange={e => updateDraft('dueDate', e.target.value || undefined)}
            onBlur={() => validateField('dueDate', (draft.dueDate as string) ?? task.dueDate ?? '')}
            disabled={saving}
            onClick={e => e.stopPropagation()}
            className="h-8 rounded-md border border-hairline bg-canvas px-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-focus-ring"
          />
          {(fieldErrors.dueDate) && (
            <p className="text-xs text-error mt-0.5">{fieldErrors.dueDate}</p>
          )}
        </div>
      </div>

      {/* ── 活动原型（批量 draft，随 saveAll 一起 updateTask）── */}
      <div className="flex flex-col gap-1">
        <label className="text-xs text-body">活动原型</label>
        <ArchetypePicker
          // [027-A] Finding 1: 用 key-presence 区分「清除（null）」vs「未编辑（key absent）」
          //   draft 有该 key → 已触摸（包括 null=清除），用 draft 值 → coerce null→undefined → picker 显示「未选择」
          //   draft 无该 key → 未编辑，用 task 已保存值 → coerce null→undefined
          value={('activityArchetypeId' in draft ? (draft.activityArchetypeId as string | null) : task.activityArchetypeId) ?? undefined}
          onChange={id => updateDraft('activityArchetypeId', id === undefined ? null : id)}
          enableAiMatch
          title={task.title}
        />
      </div>

      {/* ── 保存按钮 ── */}
      {hasChanges && (
        <button
          type="button"
          onClick={saveAll}
          disabled={saving}
          className="h-9 w-full rounded-md bg-primary text-on-primary text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-1.5"
        >
          {saving ? '保存中…' : '保存修改'}
        </button>
      )}

      {/* ── 验收标准 & 预期产出 ── */}
      <div className="flex flex-col gap-3 pt-1 border-t border-hairline-soft">
        <div>
          <label className="text-xs text-body mb-1 block">验收标准</label>
          <InlineTextarea
            value={parseNotesField(task.notes, 'acceptance')}
            onSave={val => saveNotesField('acceptance', val)}
            placeholder="定义任务完成的判断标准..."
          />
        </div>
        <div>
          <label className="text-xs text-body mb-1 block">预期产出</label>
          <InlineTextarea
            value={parseNotesField(task.notes, 'output')}
            onSave={val => saveNotesField('output', val)}
            placeholder="描述任务完成后的交付物..."
          />
        </div>
      </div>
    </div>
  )
}

// ─── 预估时长子组件 ─────────────────────────────────────────────────────

/**
 * 预估时长编辑器（小时+分钟双输入框，失焦自动保存，[018-G3] R3：支持 blur 校验回调）
 */
function DurationEdit({
  value,
  onSave,
  saving,
  onValidate,
}: {
  value?: number
  onSave: (val: number | undefined) => Promise<void>
  saving: boolean
  /** [018-G3] R3：blur 时触发 realtime 校验 */
  onValidate?: (val: number) => void
}) {
  const [draftHours, setDraftHours] = useState(() => durationHours(value))
  const [draftMinutes, setDraftMinutes] = useState(() => durationMinutes(value))

  /** 失焦保存：值变化时调用 onSave，同时触发 R3 realtime 校验 */
  const handleBlur = useCallback(() => {
    const total = parseDurationToMinutes(draftHours, draftMinutes)
    if (total === (value ?? 0)) return
    onValidate?.(total)
    onSave(total > 0 ? total : undefined)
  }, [draftHours, draftMinutes, value, onSave, onValidate])

  /** 同步外部 value 变更（如其他地方修改了时长） */
  const [prevValue, setPrevValue] = useState(value)
  if (value !== prevValue) {
    setPrevValue(value)
    setDraftHours(durationHours(value))
    setDraftMinutes(durationMinutes(value))
  }

  return (
    <div className="flex items-center gap-1">
      <input
        type="number"
        min={0}
        value={draftHours}
        onChange={e => setDraftHours(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); handleBlur() }
        }}
        disabled={saving}
        className="h-7 w-14 rounded-md border border-hairline bg-canvas px-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-focus-ring"
        placeholder="0"
      />
      <span className="text-xs text-muted-soft">小时</span>
      <input
        type="number"
        min={0}
        max={59}
        value={draftMinutes}
        onChange={e => setDraftMinutes(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); handleBlur() }
        }}
        disabled={saving}
        className="h-7 w-14 rounded-md border border-hairline bg-canvas px-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-focus-ring"
        placeholder="0"
      />
      <span className="text-xs text-muted-soft">分钟</span>
    </div>
  )
}
