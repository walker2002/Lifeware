"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import type { Task, Project } from "@/usom/types/objects"
import { Priority, EnergyLevel } from "@/usom/types/primitives"

export interface TaskFormData {
  title: string
  description?: string
  priority: string
  energyRequired: string
  estimatedDuration: number
  earliestTime?: string
  latestStartTime?: string
  defaultTime?: string
  defaultDuration?: number
}

interface TaskFormProps {
  projectId?: string
  parentId?: string
  task?: Task
  project?: Project
  onSave: (data: TaskFormData) => Promise<void>
  onCancel: () => void
}

const PRIORITY_OPTIONS = [
  { value: Priority.Critical, label: "紧急" },
  { value: Priority.High, label: "高" },
  { value: Priority.Medium, label: "中" },
  { value: Priority.Low, label: "低" },
]

const ENERGY_OPTIONS = [
  { value: EnergyLevel.High, label: "高能量" },
  { value: EnergyLevel.Medium, label: "中等" },
  { value: EnergyLevel.Low, label: "低能量" },
]

export function TaskForm({ parentId, task, project, onSave, onCancel }: TaskFormProps) {
  const [title, setTitle] = useState(task?.title ?? "")
  const [description, setDescription] = useState(task?.description ?? "")
  const [priority, setPriority] = useState<string>(task?.priority ?? Priority.Medium)
  const [energyRequired, setEnergyRequired] = useState<string>(task?.energyRequired ?? EnergyLevel.Medium)
  const [estimatedDuration, setEstimatedDuration] = useState(task?.estimatedDuration?.toString() ?? "60")
  const [earliestTime, setEarliestTime] = useState(task?.earliestTime ?? "")
  const [latestStartTime, setLatestStartTime] = useState(task?.latestStartTime ?? "")
  const [defaultTime, setDefaultTime] = useState(task?.defaultTime ?? "")
  const [defaultDuration, setDefaultDuration] = useState(task?.defaultDuration?.toString() ?? "")
  const [isLoading, setIsLoading] = useState(false)

  const isSubTask = !!parentId
  const isEditing = !!task

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    setIsLoading(true)
    try {
      await onSave({
        title: title.trim(),
        description: description || undefined,
        priority,
        energyRequired,
        estimatedDuration: Number(estimatedDuration) || 60,
        earliestTime: earliestTime || undefined,
        latestStartTime: latestStartTime || undefined,
        defaultTime: defaultTime || undefined,
        defaultDuration: defaultDuration ? Number(defaultDuration) : undefined,
      })
    } finally {
      setIsLoading(false)
    }
  }

  const titleLabel = isSubTask ? "子任务标题 *" : "任务标题 *"
  const titlePlaceholder = isSubTask ? "输入子任务名称" : "例如：完成 UI 设计稿"
  const submitLabel = isEditing ? "保存" : isSubTask ? "添加子任务" : "创建任务"

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="task-title">{titleLabel}</Label>
        <Input
          id="task-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={titlePlaceholder}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="task-desc">描述</Label>
        <Textarea
          id="task-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="可选"
          rows={2}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="task-priority">优先级</Label>
          <select
            id="task-priority"
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
          <Label htmlFor="task-energy">所需能量</Label>
          <select
            id="task-energy"
            value={energyRequired}
            onChange={(e) => setEnergyRequired(e.target.value)}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
          >
            {ENERGY_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="task-duration">预估时长（分钟）</Label>
        <Input
          id="task-duration"
          type="number"
          min={5}
          max={1440}
          value={estimatedDuration}
          onChange={(e) => setEstimatedDuration(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="task-earliest">最早开始</Label>
          <Input
            id="task-earliest"
            type="time"
            value={earliestTime}
            onChange={(e) => setEarliestTime(e.target.value)}
            placeholder={project?.defaultEarliestTime ?? "继承项目"}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="task-latest">最迟开始</Label>
          <Input
            id="task-latest"
            type="time"
            value={latestStartTime}
            onChange={(e) => setLatestStartTime(e.target.value)}
            placeholder={project?.defaultLatestStartTime ?? "继承项目"}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="task-default-time">默认时间</Label>
          <Input
            id="task-default-time"
            type="time"
            value={defaultTime}
            onChange={(e) => setDefaultTime(e.target.value)}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="task-default-duration">默认时长（分钟）</Label>
        <Input
          id="task-default-duration"
          type="number"
          min={5}
          max={480}
          value={defaultDuration}
          onChange={(e) => setDefaultDuration(e.target.value)}
          placeholder={project?.defaultDuration?.toString() ?? "继承项目"}
        />
      </div>

      <div className="flex items-center justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          取消
        </Button>
        <Button type="submit" disabled={!title.trim() || isLoading}>
          {isLoading ? "保存中..." : submitLabel}
        </Button>
      </div>
    </form>
  )
}
