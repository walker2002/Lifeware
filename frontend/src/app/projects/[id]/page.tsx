import { ProjectRepository } from "@/lib/db/repositories/project.repository"
import { TaskRepository } from "@/lib/db/repositories/task.repository"
import { DetailClient } from "./detail-client"

const MVP_USER_ID = "00000000-0000-0000-0000-000000000001"
const userId = MVP_USER_ID // TODO: get from session

export const dynamic = "force-dynamic"

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id: projectId } = await params

  const projectRepo = new ProjectRepository()
  const taskRepo = new TaskRepository()

  const project = await projectRepo.findById(projectId, userId)
  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
        <p className="text-muted-foreground">项目不存在</p>
        <a href="/projects" className="text-sm text-primary hover:underline">
          返回项目目录
        </a>
      </div>
    )
  }

  const tasks = await taskRepo.findByProject(projectId, userId)

  return <DetailClient project={project} tasks={tasks} />
}
