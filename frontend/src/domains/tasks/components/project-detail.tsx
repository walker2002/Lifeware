"use client"

import { Button } from "@/components/ui/button"
import { StatusBadge } from "./status-badge"
import { TaskList, buildTree } from "./task-list"
import type { Project, Task } from "@/usom/types/objects"
import type { TaskStatus, ProjectStatus } from "@/usom/types/primitives"

interface ProjectDetailProps {
  project: Project
  tasks: Task[]
  onAddTask: (parentId?: string) => void
  onEditTask: (taskId: string) => void
  onEditProject: () => void
  onSaveAsTemplate: () => void
  onStatusChange: (taskId: string, newStatus: TaskStatus) => void
  onProjectStatusChange: (newStatus: ProjectStatus) => void
}

export function ProjectDetail({ project, tasks, onAddTask, onEditTask, onEditProject, onSaveAsTemplate, onStatusChange, onProjectStatusChange }: ProjectDetailProps) {
  const tree = buildTree(tasks)

  const totalTasks = tasks.length
  const completedTasks = tasks.filter(t => t.status === "completed").length

  return (
    <div className="flex flex-col gap-6 p-6 max-w-3xl mx-auto">
      {/* 标题区 */}
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-2">
          <h1 className="text-xl font-semibold tracking-tight">{project.name}</h1>
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <StatusBadge status={project.status} />
            {project.priority && <span>优先级: {project.priority}</span>}
            {project.startDate && <span>{project.startDate}{project.endDate ? ` → ${project.endDate}` : ""}</span>}
          </div>
          {project.description && <p className="text-sm text-muted-foreground mt-1">{project.description}</p>}
        </div>
        <div className="flex items-center gap-2">
          {project.status === "planning" && (
            <Button size="sm" variant="default" onClick={() => onProjectStatusChange("active")}>激活项目</Button>
          )}
          {project.status === "active" && (
            <>
              <Button size="sm" variant="outline" onClick={() => onProjectStatusChange("paused")}>暂停</Button>
              <Button size="sm" variant="default" onClick={() => onProjectStatusChange("completed")}>完成</Button>
            </>
          )}
          {project.status === "paused" && (
            <Button size="sm" variant="default" onClick={() => onProjectStatusChange("active")}>恢复</Button>
          )}
          {project.status === "completed" && (
            <Button size="sm" variant="outline" onClick={() => onProjectStatusChange("archived")}>归档</Button>
          )}
          <Button variant="outline" size="sm" onClick={onEditProject}>
            编辑项目
          </Button>
          <Button variant="ghost" size="sm" onClick={onSaveAsTemplate}>
            保存为模板
          </Button>
        </div>
      </div>

      {/* 进度 */}
      {totalTasks > 0 && (
        <div className="flex items-center gap-3">
          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${Math.round((completedTasks / totalTasks) * 100)}%` }}
            />
          </div>
          <span className="text-sm text-muted-foreground shrink-0">{completedTasks}/{totalTasks} 完成</span>
        </div>
      )}

      {/* 任务列表 */}
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium">任务列表</h2>
          <Button size="sm" variant="outline" onClick={() => onAddTask()}>
            + 添加任务
          </Button>
        </div>
        <TaskList
          tasks={tree}
          onTaskClick={(id) => onEditTask(id)}
          onAddSubTask={(parentId) => onAddTask(parentId)}
          onStatusChange={onStatusChange}
        />
      </div>
    </div>
  )
}
