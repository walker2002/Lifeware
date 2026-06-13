/**
 * @file CnuiSurfaceDone
 * @brief CN-UI Surface 完成态组件
 *
 * 折叠摘要 + 点击展开只读详情
 */

'use client'

import { useState } from 'react'
import { CnuiRenderer } from './CnuiRenderer'

/** 完成态摘要数据（由 Surface submit 时写入 dataModel._summary） */
interface SurfaceSummary {
  /** 图标（如 '✅'） */
  icon: string
  /** 摘要文本（如 '已打卡 5 项'） */
  title: string
}

/** CnuiSurfaceDone 组件属性 */
interface CnuiSurfaceDoneProps {
  /** Surface 类型 */
  surfaceType: string
  /** 数据模型（含可选 _summary） */
  dataModel: Record<string, unknown>
  /** 完成状态 */
  state: 'saved' | 'cancelled'
}

export function CnuiSurfaceDone({ surfaceType, dataModel, state }: CnuiSurfaceDoneProps) {
  const [expanded, setExpanded] = useState(false)
  const summary = dataModel._summary as SurfaceSummary | undefined

  const displayText = summary
    ? `${summary.icon} ${summary.title}`
    : state === 'saved'
      ? '✅ 已保存'
      : '❌ 已取消'

  // ── 展开态：只读渲染原始 Surface ────────────────────────────
  if (expanded) {
    return (
      <div className="mt-3 rounded-lg border border-hairline bg-surface-soft">
        <div
          className="flex cursor-pointer items-center justify-between px-4 py-2"
          onClick={() => setExpanded(false)}
        >
          <span className="text-sm text-ink">{displayText}</span>
          <span className="text-xs text-muted">▼ 收起</span>
        </div>
        <div className="max-h-48 overflow-y-auto px-4 pb-4">
          <div className="pointer-events-none opacity-50">
            <CnuiRenderer
              surfaceType={surfaceType as never}
              dataModel={dataModel}
              onDataChange={() => {}}
              onConfirm={() => {}}
              onCancel={() => {}}
              isLoading={false}
              isDone={true}
            />
          </div>
        </div>
      </div>
    )
  }

  // ── 折叠态：单行摘要 ───────────────────────────────────────
  return (
    <div
      className="mt-3 flex cursor-pointer items-center justify-between rounded-lg border border-hairline bg-surface-soft px-4 py-2 transition-colors hover:bg-hover-overlay"
      onClick={() => setExpanded(true)}
    >
      <span className="text-sm text-ink">{displayText}</span>
      <span className="text-xs text-muted">▶</span>
    </div>
  )
}