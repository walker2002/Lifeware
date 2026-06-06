/**
 * @file task-complete-zone
 * @brief D 区 — 任务完成/追踪区域
 *
 * 根据 task.tracking 模式渲染不同的追踪/完成界面：
 * - none: 不渲染
 * - check_in: 实际用时 + 标记完成
 * - log: 实际用时 + 产出输入 + 标记完成
 * - review: 结构化复盘表单 + 保存草稿 + 完成并提交
 * - 已完成状态：只读摘要
 */

'use client'

import { useState, useCallback } from 'react'
import { CheckCircle2, Clock, FileText, Save, Send, BookOpen } from 'lucide-react'
import { cn } from '@/lib/utils'
import { updateTask, completeTask } from '@/app/actions/tasks'
import { formatDuration, parseDurationToMinutes, durationHours, durationMinutes } from '@/lib/format-duration'
import type { Task } from '../../../usom/types/objects'
import type { USOM_ID } from '../../../usom/types/primitives'

// ─── 类型定义 ──────────────────────────────────────────────────────────

/** TaskCompleteZone 组件 Props */
interface TaskCompleteZoneProps {
  /** 当前任务对象 */
  task: Task
  /** 当前用户 ID */
  userId: USOM_ID
  /** 任务更新回调 */
  onTaskUpdate: (task: Task) => void
}

/** 复盘表单数据 */
interface ReviewFormData {
  output: string
  method: string
  learnings: string
  improvements: string
}

// ─── 组件 ──────────────────────────────────────────────────────────────

/**
 * D 区 — 任务完成/追踪区域
 * @param props - 组件属性
 */
export function TaskCompleteZone({ task, userId, onTaskUpdate }: TaskCompleteZoneProps) {
  // 根据 tracking 模式分发
  switch (task.tracking) {
    case 'none':
      return null
    case 'check_in':
      return <CheckInForm task={task} onTaskUpdate={onTaskUpdate} />
    case 'log':
      return <LogForm task={task} onTaskUpdate={onTaskUpdate} />
    case 'review':
      return <ReviewForm task={task} onTaskUpdate={onTaskUpdate} />
    default:
      return null
  }
}

// ─── 已完成摘要 ─────────────────────────────────────────────────────────

/**
 * 已完成任务的只读摘要
 */
function CompletedSummary({ task }: { task: Task }) {
  return (
    <div className="rounded-lg border border-success/30 bg-success-soft p-4">
      <div className="flex items-center gap-2 mb-3">
        <CheckCircle2 className="size-4 text-success" />
        <h3 className="text-sm font-semibold text-ink">已完成</h3>
      </div>
      {task.completedAt && (
        <div className="text-xs text-muted-soft mb-2">
          完成时间：{new Date(task.completedAt).toLocaleString('zh-CN')}
        </div>
      )}
      {task.actualDuration ? (
        <div className="flex items-center gap-1.5 text-xs text-ink mb-1">
          <Clock className="size-3 text-muted-soft" />
          实际用时：{formatDuration(task.actualDuration)}
        </div>
      ) : null}
      {task.notes && (
        <div className="mt-2 pt-2 border-t border-success/20">
          <p className="text-xs text-ink whitespace-pre-wrap">{task.notes}</p>
        </div>
      )}
    </div>
  )
}

// ─── Check-in 表单 ──────────────────────────────────────────────────────

/**
 * Check-in 追踪模式：实际用时 + 标记完成
 */
