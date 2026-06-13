/**
 * @file CnuiSurfaceWrapper
 * @brief CN-UI 动作面包装器组件
 *
 * 包装 CN-UI 渲染器，处理：
 * - 翻页：拦截 dataModel.items 自动分页
 * - 全屏：CSS fixed 在同一组件实例上切换，保持输入状态与焦点
 * - 完成态：折叠摘要 + 可展开只读
 * - 生命周期状态、数据快照和验证错误
 */

'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { CnuiRenderer } from './CnuiRenderer'
import { CnuiConfirmDialog } from './cnui-confirm-dialog'
import { CnuiSurfaceDone } from './CnuiSurfaceDone'
import { paginateItems } from './pagination'
import type { CnuiLifecycleState, CnuiLifecycleActions } from './use-cnui-lifecycle'

/** CnuiSurfaceWrapper 组件属性 */
interface CnuiSurfaceWrapperProps {
  /** 动作面 ID */
  surfaceId: string
  /** 域 ID */
  domainId: string
  /** 动作名称 */
  action: string
  /** 动作面类型 */
  surfaceType: string
  /** 数据快照 */
  dataSnapshot: Record<string, unknown> | undefined
  /** 生命周期状态 */
  lifecycleState: CnuiLifecycleState
  /** 生命周期操作 */
  lifecycleActions: CnuiLifecycleActions
  /** 列表数据字段名（默认 'items'） */
  itemsKey?: string
  /** 每页项目数（默认 5） */
  pageSize?: number
  /** 标题文本（通常为 AI 消息内容），渲染在标题行左侧 */
  header?: ReactNode
  /** 是否处于全屏模式（受控） */
  isFullscreen?: boolean
  /** 全屏状态切换回调（传入 undefined 表示不允许全屏） */
  onFullscreenChange?: (fullscreen: boolean) => void
}

export function CnuiSurfaceWrapper({
  surfaceId,
  domainId,
  action,
  surfaceType,
  dataSnapshot,
  lifecycleState,
  lifecycleActions,
  itemsKey = 'items',
  pageSize = 5,
  header,
  isFullscreen = false,
  onFullscreenChange,
}: CnuiSurfaceWrapperProps) {
  const state = lifecycleState.surfaceStates[surfaceId] ?? 'active'
  const rawData = lifecycleState.surfaceData[surfaceId] ?? dataSnapshot ?? {}
  const isLoading = lifecycleState.submittingId === surfaceId
  const errors = lifecycleState.validationErrors[surfaceId]
  const isDone = state === 'saved' || state === 'cancelled'

  // ── 翻页状态 ──────────────────────────────────────────────
  const [page, setPage] = useState(1)
  // ── 内联高度快照（全屏时用作占位符，防止对话流塌陷） ────────
  const [inlineHeight, setInlineHeight] = useState(0)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // ── 分页计算 ──────────────────────────────────────────────
  const items = rawData[itemsKey]
  const itemsArray = Array.isArray(items) ? items : []
  const { items: paginatedItems, pagination } = paginateItems(itemsArray, page, pageSize)
  // 构建分页后的 dataModel：替换 items 为当前页切片，注入 _pagination
  const paginatedDataModel: Record<string, unknown> = pagination
    ? { ...rawData, [itemsKey]: paginatedItems, _pagination: pagination }
    : rawData

  // 全屏模式用全量数据（不分页），内联模式用分页数据
  const dataModel = isFullscreen ? rawData : paginatedDataModel

  // ── onDataChange 拦截 ─────────────────────────────────────
  const handleDataChange = useCallback(
    (d: Record<string, unknown>) => {
      // 拦截翻页请求
      if (d._page !== undefined) {
        setPage(d._page as number)
        return
      }
      lifecycleActions.updateData(surfaceId, d)
    },
    [lifecycleActions, surfaceId],
  )

  // ── 全屏切换 ─────────────────────────────────────────────
  const toggleFullscreen = useCallback(() => {
    if (!isFullscreen) {
      // 进入全屏前测量内联高度，留给占位符防止对话流塌陷
      setInlineHeight(wrapperRef.current?.getBoundingClientRect().height ?? 0)
    }
    onFullscreenChange?.(!isFullscreen)
  }, [isFullscreen, onFullscreenChange])

  // ── Escape 退出 + 滚动锁定（弥补丢失的 Dialog 行为） ──────
  useEffect(() => {
    if (!isFullscreen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFullscreenChange?.(false)
    }
    document.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [isFullscreen, onFullscreenChange])

  // ── 完成态 ────────────────────────────────────────────────
  if (isDone) {
    return <CnuiSurfaceDone surfaceType={surfaceType} dataModel={rawData} state={state} />
  }

  // ── 活跃态 ────────────────────────────────────────────────
  return (
    <>
      {/* 占位符：全屏时撑住原位，防止对话流塌陷 */}
      {isFullscreen && <div style={{ height: inlineHeight }} aria-hidden />}

      <div
        ref={wrapperRef}
        className={cn(
          'relative',
          isFullscreen
            ? 'fixed inset-0 z-40 flex flex-col bg-canvas'
            : 'mt-2 max-h-[65vh] overflow-hidden',
        )}
      >
        {/* 标题行 — 两种模式都渲染，全屏按钮跟随切换图标 */}
        {header !== undefined && (
          <div className={cn(
            'flex items-center justify-between gap-2',
            isFullscreen && 'border-b border-hairline px-4 py-3',
          )}>
            <div className="text-sm text-ink">{header}</div>
            {onFullscreenChange && (
              <button
                type="button"
                onClick={toggleFullscreen}
                className="flex size-6 shrink-0 items-center justify-center rounded text-muted-soft hover:bg-hover-overlay hover:text-ink transition-colors"
                title={isFullscreen ? '缩小回对话' : '全屏展开'}
              >
                {isFullscreen ? '↙' : '⛶'}
              </button>
            )}
          </div>
        )}

        <div className={isFullscreen ? 'flex-1 overflow-y-auto p-4' : undefined}>
          {errors && errors.length > 0 && (
            <div className="mb-3 rounded-md border border-error bg-error-soft px-3 py-2 text-sm text-error">
              {errors.map((err, i) => (
                <div key={i}>{err}</div>
              ))}
            </div>
          )}
          {/* 单一 CnuiRenderer — 全屏与内联共用同一实例，状态自然保持 */}
          <CnuiRenderer
            surfaceType={surfaceType as never}
            dataModel={dataModel}
            onDataChange={handleDataChange}
            onConfirm={(d) => lifecycleActions.requestSave(surfaceId, domainId, action, d)}
            onCancel={() => lifecycleActions.requestCancel(surfaceId)}
            isLoading={isLoading}
            isDone={false}
          />
        </div>
      </div>

      {/* ── 确认对话框 ───────────────────────────────────── */}
      {lifecycleState.confirmDialog.surfaceId === surfaceId && (
        <CnuiConfirmDialog
          open={lifecycleState.confirmDialog.open}
          title={lifecycleState.confirmDialog.title}
          message={lifecycleState.confirmDialog.message}
          onConfirm={lifecycleActions.confirmDialogAction}
          onCancel={lifecycleActions.dismissDialog}
        />
      )}
    </>
  )
}
