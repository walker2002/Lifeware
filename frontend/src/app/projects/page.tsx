import { ProjectRepository } from "@/lib/db/repositories/project.repository"
import { TaskRepository } from "@/lib/db/repositories/task.repository"
import { TaskTemplateRepository } from "@/lib/db/repositories/task-template.repository"
import { ProjectsClient } from "./projects-client"

const MVP_USER_ID = "00000000-0000-0000-0000-000000000001"
const userId = MVP_USER_ID // TODO: get from session

export const dynamic = "force-dynamic"

export default async function ProjectsPage() {
  const projectRepo = new ProjectRepository()
  const taskRepo = new TaskRepository()
  const templateRepo = new TaskTemplateRepository()

  const [projects, allTasks, independentTasks, templates] = await Promise.all([
    projectRepo.findByUserId(userId),
    taskRepo.findAll(userId),
    taskRepo.findIndependent(userId),
    templateRepo.findProjectTemplates(userId),
  ])

  // 按项目分组统计任务数量
  const taskCounts: Record<string, { total: number; completed: number }> = {}
  for (const t of allTasks) {
    if (!t.projectId) continue
    const c = taskCounts[t.projectId] ?? { total: 0, completed: 0 }
    c.total++
    if (t.status === "completed") c.completed++
    taskCounts[t.projectId] = c
  }

  return (
    <ProjectsClient
      projects={projects}
      taskCounts={taskCounts}
      independentTasks={independentTasks}
      allTasks={allTasks}
      templates={templates}
    />
  )
}
