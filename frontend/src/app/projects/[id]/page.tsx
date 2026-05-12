"use client"

import { useParams, useRouter } from "next/navigation"
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ProjectDetail } from "@/components/projects/project-detail"
import { ProjectForm, type ProjectFormData } from "@/components/projects/project-form"
import { TaskForm, type TaskFormData } from "@/components/projects/task-form"
import { ProjectRepository } from "@/lib/db/repositories/project.repository"
import { TaskRepository } from "@/lib/db/repositories/task.repository"
import type { TaskStatus, ProjectStatus, Priority, EnergyLevel } from "@/usom/types/primitives"

export default function ProjectDetailPage() {
  const params = useParams()
  const router = useRouter()
  const projectId = params.id as string

  const [showEditProject, setShowEditProject] = useState(false)
  const [showTaskForm, setShowTaskForm] = useState(false)
  const [showSubTaskForm, setShowSubTaskForm] = useState(false)
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [parentTaskId, setParentTaskId] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const projectRepo = new ProjectRepository()
  const taskRepo = new TaskRepository()

  // TODO: get userId from session
  const userId = "current-user"

  const handleAddTask = (parentId?: string) => {
    if (parentId) {
      setParentTaskId(parentId)
      setShowSubTaskForm(true)
    } else {
      setParentTaskId(null)
      setShowTaskForm(true)
    }
  }

  const handleEditTask = (taskId: string) => {
    setEditingTaskId(taskId)
    setShowTaskForm(true)
  }

  const handleSaveTask = async (data: TaskFormData) => {
    await taskRepo.bulkCreate([{
      ...data,
      priority: data.priority as Priority,
      energyRequired: data.energyRequired as EnergyLevel,
      projectId,
      parentId: parentTaskId ?? undefined,
    }], userId)
    setShowTaskForm(false)
    setShowSubTaskForm(false)
    setRefreshKey(k => k + 1)
  }

  const handleStatusChange = async (taskId: string, newStatus: TaskStatus) => {
    await taskRepo.updateStatus(taskId, newStatus, userId)
    setRefreshKey(k => k + 1)
  }

  const handleProjectStatusChange = async (newStatus: ProjectStatus) => {
    await projectRepo.updateStatus(projectId, newStatus, userId)
    setRefreshKey(k => k + 1)
  }

  const handleEditProject = async (data: ProjectFormData) => {
    await projectRepo.update(projectId, {
      ...data,
      priority: data.priority as Priority | undefined,
    }, userId)
    setShowEditProject(false)
    setRefreshKey(k => k + 1)
  }

  // Validate projectId is a UUID
  if (!projectId || projectId.length < 32) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
        <p className="text-muted-foreground">无效的项目 ID</p>
        <Button variant="outline" onClick={() => router.push("/projects")}>
          返回项目目录
        </Button>
      </div>
    )
  }

  return (
    <div key={refreshKey}>
      {/* 返回按钮 */}
      <div className="px-6 pt-4">
        <Button variant="ghost" size="sm" onClick={() => router.push("/projects")}>
          ← 返回项目目录
        </Button>
      </div>

      <ProjectDetail
        projectId={projectId}
        onAddTask={handleAddTask}
        onEditTask={handleEditTask}
        onEditProject={() => setShowEditProject(true)}
        onStatusChange={handleStatusChange}
        onProjectStatusChange={handleProjectStatusChange}
      />

      {/* 编辑项目对话框 */}
      <Dialog open={showEditProject} onOpenChange={setShowEditProject}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>编辑项目</DialogTitle>
          </DialogHeader>
          <ProjectForm
            onSave={handleEditProject}
            onCancel={() => setShowEditProject(false)}
          />
        </DialogContent>
      </Dialog>

      {/* 新建任务对话框 */}
      <Dialog open={showTaskForm} onOpenChange={setShowTaskForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{parentTaskId ? "添加子任务" : editingTaskId ? "编辑任务" : "新建任务"}</DialogTitle>
          </DialogHeader>
          <TaskForm
            projectId={projectId}
            parentId={parentTaskId ?? undefined}
            onSave={handleSaveTask}
            onCancel={() => { setShowTaskForm(false); setParentTaskId(null); setEditingTaskId(null) }}
          />
        </DialogContent>
      </Dialog>

      {/* 添加子任务对话框 */}
      <Dialog open={showSubTaskForm} onOpenChange={setShowSubTaskForm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>添加子任务</DialogTitle>
          </DialogHeader>
          <TaskForm
            projectId={projectId}
            parentId={parentTaskId ?? undefined}
            onSave={handleSaveTask}
            onCancel={() => { setShowSubTaskForm(false); setParentTaskId(null) }}
          />
        </DialogContent>
      </Dialog>
    </div>
  )
}
