import type { Task, Project } from '../../usom/types/objects'

export interface ResolvedTime {
  earliestTime?: string
  latestStartTime?: string
  defaultTime?: string
  defaultDuration?: number
}

export function resolveTaskTime(
  task: Task,
  parentTask?: Task | null,
  project?: Project | null,
): ResolvedTime {
  const earliestTime = task.earliestTime
    ?? (parentTask?.earliestTime || undefined)
    ?? project?.defaultEarliestTime

  const latestStartTime = task.latestStartTime
    ?? (parentTask?.latestStartTime || undefined)
    ?? project?.defaultLatestStartTime

  const defaultTime = task.defaultTime
    ?? (parentTask?.defaultTime || undefined)

  const defaultDuration = task.defaultDuration
    ?? parentTask?.defaultDuration
    ?? project?.defaultDuration

  return {
    earliestTime: earliestTime || undefined,
    latestStartTime: latestStartTime || undefined,
    defaultTime: defaultTime || undefined,
    defaultDuration,
  }
}
