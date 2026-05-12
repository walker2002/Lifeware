"use server"

import { revalidatePath } from "next/cache"
import { ProjectRepository } from "@/lib/db/repositories/project.repository"
import { TaskRepository } from "@/lib/db/repositories/task.repository"
import { TaskTemplateRepository } from "@/lib/db/repositories/task-template.repository"
import type { Priority, EnergyLevel, ProjectStatus, TaskStatus } from "@/usom/types/primitives"
import type { ImportPreview } from "@/lib/task-import/task-extractor"

const userId = "current-user" // TODO: get from session

// ─── Project ────────────────────────────────────────────────

export async function createProject(data: {
  name: string; description?: string; priority?: string
  defaultEarliestTime?: string; defaultLatestStartTime?: string
  defaultDuration?: number; startDate?: string; endDate?: string; color?: string
}) {
  const repo = new ProjectRepository()
  const project = await repo.create({
    ...data,
    priority: data.priority as Priority | undefined,
  }, userId)
  revalidatePath("/projects")
  return project
}

export async function updateProjectStatus(projectId: string, status: ProjectStatus) {
  const repo = new ProjectRepository()
  await repo.updateStatus(projectId, status, userId)
  revalidatePath("/projects")
  revalidatePath(`/projects/${projectId}`)
}

export async function updateProject(projectId: string, data: {
  name?: string; description?: string; priority?: string
  defaultEarliestTime?: string; defaultLatestStartTime?: string
  defaultDuration?: number; startDate?: string; endDate?: string; color?: string
}) {
  const repo = new ProjectRepository()
  await repo.update(projectId, {
    ...data,
    priority: data.priority as Priority | undefined,
  }, userId)
  revalidatePath("/projects")
  revalidatePath(`/projects/${projectId}`)
}

export async function saveProjectAsTemplate(projectId: string) {
  const repo = new ProjectRepository()
  await repo.saveAsTemplate(projectId, userId)
  revalidatePath("/projects")
}

// ─── Task ───────────────────────────────────────────────────

export async function createTask(data: {
  title: string; description?: string; priority: string; energyRequired: string
  estimatedDuration: number; earliestTime?: string; latestStartTime?: string
  defaultTime?: string; defaultDuration?: number
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
    earliestTime: data.earliestTime,
    latestStartTime: data.latestStartTime,
    defaultTime: data.defaultTime,
    defaultDuration: data.defaultDuration,
    frequencyType: data.frequencyType as "once" | "daily" | "weekly" | "custom" | undefined,
    daysOfWeek: data.daysOfWeek,
    startDate: data.startDate ?? undefined,
    endDate: data.endDate ?? undefined,
    projectId: data.projectId,
    parentId: data.parentId,
  }], userId)
  revalidatePath("/projects")
  if (data.projectId) revalidatePath(`/projects/${data.projectId}`)
  return tasks[0]
}

export async function updateTaskStatus(taskId: string, status: TaskStatus) {
  const repo = new TaskRepository()
  await repo.updateStatus(taskId, status, userId)
  revalidatePath("/projects")
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
    defaultEarliestTime: preview.project.defaultEarliestTime,
    defaultLatestStartTime: preview.project.defaultLatestStartTime,
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
}

// ─── Template ───────────────────────────────────────────────

export async function applyTemplate(templateId: string) {
  const repo = new TaskTemplateRepository()
  await repo.createFromTemplate(templateId, {}, userId)
  revalidatePath("/projects")
}
