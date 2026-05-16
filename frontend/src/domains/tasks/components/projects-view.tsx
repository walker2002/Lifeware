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
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <p className="text-sm">加载中...</p>
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
