"use server"

import { revalidatePath } from "next/cache"
import { ProjectRepository } from "@/domains/tasks/repository/project"
import { TaskRepository } from "@/domains/tasks/repository/task"
import { TaskTemplateRepository } from "@/domains/tasks/repository/task-template"
import type { Priority, EnergyLevel, ProjectStatus, TaskStatus } from "@/usom/types/primitives"
import type { ImportPreview } from "@/lib/task-import/task-extractor"
import type { Project, Task, ProjectTemplate } from "@/usom/types/objects"
import { createOrchestrator } from "../../nexus/orchestrator"
import { createRuleEngine } from "../../nexus/core/rule-engine"
import { createEventBus } from "../../nexus/infrastructure/event-bus"
import { SystemEventRepository } from "@/lib/db/repositories/system-event.repository"
import { TimeboxRepository } from "@/domains/timebox/repository"
import type { USOM_ID, Timestamp } from "@/usom/types/primitives"

const MVP_USER_ID = "00000000-0000-0000-0000-000000000001"
const userId = MVP_USER_ID

function makeIntent(action: string, fields: Record<string, unknown>) {
  const now = new Date().toISOString() as Timestamp
  return {
    id: crypto.randomUUID() as USOM_ID,
    intentionId: crypto.randomUUID() as USOM_ID,
    targetDomain: "tasks" as const,
    action,
    fields,
    confidence: 1.0,
    resolvedBy: "template_form" as const,
    createdAt: now,
  }
}

async function createTasksOrchestrator() {
  const taskRepo = new TaskRepository()
  const projectRepo = new ProjectRepository()
  const eventRepo = new SystemEventRepository()
  const timeboxRepo = new TimeboxRepository()
  const ruleEngine = createRuleEngine({ timeboxRepo, userId: MVP_USER_ID })

  return createOrchestrator({
    timeboxRepo,
    eventRepo,
    intentEngine: { parse: async () => { throw new Error("not used") } },
    ruleEngine: {
      evaluate: async (intentEval, snapshot) => {
        const result = await ruleEngine.evaluate(intentEval, snapshot)
        return {
          result: result.severity,
          warnings: result.warnings,
          confirmations: result.confirmations,
        }
      },
    },
    taskRepo,
    projectRepo,
  })
}

// ─── Project ────────────────────────────────────────────────

export async function createProject(data: {
  name: string; description?: string; priority?: string
  startDate?: string; endDate?: string; color?: string
}) {
  const orchestrator = await createTasksOrchestrator()
  const intent = makeIntent("createProject", {
    name: data.name,
    description: data.description,
    priority: data.priority,
    startDate: data.startDate,
    endDate: data.endDate,
    color: data.color,
  })
  const result = await orchestrator.executeIntent(intent, userId)
  revalidatePath("/projects")
  revalidatePath("/")
  if (!result.success) throw new Error(result.error)

  const repo = new ProjectRepository()
  const projects = await repo.findByUserId(userId)
  const created = projects.sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )[0]
  return created
}

export async function updateProjectStatus(projectId: string, status: ProjectStatus) {
  const actionMap: Record<string, string> = {
    active: "activateProject",
    paused: "pauseProject",
    completed: "completeProject",
    archived: "archiveProject",
  }
  const orchestrator = await createTasksOrchestrator()
  const intent = makeIntent(actionMap[status], { projectId })
  const result = await orchestrator.executeIntent(intent, userId)
  if (!result.success) throw new Error(result.error)
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
  const orchestrator = await createTasksOrchestrator()
  const intent = makeIntent("createTask", {
    title: data.title,
    description: data.description,
    priority: data.priority,
    energyRequired: data.energyRequired,
    estimatedDuration: data.estimatedDuration,
    frequencyType: data.frequencyType,
    daysOfWeek: data.daysOfWeek,
    startDate: data.startDate,
    endDate: data.endDate,
    projectId: data.projectId,
    parentId: data.parentId,
  })
  const result = await orchestrator.executeIntent(intent, userId)
  if (!result.success) throw new Error(result.error)

  // 获取最新创建的任务
  const taskRepo = new TaskRepository()
  const tasks = await taskRepo.findByStatus("draft", userId)
  const created = tasks.sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )[0]

  revalidatePath("/projects")
  if (data.projectId) revalidatePath(`/projects/${data.projectId}`)
  revalidatePath("/")
  return created
}

export async function updateTaskStatus(taskId: string, status: TaskStatus) {
  const actionMap: Record<string, string> = {
    active: "activateTask",
    completed: "completeTask",
    archived: "archiveTask",
  }
  const orchestrator = await createTasksOrchestrator()
  const intent = makeIntent(actionMap[status], { taskId })
  const result = await orchestrator.executeIntent(intent, userId)
  if (!result.success) throw new Error(result.error)
  revalidatePath("/projects")
  revalidatePath("/")
}

// ─── Import ─────────────────────────────────────────────────

export async function importTasks(preview: ImportPreview) {
  if (!preview.project) return

  const orchestrator = await createTasksOrchestrator()

  // 创建项目
  const projectIntent = makeIntent("createProject", {
    name: preview.project.name,
    description: preview.project.description,
    priority: preview.project.priority,
  })
  const projectResult = await orchestrator.executeIntent(projectIntent, userId)
  if (!projectResult.success) throw new Error(projectResult.error)

  // 获取刚创建的项目
  const projectRepo = new ProjectRepository()
  const projects = await projectRepo.findByUserId(userId)
  const project = projects.sort((a, b) =>
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )[0]

  if (preview.tasks.length > 0) {
    const idMap = new Map<string, string>()

    // 先创建顶层任务
    for (const t of preview.tasks.filter(t => t.depth === 0)) {
      const taskIntent = makeIntent("createTask", {
        title: t.title,
        priority: t.priority ?? "medium",
        energyRequired: t.energyRequired ?? "medium",
        estimatedDuration: t.estimatedDuration ?? 60,
        projectId: project.id,
      })
      const taskResult = await orchestrator.executeIntent(taskIntent, userId)
      if (!taskResult.success) continue

      // 查找刚创建的任务
      const taskRepo = new TaskRepository()
      const draftTasks = await taskRepo.findByProject(project.id, userId)
      const parentTask = draftTasks.sort((a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )[0]
      if (parentTask) idMap.set(t.tempId, parentTask.id)
    }

    // 再创建子任务
    for (const t of preview.tasks.filter(t => t.depth > 0 && t.parentTempId)) {
      const taskIntent = makeIntent("createTask", {
        title: t.title,
        priority: t.priority ?? "medium",
        energyRequired: t.energyRequired ?? "medium",
        estimatedDuration: t.estimatedDuration ?? 60,
        projectId: project.id,
        parentId: idMap.get(t.parentTempId!) ?? undefined,
      })
      await orchestrator.executeIntent(taskIntent, userId)
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
