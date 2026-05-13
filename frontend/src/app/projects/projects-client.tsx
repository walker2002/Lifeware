"use client"

import { useState } from "react"
import { ProjectTree } from "@/components/projects/project-tree"
import { DetailPanel } from "@/components/projects/detail-panel"
import { TaskImportDialog } from "@/components/projects/task-import-dialog"
import { TemplateDialog } from "@/components/projects/template-dialog"
import {
  createProject, createTask, updateProject, updateTaskStatus,
  updateProjectStatus, saveProjectAsTemplate, importTasks, applyTemplate,
} from "./actions"
import type { Project, Task, ProjectTemplate } from "@/usom/types/objects"
import type { ProjectFormData, TaskFormData } from "@/usom/types/ui-forms"
import type { ImportPreview } from "@/lib/task-import/task-extractor"

interface ProjectsClientProps {
  projects: Project[]
  taskCounts: Record<string, { total: number; completed: number }>
  allTasks: Task[]
  templates: ProjectTemplate[]
}

export function ProjectsClient({
  projects, taskCounts, allTasks, templates,
}: ProjectsClientProps) {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [showImportDialog, setShowImportDialog] = useState(false)
  const [showTemplateDialog, setShowTemplateDialog] = useState(false)

  const selectedProject = selectedProjectId
    ? projects.find(p => p.id === selectedProjectId) ?? null
    : null

  const selectedTask = selectedTaskId
    ? allTasks.find(t => t.id === selectedTaskId) ?? null
    : null

  const handleSelectProject = (id: string) => {
    setSelectedProjectId(id)
    setSelectedTaskId(null)
  }

  const handleSelectTask = (id: string) => {
    setSelectedTaskId(id)
    const task = allTasks.find(t => t.id === id)
    if (task?.projectId) {
      setSelectedProjectId(task.projectId)
    } else {
      setSelectedProjectId(null)
    }
  }

  const handleCreateProject = async (data: ProjectFormData) => {
    const created = await createProject(data as Parameters<typeof createProject>[0])
    if (created?.id) {
      setSelectedProjectId(created.id)
    }
  }

  const handleCreateTask = async (data: TaskFormData & { projectId?: string; parentId?: string }) => {
    await createTask(data as Parameters<typeof createTask>[0])
  }

  const handleUpdateProject = async (projectId: string, data: ProjectFormData) => {
    await updateProject(projectId, data as Parameters<typeof updateProject>[1])
  }

  const handleImport = async (preview: ImportPreview) => {
    await importTasks(preview)
  }

  const handleApplyTemplate = async (templateId: string) => {
    await applyTemplate(templateId)
  }

  return (
    <div className="flex h-full">
      {/* 左侧项目/任务树 */}
      <div className="w-80 shrink-0 border-r border-hairline bg-canvas flex flex-col">
        <ProjectTree
          projects={projects}
          tasks={allTasks}
          taskCounts={taskCounts}
          selectedItemId={selectedTaskId ?? selectedProjectId}
          onSelectProject={handleSelectProject}
          onSelectTask={handleSelectTask}
          onAddProject={() => {
            setSelectedProjectId(null)
            setSelectedTaskId(null)
          }}
        />
        <div className="border-t border-hairline px-3 py-2 flex gap-1">
          <button
            type="button"
            className="flex-1 text-xs px-2 py-1 rounded-md bg-muted hover:bg-muted/80 transition-colors"
            onClick={() => setShowImportDialog(true)}
          >
            导入模板
          </button>
          <button
            type="button"
            className="flex-1 text-xs px-2 py-1 rounded-md bg-muted hover:bg-muted/80 transition-colors"
            onClick={() => setShowTemplateDialog(true)}
          >
            从模板创建
          </button>
        </div>
      </div>

      {/* 右侧详情面板 */}
      <div className="flex-1 min-w-0 bg-canvas">
        <DetailPanel
          selectedProject={selectedProject}
          selectedTask={(!selectedProject) ? selectedTask : null}
          allTasks={allTasks}
          onCreateTask={handleCreateTask}
          onCreateProject={handleCreateProject}
          onUpdateProject={handleUpdateProject}
          onUpdateTaskStatus={updateTaskStatus}
          onUpdateProjectStatus={updateProjectStatus}
          onSaveAsTemplate={saveProjectAsTemplate}
        />
      </div>

      <TaskImportDialog
        open={showImportDialog}
        onOpenChange={setShowImportDialog}
        onImport={handleImport}
      />

      <TemplateDialog
        open={showTemplateDialog}
        onOpenChange={setShowTemplateDialog}
        onApplyTemplate={handleApplyTemplate}
        templates={templates}
      />
    </div>
  )
}
