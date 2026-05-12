"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { SplitWarning } from "./split-warning"
import { StatusBadge } from "./status-badge"
import type { Task, Project } from "@/usom/types/objects"
import type { ResolvedTime } from "@/domains/projects/time-inheritance"

export interface TaskWithChildren extends Task {
  children: TaskWithChildren[]
  resolvedTime: ResolvedTime
}

interface TaskListProps {
  tasks: TaskWithChildren[]
  project?: Project
  onTaskClick: (taskId: string) => void
  onAddSubTask: (parentId: string) => void
}

function buildTree(tasks: Task[], resolvedTimes: Map<string, ResolvedTime>): TaskWithChildren[] {
  const map = new Map<string, TaskWithChildren>()
  const roots: TaskWithChildren[] = []

  for (const task of tasks) {
    map.set(task.id, { ...task, children: [], resolvedTime: resolvedTimes.get(task.id) ?? {} })
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
  project,
  onTaskClick,
  onAddSubTask,
}: {
  task: TaskWithChildren
  depth: number
  project?: Project
  onTaskClick: (taskId: string) => void
  onAddSubTask: (parentId: string) => void
}) {
  const [collapsed, setCollapsed] = useState(false)
  const hasChildren = task.children.length > 0

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

        {/* 时间继承 */}
        {task.resolvedTime.defaultTime && (
          <span className="text-xs text-muted-foreground shrink-0">{task.resolvedTime.defaultTime}</span>
        )}

        {/* 时长 */}
        {task.resolvedTime.defaultDuration && (
          <span className="text-xs text-muted-foreground shrink-0">{task.resolvedTime.defaultDuration}分钟</span>
        )}

        {/* 子任务数量 */}
        {hasChildren && (
          <span className="text-xs text-muted-foreground shrink-0">{task.children.length}个子任务</span>
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
              project={project}
              onTaskClick={onTaskClick}
              onAddSubTask={onAddSubTask}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function TaskList({ tasks, project, onTaskClick, onAddSubTask }: TaskListProps) {
  if (tasks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <p className="text-sm">暂无任务</p>
        <p className="text-xs mt-1">点击"添加任务"开始</p>
      </div>
    )
  }

  // tasks are already TaskWithChildren from buildTree in the parent
  return (
    <div className="flex flex-col gap-0.5">
      {tasks.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          depth={0}
          project={project}
          onTaskClick={onTaskClick}
          onAddSubTask={onAddSubTask}
        />
      ))}
    </div>
  )
}

export { buildTree }
