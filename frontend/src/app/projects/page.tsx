"use client"

import { useEffect, useState, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ProjectCard } from "@/components/projects/project-card"
import { ProjectForm, type ProjectFormData } from "@/components/projects/project-form"
import { TaskForm, type TaskFormData } from "@/components/projects/task-form"
import { ProjectRepository } from "@/lib/db/repositories/project.repository"
import { TaskRepository } from "@/lib/db/repositories/task.repository"
import type { Project } from "@/usom/types/objects"
import type { Priority, EnergyLevel } from "@/usom/types/primitives"

export default function ProjectsPage() {
  const router = useRouter()
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [showProjectForm, setShowProjectForm] = useState(false)
  const [showTaskForm, setShowTaskForm] = useState(false)

  const projectRepo = new ProjectRepository()
  const taskRepo = new TaskRepository()

  const loadProjects = useCallback(async () => {
    try {
      // TODO: get userId from session
      const userId = "current-user"
      const list = await projectRepo.findByUserId(userId)
      setProjects(list)
    } catch (e) {
      // silently fail for now
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadProjects() }, [loadProjects])

  const handleCreateProject = async (data: ProjectFormData) => {
    // TODO: get userId from session
    await projectRepo.create({
      ...data,
      priority: data.priority as Priority | undefined,
    }, "current-user")
    setShowProjectForm(false)
    loadProjects()
  }

  const handleCreateTask = async (data: TaskFormData) => {
    // TODO: get userId from session
    await taskRepo.bulkCreate([{
      ...data,
      priority: data.priority as Priority,
      energyRequired: data.energyRequired as EnergyLevel,
    }], "current-user")
    setShowTaskForm(false)
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
          <Button variant="outline" size="sm" onClick={() => setShowTaskForm(true)}>
            + 新建任务
          </Button>
          <Button size="sm" onClick={() => setShowProjectForm(true)}>
            + 新建项目
          </Button>
        </div>
      </div>

      {/* 项目列表 */}
      {projects.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
          <p className="text-sm">暂无项目</p>
          <p className="text-xs mt-1">点击"新建项目"开始</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              onClick={() => router.push(`/projects/${p.id}`)}
            />
          ))}
        </div>
      )}

      {/* 新建项目对话框 */}
      <Dialog open={showProjectForm} onOpenChange={setShowProjectForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建项目</DialogTitle>
          </DialogHeader>
          <ProjectForm
            onSave={handleCreateProject}
            onCancel={() => setShowProjectForm(false)}
          />
        </DialogContent>
      </Dialog>

      {/* 新建任务对话框 */}
      <Dialog open={showTaskForm} onOpenChange={setShowTaskForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建独立任务</DialogTitle>
          </DialogHeader>
          <TaskForm
            onSave={handleCreateTask}
            onCancel={() => setShowTaskForm(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