function CheckInForm({ task, onTaskUpdate }: { task: Task; onTaskUpdate: (task: Task) => void }) {
  const [durHours, setDurHours] = useState(() => durationHours(task.estimatedDuration))
  const [durMinutes, setDurMinutes] = useState(() => durationMinutes(task.estimatedDuration))
  const [saving, setSaving] = useState(false)

  const isCompleted = task.status === 'completed'

  const handleComplete = useCallback(async () => {
    setSaving(true)
    try {
      const total = parseDurationToMinutes(durHours, durMinutes)
      const extraFields: Record<string, unknown> = {}
      if (total > 0) extraFields.actualDuration = total
      const updated = await completeTask(task.id, Object.keys(extraFields).length > 0 ? extraFields : undefined)
      onTaskUpdate(updated)
    } finally {
      setSaving(false)
    }
  }, [durHours, durMinutes, task.id, onTaskUpdate])

  if (isCompleted) return <CompletedSummary task={task} />

  return (
    <div className="rounded-lg border border-hairline bg-surface-soft p-4">
      <h3 className="text-sm font-semibold text-ink mb-3">完成打卡</h3>

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-soft w-20 shrink-0">实际用时</label>
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={0}
              value={durHours}
              onChange={e => setDurHours(e.target.value)}
              className="h-8 w-14 rounded-md border border-hairline bg-canvas px-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-focus-ring"
              placeholder="0"
            />
            <span className="text-xs text-muted-soft">小时</span>
            <input
              type="number"
              min={0}
              max={59}
              value={durMinutes}
              onChange={e => setDurMinutes(e.target.value)}
              className="h-8 w-14 rounded-md border border-hairline bg-canvas px-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-focus-ring"
              placeholder="0"
            />
            <span className="text-xs text-muted-soft">分钟</span>
          </div>
        </div>

        {/* 事后补录：额外时间字段 — TODO: 提取为 <RetrospectiveFields /> 共享组件 */}
        {task.captureMode === 'retrospective' && (
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-muted mb-1">实际执行日期</label>
              <input
                type="date"
                className="w-full h-8 rounded-md border border-hairline bg-canvas px-2 text-sm text-ink"
              />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">开始时间</label>
              <input
                type="time"
                className="w-full h-8 rounded-md border border-hairline bg-canvas px-2 text-sm text-ink"
              />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">结束时间</label>
              <input
                type="time"
                className="w-full h-8 rounded-md border border-hairline bg-canvas px-2 text-sm text-ink"
              />
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={handleComplete}
          disabled={saving}
          className="h-9 w-full rounded-md bg-success text-on-primary text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-1.5"
        >
          <CheckCircle2 className="size-4" />
          {saving ? '保存中…' : '标记完成'}
        </button>
      </div>
    </div>
  )
}

// ─── Log 表单 ───────────────────────────────────────────────────────────

/**
 * Log 追踪模式：实际用时 + 本次产出 + 标记完成
 */
function LogForm({ task, onTaskUpdate }: { task: Task; onTaskUpdate: (task: Task) => void }) {
  const [actualDuration, setActualDuration] = useState(task.estimatedDuration != null ? String(task.estimatedDuration) : '')
  const [output, setOutput] = useState('')
  const [saving, setSaving] = useState(false)

  const isCompleted = task.status === 'completed'

  const handleComplete = useCallback(async () => {
    setSaving(true)
    try {
      const dur = parseInt(actualDuration, 10)
      const patch: Record<string, unknown> = {}
      if (dur && !isNaN(dur)) patch.actualDuration = dur
      if (output.trim()) patch.notes = output.trim()
      const updated = await completeTask(task.id, Object.keys(patch).length > 0 ? patch : undefined)
      onTaskUpdate(updated)
    } finally {
      setSaving(false)
    }
  }, [actualDuration, output, task.id, onTaskUpdate])

  if (isCompleted) return <CompletedSummary task={task} />

  return (
    <div className="rounded-lg border border-hairline bg-surface-soft p-4">
      <h3 className="text-sm font-semibold text-ink mb-3">完成记录</h3>

      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-soft w-20 shrink-0">实际用时</label>
          <div className="flex items-center gap-1">
            <input
              type="number"
              min={1}
              value={actualDuration}
              onChange={e => setActualDuration(e.target.value)}
              className="h-8 w-20 rounded-md border border-hairline bg-canvas px-2 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-focus-ring"
              placeholder="分钟"
            />
            <span className="text-xs text-muted-soft">分钟</span>
          </div>
        </div>

        {/* 事后补录：额外时间字段 — TODO: 提取为 <RetrospectiveFields /> 共享组件 */}
        {task.captureMode === 'retrospective' && (
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-muted mb-1">实际执行日期</label>
              <input
                type="date"
                className="w-full h-8 rounded-md border border-hairline bg-canvas px-2 text-sm text-ink"
              />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">开始时间</label>
              <input
                type="time"
                className="w-full h-8 rounded-md border border-hairline bg-canvas px-2 text-sm text-ink"
              />
            </div>
            <div>
              <label className="block text-xs text-muted mb-1">结束时间</label>
              <input
                type="time"
                className="w-full h-8 rounded-md border border-hairline bg-canvas px-2 text-sm text-ink"
              />
            </div>
          </div>
        )}

        <div className="flex flex-col gap-1">
          <label className="text-xs text-muted-soft">本次产出</label>
          <textarea
            value={output}
            onChange={e => setOutput(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-hairline bg-canvas px-3 py-2 text-xs text-ink placeholder:text-muted-soft focus:outline-none focus:ring-2 focus:ring-focus-ring resize-y"
            placeholder="描述本次完成的内容..."
          />
        </div>

        <button
          type="button"
          onClick={handleComplete}
          disabled={saving}
          className="h-9 w-full rounded-md bg-success text-on-primary text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-1.5"
        >
          <FileText className="size-4" />
          {saving ? '保存中…' : '记录并完成'}
        </button>
      </div>
    </div>
  )
}

// ─── Review 表单 ────────────────────────────────────────────────────────

/**
 * Review 追踪模式：结构化复盘表单 + 保存草稿 + 完成并提交
 */
function ReviewForm({ task, onTaskUpdate }: { task: Task; onTaskUpdate: (task: Task) => void }) {
  const [form, setForm] = useState<ReviewFormData>({
    output: '',
    method: '',
    learnings: '',
    improvements: '',
  })
  const [saving, setSaving] = useState<'draft' | 'complete' | null>(null)

  const isCompleted = task.status === 'completed'

  const updateField = (field: keyof ReviewFormData, value: string) => {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  /** 保存草稿（不改变状态，只保存 notes） */
  const handleSaveDraft = useCallback(async () => {
    setSaving('draft')
    try {
      const notes = buildReviewNotes(form)
      const updated = await updateTask(task.id, { notes } as any)
      onTaskUpdate(updated)
    } finally {
      setSaving(null)
    }
  }, [form, task.id, onTaskUpdate])

  /** 完成并提交复盘 */
  const handleComplete = useCallback(async () => {
    setSaving('complete')
    try {
      const notes = buildReviewNotes(form)
      const updated = await completeTask(task.id, notes ? { notes } : undefined)
      onTaskUpdate(updated)
    } finally {
      setSaving(null)
    }
  }, [form, task.id, onTaskUpdate])

  if (isCompleted) return <CompletedSummary task={task} />

  return (
    <div className="rounded-lg border border-hairline bg-surface-soft p-4">
      <div className="flex items-center gap-2 mb-3">
        <BookOpen className="size-4 text-primary" />
        <h3 className="text-sm font-semibold text-ink">执行复盘</h3>
      </div>

      <div className="flex flex-col gap-3">
        {/* 产出成果 */}
        <ReviewField
          label="产出成果"
          value={form.output}
          onChange={v => updateField('output', v)}
          placeholder="本次任务的实际产出是什么？"
        />

        {/* 执行方法 */}
        <ReviewField
          label="执行方法"
          value={form.method}
          onChange={v => updateField('method', v)}
          placeholder="使用了什么方法/工具？效率如何？"
        />

        {/* 经验与收获 */}
        <ReviewField
          label="经验与收获"
          value={form.learnings}
          onChange={v => updateField('learnings', v)}
          placeholder="从中学到了什么？有什么可复用的经验？"
        />

        {/* 改进点 */}
        <ReviewField
          label="改进点"
          value={form.improvements}
          onChange={v => updateField('improvements', v)}
          placeholder="下次如何做得更好？有什么需要避免的？"
        />

        {/* 操作按钮 */}
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={saving !== null}
            className="h-9 flex-1 rounded-md border border-hairline text-sm font-medium text-ink hover:bg-hover-overlay disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5"
          >
            <Save className="size-4" />
            {saving === 'draft' ? '保存中…' : '保存草稿'}
          </button>
          <button
            type="button"
            onClick={handleComplete}
            disabled={saving !== null}
            className="h-9 flex-1 rounded-md bg-success text-on-primary text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-opacity flex items-center justify-center gap-1.5"
          >
            <Send className="size-4" />
            {saving === 'complete' ? '提交中…' : '完成并提交复盘'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── 复盘字段子组件 ─────────────────────────────────────────────────────

/**
 * 复盘表单单字段
 */
function ReviewField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder: string
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-medium text-ink-secondary">{label}</label>
      <textarea
        value={value}
        onChange={e => onChange(e.target.value)}
        rows={3}
        className="w-full rounded-md border border-hairline bg-canvas px-3 py-2 text-xs text-ink placeholder:text-muted-soft focus:outline-none focus:ring-2 focus:ring-focus-ring resize-y"
        placeholder={placeholder}
      />
    </div>
  )
}

// ─── 工具函数 ──────────────────────────────────────────────────────────

/**
 * 将复盘表单数据构建为 notes 字符串
 */
function buildReviewNotes(form: ReviewFormData): string {
  const sections = [
    form.output && `## 产出成果\n${form.output}`,
    form.method && `## 执行方法\n${form.method}`,
    form.learnings && `## 经验与收获\n${form.learnings}`,
    form.improvements && `## 改进点\n${form.improvements}`,
  ].filter(Boolean)

  return sections.join('\n\n')
}
