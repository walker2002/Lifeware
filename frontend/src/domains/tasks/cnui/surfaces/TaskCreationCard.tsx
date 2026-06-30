/**
 * @file TaskCreationCard
 * @brief 任务创建卡片 CNUI Surface
 *
 * CNUI 表面 — 用于对话内创建任务，支持标题、描述、优先级、预估时长等字段。
 * [018-G3] R3：集成 useManifestRules 客户端 realtime blur 校验 + 服务端错误回填。
 */

'use client'

import { useState, useEffect } from 'react'

// [018-G3] R3：client 组件不可从 barrel @/nexus/rules import
import { useManifestRules, useServerErrorBackfill } from '@/nexus/rules/use-manifest-rules'
import { taskRuleRegistry } from '../../rules-registry'
import { durationHours, durationMinutes, parseDurationToMinutes } from '@/lib/format-duration'
// [023] A3.2：裸版 ArchetypePicker（公共化，无自带视觉盒/标题）
import { ArchetypePicker } from '@/components/archetype/archetype-picker'

/** 优先级选项 */
const PRIORITY_OPTIONS = [
  { value: '', label: '不设置' },
  { value: 'critical', label: '紧急' },
  { value: 'high', label: '高' },
  { value: 'medium', label: '中' },
  { value: 'low', label: '低' },
]

/**
 * TaskCreationCard 组件属性
 */
interface TaskCreationCardProps {
  /** CNUI surface 类型标识（框架契约，组件内部不消费） */
  surfaceType: string
  dataModel: Record<string, unknown>
  onDataChange: (data: Record<string, unknown>) => void
  onConfirm: (data: Record<string, unknown>) => void
  onCancel?: () => void
  isLoading?: boolean
  isDone?: boolean
  /** [018-G3] R3：服务端 submit 失败返回的 errors（按字段标红，匹配不上走表单级） */
  serverErrors?: string[]
}

/**
 * 任务创建卡片组件
 * @description AI 对话内展示的任务创建表单
 */
