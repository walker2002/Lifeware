"use client"

import { useState, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

interface DraftTimebox {
  id: string
  title: string
  startTime: string // HH:MM
  endTime: string // HH:MM
  duration: number
  habitId: string
  // 约束（来自习惯）
  earliestTime: string
  latestEndTime: string
  minDuration: number
}

interface TimeboxDraftEditorProps {
  drafts: DraftTimebox[]
  onConfirm: (drafts: DraftTimebox[]) => void
  onSkip: (draftId: string) => void
  onCancel: () => void
}

function toMin(time: string): number {
  const [h, m] = time.split(":").map(Number)
  return h * 60 + m
}

function toHHMM(min: number): string {
  const h = Math.floor(min / 60) % 24
  const m = min % 60
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
}

export function TimeboxDraftEditor({ drafts, onConfirm, onSkip, onCancel }: TimeboxDraftEditorProps) {
  const [localDrafts, setLocalDrafts] = useState<DraftTimebox[]>(drafts)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const handleTimeChange = useCallback((id: string, field: "startTime" | "endTime", value: string) => {
    if (!/^\d{2}:\d{2}$/.test(value)) return

    setLocalDrafts(prev => prev.map(d => {
      if (d.id !== id) return d

      const updated = { ...d, [field]: value }
      if (field === "startTime") {
        updated.endTime = toHHMM(toMin(value) + d.duration)
      } else {
        updated.duration = toMin(value) - toMin(d.startTime)
      }

      return updated
    }))

    setErrors(prev => {
      const next = { ...prev }
      delete next[id]
      return next
    })
  }, [])

  const handleDurationChange = useCallback((id: string, newDuration: number) => {
    setLocalDrafts(prev => prev.map(d => {
      if (d.id !== id) return d
      if (newDuration < d.minDuration) return d
      return { ...d, duration: newDuration, endTime: toHHMM(toMin(d.startTime) + newDuration) }
    }))
  }, [])

  const handleSkip = useCallback((id: string) => {
    setLocalDrafts(prev => prev.filter(d => d.id !== id))
    onSkip(id)
  }, [onSkip])

  const handleConfirm = useCallback(() => {
    const newErrors: Record<string, string> = {}

    for (const draft of localDrafts) {
      const start = toMin(draft.startTime)
      const earliest = toMin(draft.earliestTime)
      const latest = toMin(draft.latestEndTime)

      if (start < earliest) {
        newErrors[draft.id] = `开始时间不能早于 ${draft.earliestTime}`
      }
      if (start + draft.duration > latest + 24 * 60) { // 跨午夜处理
        newErrors[draft.id] = `结束时间不能晚于 ${draft.latestEndTime}`
      }
      if (draft.duration < draft.minDuration) {
        newErrors[draft.id] = `时长不能低于最短 ${draft.minDuration} 分钟`
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors)
      return
    }

    onConfirm(localDrafts)
  }, [localDrafts, onConfirm])

  return (
    <div className="flex flex-col gap-3">
      <div className="text-sm font-medium text-ink">调整今日计划</div>

      {localDrafts.map(draft => (
        <Card key={draft.id}>
          <CardContent className="flex items-center gap-3">
            <div className="flex-1 flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <span className="font-medium text-ink">{draft.title}</span>
                <span className="text-xs text-muted-foreground">
                  {draft.earliestTime} ~ {draft.latestEndTime}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="time"
                  value={draft.startTime}
                  onChange={e => handleTimeChange(draft.id, "startTime", e.target.value)}
                  className="w-28"
                />
                <span className="text-xs text-muted-foreground">
                  {draft.duration} 分钟
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive text-xs"
                  onClick={() => handleSkip(draft.id)}
                >
                  跳过
                </Button>
              </div>
              {errors[draft.id] && (
                <span className="text-xs text-destructive">{errors[draft.id]}</span>
              )}
            </div>
          </CardContent>
        </Card>
      ))}

      <div className="flex items-center justify-end gap-2">
        <Button variant="outline" onClick={onCancel}>取消</Button>
        <Button onClick={handleConfirm}>确认生成 {localDrafts.length} 个时间盒</Button>
      </div>
    </div>
  )
}
