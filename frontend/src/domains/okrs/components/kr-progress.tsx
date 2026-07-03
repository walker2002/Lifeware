/**
 * @file kr-progress
 * @brief KeyResult 进度展示组件
 *
 * 展示单个 KeyResult 的进度信息与达成信心度（[024] G2），支持编辑更新。
 * [022.01] Phase 3：移除 kr.status 引用——
 * 进度条颜色、完成指示符由 progressRate 驱动；编辑权限由父组件按 cycleStatus 控制后透传 editable。
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
  /** [024] 信心度更新回调 */
  onConfidenceUpdate?: (krId: string, confidence: number) => Promise<KeyResult | null>
}

export function KRProgress({ kr, krNumber, editable, onProgressUpdate, onConfidenceUpdate }: KRProgressProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [inputValue, setInputValue] = useState(String(kr.currentValue))
  const [isUpdating, setIsUpdating] = useState(false)

  // [024] 信心度编辑 state
  const [isEditingConfidence, setIsEditingConfidence] = useState(false)
  const [confidenceInput, setConfidenceInput] = useState(String(kr.confidence))
  const [isUpdatingConfidence, setIsUpdatingConfidence] = useState(false)

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

  // [024] 信心度提交处理：拒绝 NaN / <0 / >100
  const handleSubmitConfidence = async () => {
    const val = Number(confidenceInput)
    if (isNaN(val) || val < 0 || val > 100) return
    setIsUpdatingConfidence(true)
    await onConfidenceUpdate?.(kr.id, val)
    setIsUpdatingConfidence(false)
    setIsEditingConfidence(false)
  }

  // [022.01] Phase 3：进度条颜色由 progressRate 驱动（不再依赖 kr.status）
  const isKRCompleted = kr.progressRate >= 1.0
  const barColor = isKRCompleted ? "bg-success" : "bg-primary"

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">
          {krNumber && <span className="font-mono text-xs text-muted-foreground mr-1">{krNumber}</span>}
          {kr.title}
        </span>
        {isKRCompleted && <span className="text-xs text-success">✓</span>}
      </div>

      <div className="flex items-center gap-3">
        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
          <div className={`h-full rounded-full transition-all ${barColor}`}
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
            {editable && (
              <Button size="sm" variant="link" onClick={() => { setInputValue(String(kr.currentValue)); setIsEditing(true) }} className="h-auto p-0 text-xs">
                更新
              </Button>
            )}
          </>
        )}
      </div>

      {/* [024] 信心度行 */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="shrink-0">信心</span>
        {isEditingConfidence ? (
          <>
            <Input type="number" value={confidenceInput} min={0} max={100}
              onChange={e => setConfidenceInput(e.target.value)}
              className="w-16 h-7 text-xs"
              onKeyDown={e => e.key === "Enter" && handleSubmitConfidence()} />
            <span>%</span>
            <Button size="sm" variant="ghost" onClick={handleSubmitConfidence} disabled={isUpdatingConfidence} className="h-7 text-xs">
              {isUpdatingConfidence ? "..." : "确认"}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setIsEditingConfidence(false)} className="h-7 text-xs">取消</Button>
          </>
        ) : (
          <>
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden max-w-[120px]">
              <div className="h-full rounded-full bg-primary/60" style={{ width: `${kr.confidence}%` }} />
            </div>
            <span className="font-mono w-10 text-right">{kr.confidence}%</span>
            {editable && onConfidenceUpdate && (
              <Button size="sm" variant="link" className="h-auto p-0 text-xs"
                onClick={() => { setConfidenceInput(String(kr.confidence)); setIsEditingConfidence(true) }}>
                更新信心
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  )
}
