"use client"

import { useState, useEffect, useCallback } from "react"
import { ProjectsClient } from "@/app/projects/projects-client"
import { loadProjectsData, type ProjectsViewData } from "@/app/projects/actions"

export function ProjectsView() {
  const [data, setData] = useState<ProjectsViewData | null>(null)

  const load = useCallback(async () => {
    const result = await loadProjectsData()
    setData(result)
  }, [])

  useEffect(() => {
    let cancelled = false
    async function fetch() {
      const result = await loadProjectsData()
      if (!cancelled) setData(result)
    }
    fetch()
    return () => { cancelled = true }
  }, [])

  if (!data) {
    return (
      <div className="flex flex-col gap-3 p-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="rounded-lg bg-surface-card p-4 space-y-3">
            <div className="h-5 w-1/3 rounded bg-hairline animate-pulse" />
            <div className="h-3 w-2/3 rounded bg-hairline animate-pulse" />
          </div>
        ))}
      </div>
    )
  }

  return (
    <ProjectsClient
      projects={data.projects}
      taskCounts={data.taskCounts}
      allTasks={data.allTasks}
      templates={data.templates}
      onRefresh={load}
    />
  )
}
