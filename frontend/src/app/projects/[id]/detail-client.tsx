"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { ProjectDetail } from "@/components/projects/project-detail"
import { ProjectForm, type ProjectFormData } from "@/components/projects/project-form"
import { TaskForm, type TaskFormData } from "@/components/projects/task-form"
import {
  createTask, updateTaskStatus, updateProjectStatus,
  updateProject, saveProjectAsTemplate,
} from "../actions"
import type { Project, Task } from "@/usom/types/objects"
import type { TaskStatus, ProjectStatus } from "@/usom/types/primitives"

interface DetailClientProps {
  project: Project
  tasks: Task[]
}

export function DetailClient({ project, tasks }: DetailClientProps) {
  const router = useRouter()
  const projectId = project.id

  const [showEditProject, setShowEditProject] = useState(false)
  const [showTaskForm, setShowTaskForm] = useState(false)
  const [showSubTaskForm, setShowSubTaskForm] = useState(false)
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const [parentTaskId, setParentTaskId] = useState<string | null>(null)

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
    await createTask({
      ...data,
      projectId,
      parentId: parentTaskId ?? undefined,
    })
    setShowTaskForm(false)
    setShowSubTaskForm(false)
  }

  const handleStatusChange = async (taskId: string, newStatus: TaskStatus) => {
    await updateTaskStatus(taskId, newStatus)
  }

  const handleProjectStatusChange = async (newStatus: ProjectStatus) => {
    await updateProjectStatus(projectId, newStatus)
  }

  const handleEditProject = async (data: ProjectFormData) => {
    await updateProject(projectId, {
      ...data,
    })
    setShowEditProject(false)
  }

  const handleSaveAsTemplate = async () => {
    await saveProjectAsTemplate(projectId)
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
    <>
      {/* 返回按钮 */}
      <div className="px-6 pt-4">
        <Button variant="ghost" size="sm" onClick={() => router.push("/projects")}>
          ← 返回项目目录
        </Button>
      </div>

      <ProjectDetail
        project={project}
        tasks={tasks}
        onAddTask={handleAddTask}
        onEditTask={handleEditTask}
        onEditProject={() => setShowEditProject(true)}
        onSaveAsTemplate={handleSaveAsTemplate}
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
    </>
  )
}
