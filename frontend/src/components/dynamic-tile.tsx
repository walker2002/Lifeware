"use client"

// DynamicTile — 动作面候选项的动态卡片组件
// 每个 ActionCandidate 渲染为可点击的卡片
// 样式：canvas 背景、圆角、hairline 边框

import type { ActionCandidate } from "@/usom/types/process"

interface DynamicTileProps {
  /** 候选动作列表 */
  candidates: ActionCandidate[]
}

/**
 * DynamicTile — 渲染 ActionCandidate 列表
 *
 * 将候选项渲染为可点击的卡片列表。
 * 候选项为空时不渲染任何内容。
 */
export function DynamicTile({ candidates }: DynamicTileProps) {
  if (candidates.length === 0) return null

  return (
    <div className="space-y-2" role="list" aria-label="建议动作">
      {candidates.map((candidate) => (
        <button
          key={candidate.id}
          type="button"
          role="listitem"
          className="w-full text-left p-3 bg-canvas rounded-md border border-hairline hover:bg-surface-card transition-colors cursor-pointer"
        >
          <div className="text-sm font-medium text-ink">
            {candidate.label}
          </div>
          {candidate.subLabel && (
            <div className="text-xs text-muted mt-1">
              {candidate.subLabel}
            </div>
          )}
        </button>
      ))}
    </div>
  )
}
