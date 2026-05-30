'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'

interface TaskItem {
  id: string
  title: string
  priority: string
  estimatedDuration: number
  status: string
}

interface TaskEditCardProps {
  surfaceType: string
  dataModel: Record<string, unknown>
  onDataChange: (data: Record<string, unknown>) => void
  onConfirm: (data: Record<string, unknown>) => void
  onCancel: () => void
  isLoading?: boolean
  isDone?: boolean
}

const PRIORITY_LABELS: Record<string, string> = {
  critical: '紧急',
  high: '高',
  medium: '中',
  low: '低',
}

export function TaskEditCard({ dataModel, onDataChange, onConfirm, onCancel, isLoading, isDone }: TaskEditCardProps) {
  const tasks = (dataModel.tasks as TaskItem[]) ?? []
  const selectedTaskId = dataModel.taskId as string | undefined
  const [editTitle, setEditTitle] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editPriority, setEditPriority] = useState('medium')
  const [editDuration, setEditDuration] = useState('60')

  if (selectedTaskId) {
    return (
      <div className="w-full max-w-md">
        <div className="mb-3 text-sm font-medium text-ink">编辑任务</div>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted-foreground">标题</label>
            <input
              className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              value={editTitle}
              onChange={e => setEditTitle(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-muted-foreground">描述</label>
            <textarea
              className="w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              rows={2}
              value={editDescription}
              onChange={e => setEditDescription(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">优先级</label>
              <select
                value={editPriority}
                onChange={e => setEditPriority(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
              >
                {Object.entries(PRIORITY_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs text-muted-foreground">预估时长（分钟）</label>
              <input
                type="number"
                min={5}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                value={editDuration}
                onChange={e => setEditDuration(e.target.value)}
              />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => onDataChange({ tasks: dataModel.tasks })}
              className="rounded-md border px-3 py-1.5 text-xs"
            >
              返回选择
            </button>
            <button
              type="button"
              onClick={() => onConfirm({
                taskId: selectedTaskId,
                title: editTitle,
                description: editDescription,
                priority: editPriority,
                estimatedDuration: Number(editDuration),
              })}
              disabled={isLoading}
              className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
            >
              {isLoading ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="w-full max-w-lg">
      <div className="mb-3 text-sm font-medium text-ink">请选择要修改的任务</div>

      {tasks.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">没有可编辑的任务</p>
      ) : (
        <div className="flex flex-col gap-2">
          {tasks.map(task => (
            <button
              key={task.id}
              type="button"
              onClick={() => {
                setEditTitle(task.title)
                setEditDescription('')
                setEditPriority(task.priority)
                setEditDuration(String(task.estimatedDuration ?? 60))
                onDataChange({ taskId: task.id, ...task })
              }}
              className="flex items-center gap-3 rounded-md border p-3 text-left transition-colors hover:border-blue-400 hover:bg-blue-50/50"
            >
              <div className="flex-1">
                <div className="text-sm font-medium">{task.title}</div>
                <div className="text-xs text-muted-foreground">
                  {PRIORITY_LABELS[task.priority] ?? task.priority}
                  {task.estimatedDuration ? ` · ${task.estimatedDuration}分钟` : ''}
                </div>
              </div>
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className="rounded-md border px-3 py-1.5 text-xs">
          取消
        </button>
      </div>
    </div>
  )
}
