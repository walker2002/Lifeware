"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { StatusBadge } from "./status-badge"
import type { Project, Task } from "@/usom/types/objects"

export interface TreeItem {
  type: "independent-task-section" | "project" | "task"
  id: string
  title: string
  status: string
  projectId?: string
  parentId?: string
  childCount?: number
  children?: TreeItem[]
  expanded?: boolean
}

interface ProjectTreeProps {
  projects: Project[]
  tasks: Task[]
  taskCounts: Record<string, { total: number; completed: number }>
  selectedItemId: string | null
  onSelectProject: (projectId: string) => void
  onSelectTask: (taskId: string) => void
  onAddProject: () => void
}

interface ProjectTreeNodeProps {
  project: Project
  taskCount: { total: number; completed: number }
  tasks: Task[]
  selectedItemId: string | null
  onSelectProject: (id: string) => void
  onSelectTask: (id: string) => void
}

function ProjectTreeNode({ project, taskCount, tasks, selectedItemId, onSelectProject, onSelectTask }: ProjectTreeNodeProps) {
  const [expanded, setExpanded] = useState(true)

  const projectTasks = tasks
    .filter(t => t.projectId === project.id && !t.parentId)
    .sort((a, b) => a.title.localeCompare(b.title))

  const getChildren = (parentId: string): Task[] =>
    tasks.filter(t => t.parentId === parentId).sort((a, b) => a.title.localeCompare(b.title))

  const TaskNode = ({ task, depth = 0 }: { task: Task; depth: number }) => {
    const [taskExpanded, setTaskExpanded] = useState(false)
    const children = getChildren(task.id)
    const hasChildren = children.length > 0

    return (
      <div>
        <button
          type="button"
          onClick={() => onSelectTask(task.id)}
          className={`flex items-center gap-1.5 w-full text-left px-2 py-1.5 rounded-md text-sm hover:bg-muted/50 transition-colors ${
            selectedItemId === task.id ? "bg-primary/10 text-primary font-medium" : "text-ink"
          }`}
          style={{ paddingLeft: `${12 + depth * 16}px` }}
        >
          {hasChildren ? (
            <span
              className="size-3 flex items-center justify-center text-muted-foreground shrink-0"
              onClick={(e) => { e.stopPropagation(); setTaskExpanded(!taskExpanded) }}
            >
              <span className={`text-xs transition-transform ${taskExpanded ? "rotate-90" : ""}`}>▸</span>
            </span>
          ) : (
            <span className="size-3 shrink-0" />
          )}
          <StatusBadge status={task.status as "draft" | "active" | "in_progress" | "on_hold" | "completed" | "archived"} size="sm" />
          <span className="truncate flex-1">{task.title}</span>
        </button>
        {hasChildren && taskExpanded && children.map(child => (
          <TaskNode key={child.id} task={child} depth={depth + 1} />
        ))}
      </div>
    )
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => { setExpanded(!expanded); onSelectProject(project.id) }}
        className={`flex items-center gap-1.5 w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
          selectedItemId === project.id ? "bg-primary/10 text-primary font-medium" : "hover:bg-muted/50 text-ink"
        }`}
      >
        <span className={`text-xs transition-transform shrink-0 ${expanded ? "rotate-90" : ""}`}>▸</span>
        <StatusBadge status={project.status} size="sm" />
        <span className="truncate flex-1 font-medium">{project.name}</span>
        <span className="text-xs text-muted-foreground shrink-0">{taskCount.completed}/{taskCount.total}</span>
      </button>
      {expanded && projectTasks.map(task => (
        <TaskNode key={task.id} task={task} depth={0} />
      ))}
    </div>
  )
}

export function ProjectTree({ projects, tasks, taskCounts, selectedItemId, onSelectProject, onSelectTask, onAddProject }: ProjectTreeProps) {
  const independentTasks = tasks.filter(t => !t.projectId)

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-3 border-b border-hairline">
        <h2 className="text-sm font-semibold">项目/任务</h2>
        <Button size="sm" variant="outline" onClick={onAddProject}>
          + 新建项目
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto py-2 flex flex-col gap-1">
        {projects.length === 0 && independentTasks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <p className="text-sm">暂无项目</p>
            <p className="text-xs mt-1">点击&ldquo;新建项目&rdquo;开始</p>
          </div>
        ) : (
          <>
            {projects.map(p => (
              <ProjectTreeNode
                key={p.id}
                project={p}
                taskCount={taskCounts[p.id] ?? { total: 0, completed: 0 }}
                tasks={tasks}
                selectedItemId={selectedItemId}
                onSelectProject={onSelectProject}
                onSelectTask={onSelectTask}
              />
            ))}

            {independentTasks.length > 0 && (
              <div className="mt-4">
                <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  独立任务
                </div>
                {independentTasks.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onSelectTask(t.id)}
                    className={`flex items-center gap-1.5 w-full text-left px-3 py-1.5 rounded-md text-sm hover:bg-muted/50 transition-colors ${
                      selectedItemId === t.id ? "bg-primary/10 text-primary font-medium" : "text-ink"
                    }`}
                  >
                    <StatusBadge status={t.status as "draft" | "active" | "in_progress" | "on_hold" | "completed" | "archived"} size="sm" />
                    <span className="truncate flex-1">{t.title}</span>
                    {t.priority && (
                      <span className="text-xs text-muted-foreground shrink-0">{t.priority}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
