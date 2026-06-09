/**
 * @file ThreadPromoteCard
 * @brief 任务提升为主线卡片 CNUI Surface
 *
 * CNUI 表面 — 用于将现有任务提升为主线
 */

'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { CnuiButton } from '@/components/cnui/components/Button'

/**
 * ThreadPromoteCard 组件属性
 */
interface ThreadPromoteCardProps {
  surfaceType: string
  dataModel: Record<string, unknown>
  onDataChange: (data: Record<string, unknown>) => void
  onConfirm: (data: Record<string, unknown>) => void
  onCancel?: () => void
  isLoading?: boolean
  isDone?: boolean
}

/**
 * 任务提升为主线卡片组件
 * @description AI 对话内展示的任务→主线提升表单
 */
export function ThreadPromoteCard({
  dataModel,
  onDataChange,
  onConfirm,
  onCancel,
  isLoading,
  isDone,
}: ThreadPromoteCardProps) {
  const tasks = (dataModel.tasks as Array<Record<string, unknown>>) ?? []
  const [selectedTaskId, setSelectedTaskId] = useState<string>(
    (dataModel.taskId as string) ?? '',
  )
  const [threadName, setThreadName] = useState('')
  const [threadColor, setThreadColor] = useState('#6366f1')

  const selectedTask = tasks.find(t => t.id === selectedTaskId)

  // 选择任务后自动填充名称
  function handleTaskSelect(taskId: string) {
    setSelectedTaskId(taskId)
    const task = tasks.find(t => t.id === taskId)
    if (task) {
      setThreadName((task.title as string) ?? '')
    }
    onDataChange({ ...dataModel, taskId, selectedTask: task })
  }

  function handleConfirm() {
    if (!selectedTaskId) return
    onConfirm({
      taskId: selectedTaskId,
      name: (threadName || (selectedTask?.title as string)) ?? '新主线',
      color: threadColor,
    })
  }

  if (isDone) {
    return (
      <Card className="w-full max-w-md">
        <CardContent className="pt-4 text-center">
          <p className="text-sm text-ink">✅ 主线已创建，任务已关联</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>提升任务为主线</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* 任务选择 */}
        {tasks.length > 0 && (
          <div>
            <label className="text-xs text-body mb-1 block">选择任务</label>
            <div className="max-h-32 overflow-y-auto space-y-1">
              {tasks.map(task => (
                <button
                  key={task.id as string}
                  type="button"
                  onClick={() => handleTaskSelect(task.id as string)}
                  className={`w-full text-left rounded-md border px-3 py-1.5 text-sm transition-colors ${
                    selectedTaskId === task.id
                      ? 'border-primary bg-primary/10 text-ink'
                      : 'border-hairline bg-canvas text-body hover:border-hairline-soft'
                  }`}
                >
                  {task.title as string}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 未找到任务时显示 taskId */}
        {tasks.length === 0 && selectedTaskId && (
          <div className="text-xs text-muted">
            任务 ID: {selectedTaskId}
          </div>
        )}

        {/* 主线名称 */}
        <div>
          <label className="text-xs text-body mb-1 block">主线名称</label>
          <input
            type="text"
            value={threadName}
            onChange={e => {
              setThreadName(e.target.value)
              onDataChange({ ...dataModel, name: e.target.value })
            }}
            placeholder="输入主线名称"
            className="h-8 w-full rounded-md border border-hairline bg-canvas px-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-focus-ring"
          />
        </div>

        {/* 颜色 */}
        <div>
          <label className="text-xs text-body mb-1 block">颜色标签</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={threadColor}
              onChange={e => {
                setThreadColor(e.target.value)
                onDataChange({ ...dataModel, color: e.target.value })
              }}
              className="size-8 rounded border border-hairline cursor-pointer"
            />
            <span className="text-xs text-body">{threadColor}</span>
          </div>
        </div>

        {/* 操作按钮 */}
        <div className="flex items-center gap-2 pt-2">
          <CnuiButton
            label="提升为主线"
            onClick={handleConfirm}
            disabled={!selectedTaskId || isLoading}
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