export function TaskCreationCard({
  dataModel,
  onDataChange,
  onConfirm,
  onCancel,
  isLoading,
  isDone,
  serverErrors,
}: TaskCreationCardProps) {
  const [title, setTitle] = useState((dataModel.title as string) ?? '')
  const [description, setDescription] = useState((dataModel.description as string) ?? '')
  const [priority, setPriority] = useState((dataModel.priority as string) ?? '')
  const [durHours, setDurHours] = useState(() =>
    dataModel.estimatedDuration ? durationHours(Number(dataModel.estimatedDuration)) : '',
  )
  const [durMinutes, setDurMinutes] = useState(() =>
    dataModel.estimatedDuration ? durationMinutes(Number(dataModel.estimatedDuration)) : '',
  )
  const [threadId, setThreadId] = useState<string | null>(
    (dataModel.threadId as string) ?? null,
  )
  // [023] A3.2：archetype 选择（optional nullable，dataModel 默认值透传）
  const [activityArchetypeId, setActivityArchetypeId] = useState<string | undefined>(
    (dataModel.activityArchetypeId as string) ?? undefined,
  )

  // [020] registry 即 SSOT：realtime meta 从 registry 派生，直传 registry（删 getRealtimeRules 中转）
  const { errors: fieldErrors, validateField } = useManifestRules(taskRuleRegistry)

  // R3 回填：从 serverErrors + registry 派生字段/表单级错误（useServerErrorBackfill 共享 hook）
  const { serverFieldErrors, formErrors } = useServerErrorBackfill(serverErrors, taskRuleRegistry)

  /** 提交表单 */
  function handleConfirm() {
    if (!title.trim()) return
    const totalMinutes = parseDurationToMinutes(durHours, durMinutes)
    onConfirm({
      title: title.trim(),
      description: description || undefined,
      priority: priority || undefined,
      estimatedDuration: totalMinutes > 0 ? totalMinutes : undefined,
      threadId: threadId || undefined,
      activityArchetypeId,
    })
  }

  if (isDone) {
    return (
      <p className="text-sm text-ink text-center py-2">✅ 任务已创建</p>
    )
  }

  return (
    <>
      <div className="space-y-3">
        {/* 标题 */}
        <div>
          <label className="text-xs text-body mb-1 block">
            标题 <span className="text-error">*</span>
          </label>
          <input
            type="text"
            value={title}
            onChange={e => {
              setTitle(e.target.value)
              onDataChange({ ...dataModel, title: e.target.value })
            }}
            placeholder="例如：完成周报"
            maxLength={100}
            className="h-8 w-full rounded-md border border-hairline bg-canvas px-2 text-sm text-ink placeholder:text-body/70-soft focus:outline-none focus:ring-2 focus:ring-focus-ring"
          />
        </div>

        {/* 描述 */}
        <div>
          <label className="text-xs text-body mb-1 block">描述</label>
          <textarea
            value={description}
            onChange={e => {
              setDescription(e.target.value)
              onDataChange({ ...dataModel, description: e.target.value })
            }}
            placeholder="任务描述…"
            maxLength={500}
            rows={2}
            className="w-full rounded-md border border-hairline bg-canvas px-2 py-1.5 text-sm text-ink placeholder:text-body/70-soft focus:outline-none focus:ring-2 focus:ring-focus-ring resize-none"
          />
        </div>

        {/* 优先级 + 预估时长 */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="text-xs text-body mb-1 block">优先级</label>
            <select
              value={priority}
              onChange={e => {
                setPriority(e.target.value)
                onDataChange({ ...dataModel, priority: e.target.value })
              }}
              onBlur={() => validateField('priority', priority)}
              className="h-8 w-full rounded-md border border-hairline bg-canvas px-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-focus-ring"
            >
              {PRIORITY_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            {(fieldErrors.priority || serverFieldErrors.priority) && (
              <p className="text-xs text-error mt-0.5">{fieldErrors.priority || serverFieldErrors.priority}</p>
            )}
          </div>
          <div>
            <label className="text-xs text-body mb-1 block">预估时长</label>
            <div className="flex items-center gap-1">
              <input
                type="number"
                min={0}
                value={durHours}
                onChange={e => {
                  setDurHours(e.target.value)
                  const total = parseDurationToMinutes(e.target.value, durMinutes)
                  onDataChange({ ...dataModel, estimatedDuration: total > 0 ? total : undefined })
                }}
                onBlur={() => {
                  const total = parseDurationToMinutes(durHours, durMinutes)
                  validateField('estimatedDuration', total || undefined)
                }}
                placeholder="0"
                className="h-8 w-full rounded-md border border-hairline bg-canvas px-2 text-sm text-ink placeholder:text-body/70-soft focus:outline-none focus:ring-2 focus:ring-focus-ring"
              />
              <span className="text-xs text-body shrink-0">时</span>
              <input
                type="number"
                min={0}
                max={59}
                value={durMinutes}
                onChange={e => {
                  setDurMinutes(e.target.value)
                  const total = parseDurationToMinutes(durHours, e.target.value)
                  onDataChange({ ...dataModel, estimatedDuration: total > 0 ? total : undefined })
                }}
                placeholder="0"
                className="h-8 w-full rounded-md border border-hairline bg-canvas px-2 text-sm text-ink placeholder:text-body/70-soft focus:outline-none focus:ring-2 focus:ring-focus-ring"
              />
              <span className="text-xs text-body shrink-0">分</span>
            </div>
            {(fieldErrors.estimatedDuration || serverFieldErrors.estimatedDuration) && (
              <p className="text-xs text-error mt-0.5">{fieldErrors.estimatedDuration || serverFieldErrors.estimatedDuration}</p>
            )}
          </div>
        </div>

        {/* 主线选择 */}
        <div>
          <label className="text-xs text-body mb-1 block">主线</label>
          <select
            value={threadId ?? ''}
            onChange={e => {
              const val = e.target.value || null
              setThreadId(val)
              onDataChange({ ...dataModel, threadId: val })
            }}
            className="h-8 w-full rounded-md border border-hairline bg-canvas px-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-focus-ring"
          >
            <option value="">普通任务（无主线）</option>
            {(dataModel.threads as Array<{ id: string; name: string }> | undefined)?.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>

        {/* 活动原型 */}
        <div>
          <label className="text-xs text-body mb-1 block">活动原型</label>
          <ArchetypePicker
            value={activityArchetypeId}
            onChange={id => {
              setActivityArchetypeId(id)
              onDataChange({ ...dataModel, activityArchetypeId: id })
            }}
          />
        </div>

        {/* 表单级错误 */}
        {formErrors.length > 0 && (
          <div className="rounded-md border border-error bg-error-soft px-2.5 py-1.5 text-xs text-error">
            {formErrors.map((err, i) => <div key={i}>{err}</div>)}
          </div>
        )}

        {/* 操作按钮 */}
        <div className="flex items-center justify-end gap-2 pt-2">
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border border-hairline px-3 py-1.5 text-xs text-ink hover:bg-hover-overlay transition-colors"
            >
              取消
            </button>
          )}
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!title.trim() || isLoading}
            className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50 transition-colors"
          >
            创建任务
          </button>
        </div>
      </div>
    </>
  )
}
