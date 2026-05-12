"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { Project } from "@/usom/types/objects"
import { Priority } from "@/usom/types/primitives"

export interface ProjectFormData {
  name: string
  description?: string
  startDate?: string
  endDate?: string
  defaultEarliestTime?: string
  defaultLatestStartTime?: string
  defaultDuration?: number
  priority?: string
  color?: string
  tags?: string[]
}

interface ProjectFormProps {
  project?: Project
  onSave: (data: ProjectFormData) => Promise<void>
  onCancel: () => void
}

const PRIORITY_OPTIONS: { value: string; label: string }[] = [
  { value: Priority.Critical, label: "紧急" },
  { value: Priority.High, label: "高" },
  { value: Priority.Medium, label: "中" },
  { value: Priority.Low, label: "低" },
]

export function ProjectForm({ project, onSave, onCancel }: ProjectFormProps) {
  const [name, setName] = useState(project?.name ?? "")
  const [description, setDescription] = useState(project?.description ?? "")
  const [startDate, setStartDate] = useState(project?.startDate ?? "")
  const [endDate, setEndDate] = useState(project?.endDate ?? "")
  const [defaultEarliestTime, setDefaultEarliestTime] = useState(project?.defaultEarliestTime ?? "")
  const [defaultLatestStartTime, setDefaultLatestStartTime] = useState(project?.defaultLatestStartTime ?? "")
  const [defaultDuration, setDefaultDuration] = useState(project?.defaultDuration?.toString() ?? "")
  const [priority, setPriority] = useState<string>(project?.priority ?? Priority.Medium)
  const [color, setColor] = useState(project?.color ?? "#3b82f6")
  const [isLoading, setIsLoading] = useState(false)

  const isEditing = !!project

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    setIsLoading(true)
    try {
      await onSave({
        name: name.trim(),
        description: description || undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        defaultEarliestTime: defaultEarliestTime || undefined,
        defaultLatestStartTime: defaultLatestStartTime || undefined,
        defaultDuration: defaultDuration ? Number(defaultDuration) : undefined,
        priority: priority || undefined,
        color: color || undefined,
        tags: [],
      })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="project-name">名称 *</Label>
        <Input
          id="project-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="例如：2026 年度产品重构"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="project-desc">描述</Label>
        <Textarea
          id="project-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="项目目标和范围描述"
          rows={3}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="project-start">开始日期</Label>
          <Input id="project-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="project-end">结束日期</Label>
          <Input id="project-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="project-earliest">默认最早时间</Label>
          <Input
            id="project-earliest"
            type="time"
            value={defaultEarliestTime}
            onChange={(e) => setDefaultEarliestTime(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="project-latest">默认最晚时间</Label>
          <Input
            id="project-latest"
            type="time"
            value={defaultLatestStartTime}
            onChange={(e) => setDefaultLatestStartTime(e.target.value)}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="project-duration">默认时长（分钟）</Label>
          <Input
            id="project-duration"
            type="number"
            min={5}
            max={480}
            value={defaultDuration}
            onChange={(e) => setDefaultDuration(e.target.value)}
            placeholder="60"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="project-priority">优先级</Label>
          <select
            id="project-priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {PRIORITY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="project-color">颜色标识</Label>
          <Input
            id="project-color"
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-9 w-full cursor-pointer p-1"
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          取消
        </Button>
        <Button type="submit" disabled={!name.trim() || isLoading}>
          {isLoading ? "保存中..." : isEditing ? "保存" : "创建项目"}
        </Button>
      </div>
    </form>
  )
}
