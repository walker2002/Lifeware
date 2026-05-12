"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { SplitWarning } from "./split-warning"
import type { Task } from "@/usom/types/objects"
import { Priority, EnergyLevel } from "@/usom/types/primitives"

export interface TaskFormData {
  title: string
  description?: string
  priority: string
  energyRequired: string
  estimatedDuration: number
  frequencyType?: string
  daysOfWeek?: number[]
  startDate?: string
  endDate?: string
}

interface TaskFormProps {
  projectId?: string
  parentId?: string
  task?: Task
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

export function TaskForm({ parentId, task, onSave, onCancel }: TaskFormProps) {
  const [title, setTitle] = useState(task?.title ?? "")
  const [description, setDescription] = useState(task?.description ?? "")
  const [priority, setPriority] = useState<string>(task?.priority ?? Priority.Medium)
  const [energyRequired, setEnergyRequired] = useState<string>(task?.energyRequired ?? EnergyLevel.Medium)
  const [estimatedDuration, setEstimatedDuration] = useState(task?.estimatedDuration?.toString() ?? "60")
  const [frequencyType, setFrequencyType] = useState<string>(task?.frequencyType ?? "once")
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>(task?.daysOfWeek ?? [])
  const [startDate, setStartDate] = useState(task?.startDate ?? "")
  const [endDate, setEndDate] = useState(task?.endDate ?? "")
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
        frequencyType: frequencyType || undefined,
        daysOfWeek: daysOfWeek.length > 0 ? daysOfWeek : undefined,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
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
        {Number(estimatedDuration) > 720 && <SplitWarning />}
      </div>

      {/* 调度设置 */}
      <fieldset className="border-t pt-3 mt-1">
        <legend className="text-sm font-medium px-1">调度设置</legend>
        <div className="flex flex-col gap-3 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="task-frequency">重复频率</Label>
              <select
                id="task-frequency"
                value={frequencyType}
                onChange={(e) => setFrequencyType(e.target.value)}
                className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <option value="once">仅一次</option>
                <option value="daily">每日</option>
                <option value="weekly">每周</option>
                <option value="custom">自定义</option>
              </select>
            </div>
          </div>

          {frequencyType === 'weekly' && (
            <div className="flex flex-col gap-1.5">
              <Label>每周日</Label>
              <div className="flex gap-1 flex-wrap">
                {[
                  { v: 1, l: '一' }, { v: 2, l: '二' }, { v: 3, l: '三' },
                  { v: 4, l: '四' }, { v: 5, l: '五' }, { v: 6, l: '六' }, { v: 0, l: '日' },
                ].map((d) => (
                  <button
                    key={d.v}
                    type="button"
                    className={`size-8 rounded-full text-xs font-medium border transition-colors ${
                      daysOfWeek.includes(d.v)
                        ? "bg-primary text-primary-foreground border-primary"
                        : "border-input hover:bg-muted"
                    }`}
                    onClick={() => setDaysOfWeek(
                      daysOfWeek.includes(d.v) ? daysOfWeek.filter(x => x !== d.v) : [...daysOfWeek, d.v]
                    )}
                  >
                    {d.l}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="task-start-date">开始日期</Label>
              <Input
                id="task-start-date"
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                placeholder="开始日期"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="task-end-date">结束日期</Label>
              <Input
                id="task-end-date"
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                placeholder="结束日期"
              />
            </div>
          </div>
        </div>
      </fieldset>

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
