/**
 * @file TaskCreationCard
 * @brief 任务创建卡片 CNUI Surface
 *
 * CNUI 表面 — 用于对话内创建任务，支持标题、描述、优先级、预估时长等字段。
 */

'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CnuiButton } from '@/components/cnui/components/Button'

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
      <Card className="w-full max-w-md">
        <CardContent className="pt-4 text-center">
          <p className="text-sm text-ink">✅ 任务已创建</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>创建任务</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
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
            className="h-8 w-full rounded-md border border-hairline bg-canvas px-2 text-sm text-ink placeholder:text-muted-soft focus:outline-none focus:ring-2 focus:ring-focus-ring"
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
            className="w-full rounded-md border border-hairline bg-canvas px-2 py-1.5 text-sm text-ink placeholder:text-muted-soft focus:outline-none focus:ring-2 focus:ring-focus-ring resize-none"
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
              className="h-8 w-full rounded-md border border-hairline bg-canvas px-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-focus-ring"
            >
              {PRIORITY_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
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
              placeholder="60"
              className="h-8 w-full rounded-md border border-hairline bg-canvas px-2 text-sm text-ink placeholder:text-muted-soft focus:outline-none focus:ring-2 focus:ring-focus-ring"
            />
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

        {/* 操作按钮 */}
        <div className="flex items-center gap-2 pt-2">
          <CnuiButton
            label="创建任务"
            onClick={handleConfirm}
            disabled={!title.trim() || isLoading}
          />
          {onCancel && (
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md px-3 py-1.5 text-xs text-muted hover:text-ink transition-colors"
            >
              取消
            </button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
