"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "./status-badge"
import { SplitWarning } from "./split-warning"
import { TaskList, buildTree } from "./task-list"
import { resolveTaskTime } from "@/domains/projects/time-inheritance"
import { ProjectRepository } from "@/lib/db/repositories/project.repository"
import { TaskRepository } from "@/lib/db/repositories/task.repository"
import type { Project, Task } from "@/usom/types/objects"
import type { TaskStatus } from "@/usom/types/primitives"

interface ProjectDetailProps {
  projectId: string
  onAddTask: (parentId?: string) => void
  onEditTask: (taskId: string) => void
  onStatusChange: (taskId: string, newStatus: TaskStatus) => void
}

export function ProjectDetail({ projectId, onAddTask, onEditTask, onStatusChange }: ProjectDetailProps) {
  const [project, setProject] = useState<Project | null>(null)
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const projectRepo = new ProjectRepository()
  const taskRepo = new TaskRepository()

  useEffect(() => {
    async function load() {
      try {
        setLoading(true)
        // TODO: get userId from session
        const userId = "current-user"
        const p = await projectRepo.findById(projectId, userId)
        if (!p) { setError("项目不存在"); return }
        setProject(p)
        const t = await taskRepo.findByProject(projectId, userId)
        setTasks(t)
      } catch (e) {
        setError("加载失败")
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [projectId])

  if (loading) return <div className="p-8 text-center text-muted-foreground">加载中...</div>
  if (error || !project) return <div className="p-8 text-center text-muted-foreground">{error ?? "项目不存在"}</div>

  // 计算时间继承
  const parentMap = new Map<string, Task>()
  for (const t of tasks) parentMap.set(t.id, t)

  const resolvedTimes = new Map<string, ReturnType<typeof resolveTaskTime>>()
  for (const t of tasks) {
    const parent = t.parentId ? parentMap.get(t.parentId) : null
    resolvedTimes.set(t.id, resolveTaskTime(t, parent, project))
  }

  const tree = buildTree(tasks, resolvedTimes)

  const totalTasks = tasks.length
  const completedTasks = tasks.filter(t => t.status === "completed").length

  // 任务状态转换映射
  const TASK_TRANSITIONS: Record<string, { action: string; label: string; status: string }[]> = {
    draft: [{ action: 'activate', label: '激活', status: 'active' }],
    active: [{ action: 'start', label: '开始', status: 'in_progress' }, { action: 'pause', label: '搁置', status: 'on_hold' }],
    in_progress: [{ action: 'pause', label: '搁置', status: 'on_hold' }, { action: 'complete', label: '完成', status: 'completed' }],
    on_hold: [{ action: 'resume', label: '恢复', status: 'active' }],
  }

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
          {project.status === 'planning' && (
            <Button size="sm" variant="default" onClick={() => onStatusChange(project.id, 'active' as TaskStatus)}>激活项目</Button>
          )}
          {project.status === 'active' && (
            <>
              <Button size="sm" variant="outline" onClick={() => onStatusChange(project.id, 'paused' as TaskStatus)}>暂停</Button>
              <Button size="sm" variant="default" onClick={() => onStatusChange(project.id, 'completed' as TaskStatus)}>完成</Button>
            </>
          )}
          {project.status === 'paused' && (
            <Button size="sm" variant="default" onClick={() => onStatusChange(project.id, 'active' as TaskStatus)}>恢复</Button>
          )}
          <Button variant="outline" size="sm" onClick={() => onEditTask("")}>
            编辑项目
          </Button>
        </div>
      </div>

      {/* 默认时间信息 */}
      {(project.defaultEarliestTime || project.defaultLatestStartTime || project.defaultDuration) && (
        <div className="flex gap-4 text-xs text-muted-foreground bg-muted/30 rounded-md px-4 py-2">
          {project.defaultEarliestTime && <span>默认最早: {project.defaultEarliestTime}</span>}
          {project.defaultLatestStartTime && <span>默认最晚: {project.defaultLatestStartTime}</span>}
          {project.defaultDuration && <span>默认时长: {project.defaultDuration}分钟</span>}
        </div>
      )}

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
          project={project}
          onTaskClick={(id) => onEditTask(id)}
          onAddSubTask={(parentId) => onAddTask(parentId)}
          onStatusChange={onStatusChange}
        />
      </div>
    </div>
  )
}
