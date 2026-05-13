"use server"

import { revalidatePath } from "next/cache"
import { ProjectRepository } from "@/lib/db/repositories/project.repository"
import { TaskRepository } from "@/lib/db/repositories/task.repository"
import { TaskTemplateRepository } from "@/lib/db/repositories/task-template.repository"
import type { Priority, EnergyLevel, ProjectStatus, TaskStatus } from "@/usom/types/primitives"
import type { ImportPreview } from "@/lib/task-import/task-extractor"
import type { Project, Task, ProjectTemplate } from "@/usom/types/objects"

const MVP_USER_ID = "00000000-0000-0000-0000-000000000001"
const userId = MVP_USER_ID // TODO: get from session

// ─── Project ────────────────────────────────────────────────

export async function createProject(data: {
  name: string; description?: string; priority?: string
  startDate?: string; endDate?: string; color?: string
}) {
  const repo = new ProjectRepository()
  const project = await repo.create({
    ...data,
    priority: data.priority as Priority | undefined,
  }, userId)
  revalidatePath("/projects")
  revalidatePath("/")
  return project
}

export async function updateProjectStatus(projectId: string, status: ProjectStatus) {
  const repo = new ProjectRepository()
  await repo.updateStatus(projectId, status, userId)
  revalidatePath("/projects")
  revalidatePath(`/projects/${projectId}`)
  revalidatePath("/")
}

export async function updateProject(projectId: string, data: {
  name?: string; description?: string; priority?: string
  startDate?: string; endDate?: string; color?: string
}) {
  const repo = new ProjectRepository()
  await repo.update(projectId, {
    ...data,
    priority: data.priority as Priority | undefined,
  }, userId)
  revalidatePath("/projects")
  revalidatePath(`/projects/${projectId}`)
  revalidatePath("/")
}

export async function saveProjectAsTemplate(projectId: string) {
  const repo = new ProjectRepository()
  await repo.saveAsTemplate(projectId, userId)
  revalidatePath("/projects")
  revalidatePath("/")
}

// ─── Task ───────────────────────────────────────────────────

export async function createTask(data: {
  title: string; description?: string; priority: string; energyRequired: string
  estimatedDuration: number
  frequencyType?: string; daysOfWeek?: number[]
  startDate?: string; endDate?: string
  projectId?: string; parentId?: string
}) {
  const repo = new TaskRepository()
  const tasks = await repo.bulkCreate([{
    title: data.title,
    description: data.description,
    priority: data.priority as Priority,
    energyRequired: data.energyRequired as EnergyLevel,
    estimatedDuration: data.estimatedDuration,
    frequencyType: data.frequencyType as "once" | "daily" | "weekly" | "custom" | undefined,
    daysOfWeek: data.daysOfWeek,
    startDate: data.startDate ?? undefined,
    endDate: data.endDate ?? undefined,
    projectId: data.projectId,
    parentId: data.parentId,
  }], userId)
  revalidatePath("/projects")
  if (data.projectId) revalidatePath(`/projects/${data.projectId}`)
  revalidatePath("/")
  return tasks[0]
}

export async function updateTaskStatus(taskId: string, status: TaskStatus) {
  const repo = new TaskRepository()
  await repo.updateStatus(taskId, status, userId)
  revalidatePath("/projects")
  revalidatePath("/")
}

// ─── Import ─────────────────────────────────────────────────

export async function importTasks(preview: ImportPreview) {
  if (!preview.project) return

  const projectRepo = new ProjectRepository()
  const taskRepo = new TaskRepository()

  const project = await projectRepo.create({
    name: preview.project.name,
    description: preview.project.description,
    priority: preview.project.priority as Priority | undefined,
  }, userId)

  if (preview.tasks.length > 0) {
    const idMap = new Map<string, string>()

    for (const t of preview.tasks.filter(t => t.depth === 0)) {
      const created = await taskRepo.bulkCreate([{
        title: t.title,
        priority: (t.priority ?? "medium") as Priority,
        energyRequired: (t.energyRequired ?? "medium") as EnergyLevel,
        estimatedDuration: t.estimatedDuration ?? 60,
        projectId: project.id,
      }], userId)
      if (created[0]) idMap.set(t.tempId, created[0].id)
    }

    const childTasks = preview.tasks.filter(t => t.depth > 0 && t.parentTempId)
    if (childTasks.length > 0) {
      await taskRepo.bulkCreate(
        childTasks.map(t => ({
          title: t.title,
          priority: (t.priority ?? "medium") as Priority,
          energyRequired: (t.energyRequired ?? "medium") as EnergyLevel,
          estimatedDuration: t.estimatedDuration ?? 60,
          projectId: project.id,
          parentId: idMap.get(t.parentTempId!) ?? undefined,
        })),
        userId
      )
    }
  }

  revalidatePath("/projects")
  revalidatePath("/")
}

// ─── Template ───────────────────────────────────────────────

export async function applyTemplate(templateId: string) {
  const repo = new TaskTemplateRepository()
  await repo.createFromTemplate(templateId, {}, userId)
  revalidatePath("/projects")
  revalidatePath("/")
}

// ─── Data Loader ────────────────────────────────────────────

export interface ProjectsViewData {
  projects: Project[]
  allTasks: Task[]
  taskCounts: Record<string, { total: number; completed: number }>
  templates: ProjectTemplate[]
}

export async function loadProjectsData(): Promise<ProjectsViewData> {
  const projectRepo = new ProjectRepository()
  const taskRepo = new TaskRepository()
  const templateRepo = new TaskTemplateRepository()

  const [projects, allTasks, templates] = await Promise.all([
    projectRepo.findByUserId(userId),
    taskRepo.findAll(userId),
    templateRepo.findProjectTemplates(userId),
  ])

  const taskCounts: Record<string, { total: number; completed: number }> = {}
  for (const t of allTasks) {
    if (!t.projectId) continue
    const c = taskCounts[t.projectId] ?? { total: 0, completed: 0 }
    c.total++
    if (t.status === "completed") c.completed++
    taskCounts[t.projectId] = c
  }

  return { projects, allTasks, taskCounts, templates }
}
