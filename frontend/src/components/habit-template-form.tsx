"use client"

import { useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface AvailableHabit {
  id: string
  title: string
  defaultTime: string
  defaultDuration: number
}

export interface TemplateHabitEntry {
  habitId: string
  title: string
  sortOrder: number
  timeOverride?: string
  durationOverride?: number
}

interface HabitTemplateFormProps {
  availableHabits: AvailableHabit[]
  initial?: {
    name?: string
    habits?: TemplateHabitEntry[]
  }
  onSubmit: (data: { name: string; applicableDays: number[]; habits: TemplateHabitEntry[] }) => void
  onCancel: () => void
  isLoading?: boolean
}

const DAYS = ["日", "一", "二", "三", "四", "五", "六"]

export function HabitTemplateForm({ availableHabits, initial, onSubmit, onCancel, isLoading }: HabitTemplateFormProps) {
  const [name, setName] = useState(initial?.name ?? "")
  const [selectedDays, setSelectedDays] = useState<number[]>([1, 2, 3, 4, 5])
  const [entries, setEntries] = useState<TemplateHabitEntry[]>(initial?.habits ?? [])
  const [selectedHabitId, setSelectedHabitId] = useState("")
  const [timeOverride, setTimeOverride] = useState("")

  const toggleDay = (day: number) => {
    setSelectedDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort(),
    )
  }

  const addHabit = useCallback(() => {
    if (!selectedHabitId) return
    const habit = availableHabits.find(h => h.id === selectedHabitId)
    if (!habit) return

    // 防止重复添加
    if (entries.some(e => e.habitId === selectedHabitId)) return

    const entry: TemplateHabitEntry = {
      habitId: habit.id,
      title: habit.title,
      sortOrder: entries.length + 1,
      timeOverride: timeOverride || undefined,
    }

    setEntries(prev => [...prev, entry])
    setSelectedHabitId("")
    setTimeOverride("")
  }, [selectedHabitId, timeOverride, availableHabits, entries])

  const removeHabit = useCallback((habitId: string) => {
    setEntries(prev => prev
      .filter(e => e.habitId !== habitId)
      .map((e, i) => ({ ...e, sortOrder: i + 1 })),
    )
  }, [])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || selectedDays.length === 0) return
    onSubmit({ name: name.trim(), applicableDays: selectedDays, habits: entries })
  }

  const isValid = name.trim().length > 0 && selectedDays.length > 0

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      {/* 模板名称 */}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="tpl-name">模板名称 *</Label>
        <Input id="tpl-name" value={name} onChange={e => setName(e.target.value)} placeholder="例如：工作日" />
      </div>

      {/* 适用日期 */}
      <div className="flex flex-col gap-1.5">
        <Label>适用日期</Label>
        <div className="flex gap-1">
          {DAYS.map((label, i) => (
            <button
              key={i}
              type="button"
              onClick={() => toggleDay(i)}
              className={`flex size-8 items-center justify-center rounded-full text-xs transition-colors ${
                selectedDays.includes(i)
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* 添加习惯 */}
      <div className="flex flex-col gap-1.5">
        <Label>添加习惯</Label>
        <div className="flex items-end gap-2">
          <select
            value={selectedHabitId}
            onChange={e => setSelectedHabitId(e.target.value)}
            className="flex-1 rounded-md border bg-background px-2 py-1.5 text-sm"
          >
            <option value="">选择习惯...</option>
            {availableHabits
              .filter(h => !entries.some(e => e.habitId === h.id))
              .map(h => (
                <option key={h.id} value={h.id}>{h.title} ({h.defaultTime}, {h.defaultDuration}min)</option>
              ))}
          </select>
          <Input
            type="time"
            value={timeOverride}
            onChange={e => setTimeOverride(e.target.value)}
            placeholder="覆盖时间"
            className="w-28"
          />
          <Button type="button" size="sm" onClick={addHabit} disabled={!selectedHabitId}>
            添加
          </Button>
        </div>
      </div>

      {/* 已添加的习惯列表 */}
      {entries.length > 0 && (
        <div className="flex flex-col gap-1">
          <Label>模板中的习惯</Label>
          {entries.map(entry => (
            <div key={entry.habitId} className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
              <div>
                <span className="font-medium">{entry.title}</span>
                {entry.timeOverride && (
                  <span className="ml-2 text-xs text-amber-600">覆盖: {entry.timeOverride}</span>
                )}
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => removeHabit(entry.habitId)}>
                移除
              </Button>
            </div>
          ))}
        </div>
      )}

      {/* 操作按钮 */}
      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>取消</Button>
        <Button type="submit" disabled={!isValid || isLoading}>
          {isLoading ? "提交中..." : initial ? "保存" : "创建模板"}
        </Button>
      </div>
    </form>
  )
}
