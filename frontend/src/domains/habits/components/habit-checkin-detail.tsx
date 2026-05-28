'use client'

import { useState } from 'react'

interface HabitCheckinDetailProps {
  habit: { id: string; title: string; defaultDuration: number }
  onSubmit: (fields: HabitLogFields) => void
  onCancel: () => void
  isLoading?: boolean
}

export interface HabitLogFields {
  actualDuration?: number
  completionRating?: number
  energyLevel?: number
  note?: string
}

const RATING_OPTIONS = [1, 2, 3, 4, 5]
const ENERGY_OPTIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

export function HabitCheckinDetail({ habit, onSubmit, onCancel, isLoading }: HabitCheckinDetailProps) {
  const [actualDuration, setActualDuration] = useState<number | undefined>(undefined)
  const [completionRating, setCompletionRating] = useState<number | undefined>(undefined)
  const [energyLevel, setEnergyLevel] = useState<number | undefined>(undefined)
  const [note, setNote] = useState('')

  function handleSubmit() {
    onSubmit({
      actualDuration,
      completionRating,
      energyLevel,
      note: note || undefined,
    })
  }

  return (
    <div className="rounded-lg border bg-card p-4 text-sm">
      <div className="mb-3 font-medium">{habit.title} · 打卡详情</div>

      {/* 实际时长 */}
      <div className="mb-3">
        <label className="mb-1 block text-xs text-muted-foreground">实际时长（分钟）</label>
        <input
          type="number"
          min={1}
          max={480}
          placeholder={`默认 ${habit.defaultDuration}`}
          value={actualDuration ?? ''}
          onChange={(e) => setActualDuration(e.target.value ? Number(e.target.value) : undefined)}
          className="w-full rounded-md border px-3 py-1.5 text-sm"
        />
      </div>

      {/* 完成评分 */}
      <div className="mb-3">
        <label className="mb-1 block text-xs text-muted-foreground">完成评分</label>
        <div className="flex gap-1">
          {RATING_OPTIONS.map(r => (
            <button
              key={r}
              type="button"
              onClick={() => setCompletionRating(r === completionRating ? undefined : r)}
              className={`size-8 rounded text-xs font-medium transition-colors ${
                completionRating === r
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* 精力水平 */}
      <div className="mb-3">
        <label className="mb-1 block text-xs text-muted-foreground">精力水平</label>
        <div className="flex flex-wrap gap-1">
          {ENERGY_OPTIONS.map(e => (
            <button
              key={e}
              type="button"
              onClick={() => setEnergyLevel(e === energyLevel ? undefined : e)}
              className={`size-7 rounded text-xs font-medium transition-colors ${
                energyLevel === e
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {e}
            </button>
          ))}
        </div>
      </div>

      {/* 备注 */}
      <div className="mb-4">
        <label className="mb-1 block text-xs text-muted-foreground">备注</label>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="可选"
          rows={2}
          className="w-full rounded-md border px-3 py-1.5 text-sm"
        />
      </div>

      {/* 按钮 */}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border px-3 py-1.5 text-xs"
        >
          取消
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={isLoading}
          className="rounded-md bg-primary px-4 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50"
        >
          {isLoading ? '提交中...' : '确认打卡'}
        </button>
      </div>
    </div>
  )
}
