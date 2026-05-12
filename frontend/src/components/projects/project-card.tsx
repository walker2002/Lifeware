"use client"

import { Card, CardContent } from "@/components/ui/card"
import { StatusBadge } from "./status-badge"
import type { Project } from "@/usom/types/objects"

const PRIORITY_LABELS: Record<string, string> = {
  critical: "紧急",
  high: "高优先级",
  medium: "中优先级",
  low: "低优先级",
}

interface ProjectCardProps {
  project: Project
  taskCount?: number
  completedTaskCount?: number
  onClick: () => void
}

export function ProjectCard({ project, taskCount = 0, completedTaskCount = 0, onClick }: ProjectCardProps) {
  const progress = taskCount > 0 ? Math.round((completedTaskCount / taskCount) * 100) : 0

  return (
    <Card
      className="cursor-pointer transition-shadow hover:shadow-md"
      onClick={onClick}
      style={project.color ? { borderLeftColor: project.color, borderLeftWidth: 4 } : undefined}
    >
      <CardContent className="p-4 flex flex-col gap-3">
        <div className="flex items-start justify-between gap-2">
          <h3 className="font-medium text-sm leading-snug line-clamp-2">{project.name}</h3>
          <StatusBadge status={project.status} size="sm" />
        </div>

        {project.description && (
          <p className="text-xs text-muted-foreground line-clamp-2">{project.description}</p>
        )}

        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {project.priority && (
            <span>{PRIORITY_LABELS[project.priority] ?? project.priority}</span>
          )}
          {project.startDate && (
            <span>
              {project.startDate}
              {project.endDate && ` → ${project.endDate}`}
            </span>
          )}
        </div>

        {/* 进度条 */}
        {taskCount > 0 && (
          <div className="flex items-center gap-2">
            <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-xs text-muted-foreground shrink-0">
              {completedTaskCount}/{taskCount}
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
