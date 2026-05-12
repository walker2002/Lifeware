"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { ProjectCard } from "@/components/projects/project-card"
import { ProjectForm, type ProjectFormData } from "@/components/projects/project-form"
import { TaskForm, type TaskFormData } from "@/components/projects/task-form"
import { TaskImportDialog } from "@/components/projects/task-import-dialog"
import { TemplateDialog } from "@/components/projects/template-dialog"
import { StatusBadge } from "@/components/projects/status-badge"
import { ProjectRepository } from "@/lib/db/repositories/project.repository"
import { TaskRepository } from "@/lib/db/repositories/task.repository"
import { TaskTemplateRepository } from "@/lib/db/repositories/task-template.repository"
import type { ImportPreview } from "@/lib/task-import/task-extractor"
import type { Project, Task } from "@/usom/types/objects"
import type { Priority, EnergyLevel } from "@/usom/types/primitives"

const STATUS_FILTERS = [
  { key: 'all', label: '全部' },
  { key: 'active', label: '进行中' },
  { key: 'planning', label: '规划中' },
  { key: 'paused', label: '已暂停' },
  { key: 'completed', label: '已完成' },
]

export default function ProjectsPage() {
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])
  const [independentTasks, setIndependentTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [statusFilter, setStatusFilter] = useState('all')
  const [showProjectForm, setShowProjectForm] = useState(false)
  const [showTaskForm, setShowTaskForm] = useState(false)
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [showTemplateDialog, setShowTemplateDialog] = useState(false)

  const projectRepo = new ProjectRepository()
  const taskRepo = new TaskRepository()
  const templateRepo = new TaskTemplateRepository()

  const userId = "current-user" // TODO: get from session

  const loadData = useCallback(async () => {
    try {
      const [list, indTasks] = await Promise.all([
        projectRepo.findByUserId(userId),
        taskRepo.findIndependent(userId),
      ])
      setProjects(list)
      setIndependentTasks(indTasks)
    } catch (e) {
      // silently fail for now
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadData() }, [loadData])

  const filteredProjects = statusFilter === 'all'
    ? projects
    : projects.filter(p => p.status === statusFilter)

  const handleCreateProject = async (data: ProjectFormData) => {
    await projectRepo.create({
      ...data,
      priority: data.priority as Priority | undefined,
    }, userId)
    setShowProjectForm(false)
    loadData()
  }

  const handleCreateTask = async (data: TaskFormData) => {
    await taskRepo.bulkCreate([{
      ...data,
      priority: data.priority as Priority,
      energyRequired: data.energyRequired as EnergyLevel,
    }], userId)
    setShowTaskForm(false)
    loadData()
  }

  const handleImport = async (preview: ImportPreview) => {
    if (preview.project) {
      await projectRepo.create({
        name: preview.project.name,
        description: preview.project.description,
        priority: preview.project.priority as Priority | undefined,
        defaultEarliestTime: preview.project.defaultEarliestTime,
        defaultLatestStartTime: preview.project.defaultLatestStartTime,
      }, userId)
      // 简单导入：所有任务作为顶级任务创建
      if (preview.tasks.length > 0) {
        await taskRepo.bulkCreate(
          preview.tasks.map(t => ({
            title: t.title,
            priority: (t.priority ?? 'medium') as Priority,
            energyRequired: (t.energyRequired ?? 'medium') as EnergyLevel,
            estimatedDuration: t.estimatedDuration ?? 60,
          })),
          userId
        )
      }
    }
    loadData()
  }

  const handleApplyTemplate = async (templateId: string) => {
    await templateRepo.createFromTemplate(templateId, {}, userId)
    loadData()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh] text-muted-foreground">
        加载中...
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-6 max-w-5xl mx-auto">
      {/* 操作栏 */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">项目目录</h1>
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={() => setShowImportDialog(true)}>
            导入模板
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setShowTemplateDialog(true)}>
            从模板创建
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowTaskForm(true)}>
            + 新建任务
          </Button>
          <Button size="sm" onClick={() => setShowProjectForm(true)}>
            + 新建项目
          </Button>
        </div>
      </div>

      {/* 状态筛选 */}
      <div className="flex gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setStatusFilter(f.key)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              statusFilter === f.key
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {f.label}
            {f.key !== 'all' && (
              <span className="ml-1 opacity-70">{projects.filter(p => p.status === f.key).length}</span>
            )}
          </button>
        ))}
      </div>

      {/* 项目列表 */}
      {filteredProjects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <p className="text-sm">暂无项目</p>
          <p className="text-xs mt-1">点击"新建项目"开始</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProjects.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              onClick={() => router.push(`/projects/${p.id}`)}
            />
          ))}
        </div>
      )}

      {/* 独立任务区域 */}
      {independentTasks.length > 0 && (
        <div className="flex flex-col gap-3 mt-4">
          <h2 className="text-sm font-medium text-muted-foreground">独立任务（未关联项目）</h2>
          <div className="flex flex-col gap-1">
            {independentTasks.map((t) => (
              <div key={t.id} className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-muted/50">
                <StatusBadge status={t.status as "draft" | "active" | "in_progress" | "on_hold" | "completed" | "archived"} size="sm" />
                <span className="flex-1 text-sm truncate">{t.title}</span>
                {t.priority && (
                  <Badge variant="secondary" className="text-xs">{t.priority}</Badge>
                )}
                {t.estimatedDuration > 0 && (
                  <span className="text-xs text-muted-foreground">{t.estimatedDuration}分钟</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 对话框 */}
      <Dialog open={showProjectForm} onOpenChange={setShowProjectForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>新建项目</DialogTitle></DialogHeader>
          <ProjectForm onSave={handleCreateProject} onCancel={() => setShowProjectForm(false)} />
        </DialogContent>
      </Dialog>

      <Dialog open={showTaskForm} onOpenChange={setShowTaskForm}>
        <DialogContent>
          <DialogHeader><DialogTitle>新建独立任务</DialogTitle></DialogHeader>
          <TaskForm onSave={handleCreateTask} onCancel={() => setShowTaskForm(false)} />
        </DialogContent>
      </Dialog>

      <TaskImportDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        onImport={handleImport}
      />

      <TemplateDialog
        open={showTemplateDialog}
        onOpenChange={setShowTemplateDialog}
        onApplyTemplate={handleApplyTemplate}
      />
    </div>
  )
}
