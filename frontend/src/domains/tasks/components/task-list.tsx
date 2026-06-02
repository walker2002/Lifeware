/**
 * @file task-list
 * @brief 任务列表组件
 * 
 * 展示任务树形结构，支持折叠、状态变更等操作
 */

"use client"

import { useState } from "react"
import { SplitWarning } from "./split-warning"
import { StatusBadge } from "./status-badge"
import type { Task } from "@/usom/types/objects"
import type { TaskStatus } from "@/usom/types/primitives"

/**
 * 带子任务的任务
 */
export interface TaskWithChildren extends Task {
  /** 子任务列表 */
  children: TaskWithChildren[]
}

/**
 * 任务列表属性
 */
interface TaskListProps {
  tasks: TaskWithChildren[]
  onTaskClick: (taskId: string) => void
  onAddSubTask: (parentId: string) => void
  onStatusChange?: (taskId: string, newStatus: TaskStatus) => void
}

function buildTree(tasks: Task[]): TaskWithChildren[] {
  const map = new Map<string, TaskWithChildren>()
  const roots: TaskWithChildren[] = []

  for (const task of tasks) {
    map.set(task.id, { ...task, children: [] })
  }

  for (const task of map.values()) {
    if (task.parentId && map.has(task.parentId)) {
      map.get(task.parentId)!.children.push(task)
    } else {
      roots.push(task)
    }
  }

  return roots
}

function TaskRow({
  task,
  depth = 0,
  onTaskClick,
  onAddSubTask,
  onStatusChange,
}: {
  task: TaskWithChildren
  depth: number
  onTaskClick: (taskId: string) => void
  onAddSubTask: (parentId: string) => void
  onStatusChange?: (taskId: string, newStatus: TaskStatus) => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  const hasChildren = task.children.length > 0

  const STATUS_ACTIONS: Record<string, { label: string; status: TaskStatus }[]> = {
    draft: [{ label: '激活', status: 'active' as TaskStatus }],
    active: [{ label: '开始', status: 'in_progress' as TaskStatus }, { label: '搁置', status: 'on_hold' as TaskStatus }],
    in_progress: [{ label: '搁置', status: 'on_hold' as TaskStatus }, { label: '完成', status: 'completed' as TaskStatus }],
    on_hold: [{ label: '恢复', status: 'active' as TaskStatus }],
  }

  const actions = STATUS_ACTIONS[task.status] ?? []

  return (
    <div>
      <div
        className="flex items-center gap-2 rounded-md px-2 py-2 hover:bg-muted/50 cursor-pointer group"
        style={{ paddingLeft: `${12 + depth * 24}px` }}
        onClick={() => onTaskClick(task.id)}
      >
        {/* 折叠/展开箭头 */}
        <button
          type="button"
          className={`size-4 flex items-center justify-center text-muted-foreground shrink-0 ${hasChildren ? "visible" : "invisible"}`}
          onClick={(e) => { e.stopPropagation(); setCollapsed(!collapsed) }}
        >
          <span className={`text-xs transition-transform ${collapsed ? "" : "rotate-90"}`}>
            ▸
          </span>
        </button>

        {/* 状态 */}
        <StatusBadge status={task.status as "draft" | "active" | "in_progress" | "on_hold" | "completed" | "archived"} size="sm" />

        {/* 标题 */}
        <span className="flex-1 text-sm truncate">{task.title}</span>

        {/* 拆分警告 */}
        {task.estimatedDuration > 720 && <SplitWarning />}

        {/* 预估时长 */}
        {task.estimatedDuration > 0 && (
          <span className="text-xs text-muted-foreground shrink-0">{task.estimatedDuration}分钟</span>
        )}

        {/* 子任务数量 */}
        {hasChildren && (
          <span className="text-xs text-muted-foreground shrink-0">{task.children.length}个子任务</span>
        )}

        {/* 状态操作按钮（悬停可见） */}
        {actions.length > 0 && onStatusChange && (
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
            {actions.map((a) => (
              <button
                key={a.label}
                type="button"
                className="text-xs px-1.5 py-0.5 rounded border border-muted-foreground/20 hover:bg-muted shrink-0"
                onClick={(e) => { e.stopPropagation(); onStatusChange(task.id, a.status) }}
              >
                {a.label}
              </button>
            ))}
          </div>
        )}

        {/* 添加子任务按钮 */}
        <button
          type="button"
          className="size-5 flex items-center justify-center rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-muted shrink-0"
          onClick={(e) => { e.stopPropagation(); onAddSubTask(task.id) }}
          title="添加子任务"
        >
          +
        </button>
      </div>

      {/* 子任务（可折叠） */}
      {hasChildren && !collapsed && (
        <div className="border-l border-muted ml-[22px]">
          {task.children.map((child) => (
            <TaskRow
              key={child.id}
              task={child}
              depth={depth + 1}
              onTaskClick={onTaskClick}
              onAddSubTask={onAddSubTask}
              onStatusChange={onStatusChange}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function TaskList({ tasks, onTaskClick, onAddSubTask, onStatusChange }: TaskListProps) {
  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <p className="text-sm">暂无任务</p>
        <p className="text-xs mt-1">点击&ldquo;添加任务&rdquo;开始</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-0.5">
      {tasks.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          depth={0}
          onTaskClick={onTaskClick}
          onAddSubTask={onAddSubTask}
          onStatusChange={onStatusChange}
        />
      ))}
    </div>
  )
}

export { buildTree }
