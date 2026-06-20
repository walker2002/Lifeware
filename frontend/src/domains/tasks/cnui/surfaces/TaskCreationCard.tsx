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
import { useManifestRules } from '@/nexus/rules/use-manifest-rules'
import { getRealtimeRules } from '@/nexus/rules/server/get-realtime-rules'
import { mapServerErrorsToFields } from '@/nexus/rules/server-error-mapping'
import type { RealtimeRuleMeta } from '@/nexus/rules/realtime'
import { taskRuleRegistry } from '../../rules-registry'

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
  const [estimatedDuration, setEstimatedDuration] = useState(
    dataModel.estimatedDuration ? String(dataModel.estimatedDuration) : '',
  )
  const [threadId, setThreadId] = useState<string | null>(
    (dataModel.threadId as string) ?? null,
  )

  // [018-G3] R3：realtime 校验状态
  const [realtimeRules, setRealtimeRules] = useState<RealtimeRuleMeta[]>([])
  const { errors: fieldErrors, validateField } = useManifestRules(realtimeRules, taskRuleRegistry)
  const [serverFieldErrors, setServerFieldErrors] = useState<Record<string, string>>({})
  const [formErrors, setFormErrors] = useState<string[]>([])

  // mount 时取 phase:both 规则元数据
  useEffect(() => {
    let mounted = true
    getRealtimeRules('tasks').then((r) => { if (mounted) setRealtimeRules(r) })
    return () => { mounted = false }
  }, [])

  // 服务端错误回填
  useEffect(() => {
    if (!serverErrors || serverErrors.length === 0) {
      setServerFieldErrors({})
      setFormErrors([])
      return
    }
    const ruleMessages: Record<string, string> = {}
    for (const r of realtimeRules) { ruleMessages[r.id] = r.message }
    const mapped = mapServerErrorsToFields(serverErrors, realtimeRules, ruleMessages)
    setServerFieldErrors(mapped.fieldErrors)
    setFormErrors(mapped.formErrors)
  }, [serverErrors, realtimeRules])

  /** 提交表单 */
  function handleConfirm() {
    if (!title.trim()) return
    onConfirm({
      title: title.trim(),
      description: description || undefined,
      priority: priority || undefined,
      estimatedDuration: estimatedDuration ? Number(estimatedDuration) : undefined,
      threadId: threadId || undefined,
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
            <label className="text-xs text-body mb-1 block">预估时长（分钟）</label>
            <input
              type="number"
              min={5}
              value={estimatedDuration}
              onChange={e => {
                setEstimatedDuration(e.target.value)
                onDataChange({ ...dataModel, estimatedDuration: e.target.value })
              }}
              onBlur={() => {
                const num = estimatedDuration ? Number(estimatedDuration) : undefined
                validateField('estimatedDuration', num)
              }}
              placeholder="60"
              className="h-8 w-full rounded-md border border-hairline bg-canvas px-2 text-sm text-ink placeholder:text-body/70-soft focus:outline-none focus:ring-2 focus:ring-focus-ring"
            />
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
