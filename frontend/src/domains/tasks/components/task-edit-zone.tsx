/**
 * @file task-edit-zone
 * @brief A 区 — 任务信息 inline 编辑区域
 *
 * 支持字段：title、description、priority、energyRequired、tracking、
 * estimatedDuration（双输入框即改即存）、dueDate。每个字段独立保存。
 */

'use client'

import { useState, useCallback } from 'react'
import { Brain, Cloud, ClipboardList, Sparkles, Flame, Pencil, Check, X } from 'lucide-react'
import type { Task } from '../../../usom/types/objects'
import { Priority, EnergyLevel } from '../../../usom/types/primitives'
import type { TrackingMode } from '../../../usom/types/primitives'
import { cn } from '@/lib/utils'
import { updateTask } from '@/app/actions/tasks'
import { parseDurationToMinutes, durationHours, durationMinutes } from '@/lib/format-duration'

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

/** 能量画像 → 图标映射 */
const ENERGY_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  deep: Brain,
  light: Cloud,
  admin: ClipboardList,
  creative: Sparkles,
  reactive: Flame,
}

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
  const [savingField, setSavingField] = useState<string | null>(null)

  /** 通用字段保存 */
  const saveField = useCallback(async (field: string, value: unknown) => {
    onDirtyChange?.(true)
    setSavingField(field)
    try {
      // TODO: title 修改后应触发后端 clarity 重新计算，B 区认知面板需同步刷新
      const updated = await updateTask(task.id, { [field]: value })
      onTaskUpdate(updated)
    } finally {
      onDirtyChange?.(false)
      setSavingField(null)
    }
  }, [task.id, onTaskUpdate, onDirtyChange])

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
    await saveField('notes', JSON.stringify(current))
  }

  const EnergyIcon = task.energyProfile ? ENERGY_ICONS[task.energyProfile] : null

  return (
    <div className="flex flex-col gap-5">
      {/* ── 标题行（含能量图标）── */}
      <div className="flex items-start gap-2">
        {EnergyIcon && <EnergyIcon className="size-5 mt-1 text-muted-soft shrink-0" />}
        <InlineEdit
          value={task.title}
          onSave={val => saveField('title', val)}
          className="text-2xl font-display font-semibold text-ink leading-tight"
          inputClassName="text-2xl font-display font-semibold w-full"
        />
      </div>

      {/* ── 描述 ── */}
      <div>
        <InlineTextarea
          value={task.description ?? ''}
          onSave={val => saveField('description', val)}
          placeholder="点击添加描述..."
        />
      </div>

      {/* ── 属性网格 ── */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        {/* 优先级 */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-body w-16 shrink-0">优先级</label>
          <select
            value={task.priority}
            onChange={e => saveField('priority', e.target.value)}
            disabled={savingField === 'priority'}
            onClick={e => e.stopPropagation()}
            className="h-8 w-full rounded-md border border-hairline bg-canvas px-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-focus-ring"
          >
            {Object.entries(PRIORITY_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>

        {/* 能量需求 */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-body w-16 shrink-0">能量需求</label>
          <select
            value={task.energyRequired}
            onChange={e => saveField('energyRequired', e.target.value)}
            disabled={savingField === 'energyRequired'}
            onClick={e => e.stopPropagation()}
            className="h-8 w-full rounded-md border border-hairline bg-canvas px-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-focus-ring"
          >
            {Object.entries(ENERGY_LABELS).map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </div>

        {/* 追踪模式 */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-body w-16 shrink-0">追踪模式</label>
          <select
            value={task.tracking}
            onChange={e => saveField('tracking', e.target.value)}
            disabled={savingField === 'tracking'}
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
            onSave={val => saveField('estimatedDuration', val)}
            saving={savingField === 'estimatedDuration'}
          />
        </div>

        {/* 开始时间 */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-body w-16 shrink-0">开始时间</label>
          <input
            type="date"
            value={task.startDate ?? ''}
            onChange={e => saveField('startDate', e.target.value || undefined)}
            disabled={savingField === 'startDate'}
            onClick={e => e.stopPropagation()}
            className="h-8 rounded-md border border-hairline bg-canvas px-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-focus-ring"
          />
        </div>

        {/* 截止日期 */}
        <div className="flex items-center gap-2 col-span-2">
          <label className="text-xs text-body w-16 shrink-0">截止日期</label>
          <input
            type="date"
            value={task.dueDate ?? ''}
            onChange={e => saveField('dueDate', e.target.value || undefined)}
            disabled={savingField === 'dueDate'}
            onClick={e => e.stopPropagation()}
            className="h-8 rounded-md border border-hairline bg-canvas px-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-focus-ring"
          />
        </div>
      </div>

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
 * 预估时长编辑器（小时+分钟双输入框，失焦自动保存）
 */
function DurationEdit({
  value,
  onSave,
  saving,
}: {
  value?: number
  onSave: (val: number | undefined) => Promise<void>
  saving: boolean
}) {
  const [draftHours, setDraftHours] = useState(() => durationHours(value))
  const [draftMinutes, setDraftMinutes] = useState(() => durationMinutes(value))

  /** 失焦保存：值变化时调用 onSave */
  const handleBlur = useCallback(() => {
    const total = parseDurationToMinutes(draftHours, draftMinutes)
    if (total === (value ?? 0)) return
    onSave(total > 0 ? total : undefined)
  }, [draftHours, draftMinutes, value, onSave])

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
