"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { StatusBadge } from "./status-badge"
import { ProjectDetail } from "./project-detail"
import { ProjectForm, type ProjectFormData } from "./project-form"
import { TaskForm, type TaskFormData } from "./task-form"
import type { Project, Task } from "@/usom/types/objects"
import type { TaskStatus, ProjectStatus } from "@/usom/types/primitives"

interface DetailPanelProps {
  selectedProject: Project | null
  selectedTask: Task | null
  allTasks: Task[]
  onCreateTask: (data: TaskFormData & { projectId?: string; parentId?: string }) => Promise<void>
  onCreateProject: (data: ProjectFormData) => Promise<void>
  onUpdateProject: (projectId: string, data: ProjectFormData) => Promise<void>
  onUpdateTaskStatus: (taskId: string, status: TaskStatus) => Promise<void>
  onUpdateProjectStatus: (projectId: string, status: ProjectStatus) => Promise<void>
  onSaveAsTemplate: (projectId: string) => Promise<void>
}

export function DetailPanel({
  selectedProject, selectedTask, allTasks,
  onCreateTask, onCreateProject, onUpdateProject,
  onUpdateTaskStatus, onUpdateProjectStatus, onSaveAsTemplate,
}: DetailPanelProps) {
  const [showNewProject, setShowNewProject] = useState(false)
  const [showEditProject, setShowEditProject] = useState(false)
  const [showTaskForm, setShowTaskForm] = useState(false)
  const [parentTaskId, setParentTaskId] = useState<string | null>(null)
  const [editingTask, setEditingTask] = useState<Task | null>(null)

  // 空状态
  if (!selectedProject && !selectedTask) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-4">
        <div className="text-center">
          <p className="text-lg font-medium mb-1">项目/任务管理</p>
          <p className="text-sm">从左侧选择项目或任务查看详情</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setShowNewProject(true)}>
            + 新建项目
          </Button>
        </div>

        <Dialog open={showNewProject} onOpenChange={setShowNewProject}>
          <DialogContent>
            <DialogHeader><DialogTitle>新建项目</DialogTitle></DialogHeader>
            <ProjectForm onSave={async (data) => { await onCreateProject(data); setShowNewProject(false) }} onCancel={() => setShowNewProject(false)} />
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  // 项目详情
  if (selectedProject) {
    const tasks = allTasks.filter(t => t.projectId === selectedProject.id)

    const handleAddTask = (parentId?: string) => {
      if (parentId) {
        setParentTaskId(parentId)
      } else {
        setParentTaskId(null)
        setEditingTask(null)
      }
      setShowTaskForm(true)
    }

    const handleEditTask = (taskId: string) => {
      const task = tasks.find(t => t.id === taskId)
      if (task) {
        setEditingTask(task)
        setParentTaskId(task.parentId ?? null)
        setShowTaskForm(true)
      }
    }

    const handleSaveTask = async (data: TaskFormData) => {
      await onCreateTask({
        ...data,
        projectId: selectedProject.id,
        parentId: parentTaskId ?? undefined,
      })
      setShowTaskForm(false)
      setEditingTask(null)
      setParentTaskId(null)
    }

    const handleEditProject = async (data: ProjectFormData) => {
      await onUpdateProject(selectedProject.id, data)
      setShowEditProject(false)
    }

    return (
      <div className="p-6 overflow-y-auto h-full">
        <ProjectDetail
          project={selectedProject}
          tasks={tasks}
          onAddTask={handleAddTask}
          onEditTask={handleEditTask}
          onEditProject={() => setShowEditProject(true)}
          onSaveAsTemplate={() => onSaveAsTemplate(selectedProject.id)}
          onStatusChange={onUpdateTaskStatus}
          onProjectStatusChange={(status) => onUpdateProjectStatus(selectedProject.id, status)}
        />

        <Dialog open={showEditProject} onOpenChange={setShowEditProject}>
          <DialogContent>
            <DialogHeader><DialogTitle>编辑项目</DialogTitle></DialogHeader>
            <ProjectForm project={selectedProject} onSave={handleEditProject} onCancel={() => setShowEditProject(false)} />
          </DialogContent>
        </Dialog>

        <Dialog open={showTaskForm} onOpenChange={setShowTaskForm}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingTask ? "编辑任务" : parentTaskId ? "添加子任务" : "新建任务"}
              </DialogTitle>
            </DialogHeader>
            <TaskForm
              parentId={parentTaskId ?? undefined}
              task={editingTask ?? undefined}
              onSave={handleSaveTask}
              onCancel={() => { setShowTaskForm(false); setEditingTask(null); setParentTaskId(null) }}
            />
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  // 任务详情 (独立任务)
  if (selectedTask && !selectedProject) {
    const handleSaveTask = async (data: TaskFormData) => {
      await onCreateTask(data)
      setShowTaskForm(false)
      setEditingTask(null)
    }

    return (
      <div className="p-6 overflow-y-auto h-full">
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-lg font-semibold">{selectedTask.title}</h2>
              <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                <StatusBadge status={selectedTask.status as "draft" | "active" | "in_progress" | "on_hold" | "completed" | "archived"} />
                {selectedTask.priority && <span>{selectedTask.priority}</span>}
                {selectedTask.estimatedDuration > 0 && <span>{selectedTask.estimatedDuration}分钟</span>}
              </div>
              {selectedTask.description && <p className="text-sm text-muted-foreground mt-2">{selectedTask.description}</p>}
            </div>
            <Button variant="outline" size="sm" onClick={() => { setEditingTask(selectedTask); setShowTaskForm(true) }}>
              编辑任务
            </Button>
          </div>
        </div>

        <Dialog open={showTaskForm} onOpenChange={setShowTaskForm}>
          <DialogContent>
            <DialogHeader><DialogTitle>编辑任务</DialogTitle></DialogHeader>
            <TaskForm task={editingTask ?? undefined} onSave={handleSaveTask} onCancel={() => { setShowTaskForm(false); setEditingTask(null) }} />
          </DialogContent>
        </Dialog>
      </div>
    )
  }

  return null
}
