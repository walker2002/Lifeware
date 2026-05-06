"use client"

import type { ActionCandidate } from "@/usom/types/process"

interface TilesBannerProps {
  /** 行动候选列表 */
  candidates: ActionCandidate[]
}

/**
 * TilesBanner — TopNav 下方的全宽 Tiles 横幅区域
 *
 * candidates 为空时不渲染。
 * 背景 surface-soft，水平滚动展示多个 Tile。
 */
export function TilesBanner({ candidates }: TilesBannerProps) {
  if (candidates.length === 0) return null

  return (
    <div
      className="flex gap-2 overflow-x-auto border-b border-hairline bg-surface-soft px-4 py-3"
      role="region"
      aria-label="建议动作"
    >
      {candidates.map((candidate) => (
        <button
          key={candidate.id}
          type="button"
          className="flex-shrink-0 text-left rounded-md border border-hairline bg-canvas px-3 py-2 transition-colors hover:bg-surface-card"
        >
          <div className="text-sm font-medium text-ink">
            {candidate.label}
          </div>
          {candidate.subLabel && (
            <div className="text-xs text-muted-foreground mt-0.5">
              {candidate.subLabel}
            </div>
          )}
        </button>
      ))}
    </div>
  )
}
