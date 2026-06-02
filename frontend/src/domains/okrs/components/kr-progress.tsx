/**
 * @file kr-progress
 * @brief KeyResult 进度展示组件
 * 
 * 展示单个 KeyResult 的进度信息，支持编辑更新
 */

"use client"

import type { KeyResult } from "@/usom/types/objects"
import { Input } from "@/components/ui/input"
import { useState } from "react"
import { Button } from "@/components/ui/button"

/**
 * KeyResult 进度组件属性
 */
interface KRProgressProps {
  /** KeyResult 对象 */
  kr: KeyResult
  /** KR 编号 */
  krNumber?: string
  /** 是否可编辑 */
  editable?: boolean
  /** 进度更新回调 */
  onProgressUpdate?: (krId: string, value: number) => Promise<KeyResult | null>
}

export function KRProgress({ kr, krNumber, editable, onProgressUpdate }: KRProgressProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [inputValue, setInputValue] = useState(String(kr.currentValue))
  const [isUpdating, setIsUpdating] = useState(false)

  const percent = kr.targetValue > 0
    ? Math.round((kr.currentValue / kr.targetValue) * 100)
    : 0

  const handleSubmit = async () => {
    const val = Number(inputValue)
    if (isNaN(val) || val < 0) return
    setIsUpdating(true)
    await onProgressUpdate?.(kr.id, val)
    setIsUpdating(false)
    setIsEditing(false)
  }

  const statusColors: Record<string, string> = {
    draft: "bg-muted",
    active: "bg-primary",
    paused: "bg-warning",
    completed: "bg-success",
    discarded: "bg-muted",
    archived: "bg-muted",
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">
          {krNumber && <span className="font-mono text-xs text-muted-foreground mr-1">{krNumber}</span>}
          {kr.title}
        </span>
        <span className="text-xs text-muted-foreground">{kr.status}</span>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${statusColors[kr.status] ?? "bg-primary"}`}
            style={{ width: `${Math.min(percent, 100)}%` }} />
        </div>
        <span className="text-sm font-mono w-12 text-right">{percent}%</span>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        {isEditing ? (
          <>
            <Input type="number" value={inputValue} onChange={e => setInputValue(e.target.value)}
              className="w-20 h-7 text-xs" min={0} max={kr.targetValue}
              onKeyDown={e => e.key === "Enter" && handleSubmit()} />
            <span>/ {kr.targetValue} {kr.unit}</span>
            <Button size="sm" variant="ghost" onClick={handleSubmit} disabled={isUpdating} className="h-7 text-xs">
              {isUpdating ? "..." : "确认"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setIsEditing(false)} className="h-7 text-xs">取消</Button>
          </>
        ) : (
          <>
            <span>{kr.currentValue} / {kr.targetValue} {kr.unit}</span>
            {editable && kr.status === "active" && (
              <Button size="sm" variant="link" onClick={() => { setInputValue(String(kr.currentValue)); setIsEditing(true) }} className="h-auto p-0 text-xs">
                更新
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
