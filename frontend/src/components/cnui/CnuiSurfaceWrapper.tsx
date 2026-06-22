/**
 * @file CnuiSurfaceWrapper
 * @brief CN-UI 动作面包装器组件
 *
 * 包装 CN-UI 渲染器，处理：
 * - 翻页：拦截 dataModel.items 自动分页
 * - 全屏：portal 到主内容区(data-lw-main-area)，保留左侧 panel；同一组件实例切换以保持输入状态与焦点
 * - 完成态：折叠摘要 + 可展开只读
 * - 生命周期状态、数据快照和验证错误
 */

'use client'

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
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

/**
 * 解析当前可见的主内容区节点（全屏 surface 的 portal 目标）。
 *
 * 桌面/移动端各有一个 [data-lw-main-area]，仅可见的那个 offsetParent 非空；
 * 全屏 surface 渲染进主内容区后，只占据主显示区，左侧 panel 作为 flex 兄弟自然保留。
 */
function resolveMainAreaTarget(): HTMLElement | null {
  if (typeof document === 'undefined') return null
  const targets = document.querySelectorAll<HTMLElement>('[data-lw-main-area]')
  for (const target of Array.from(targets)) {
    // display:none 时 offsetParent 为 null —— 据此挑出当前可见的实例
    if (target.offsetParent !== null) return target
  }
  return targets[0] ?? null
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
  const serverErrors = lifecycleState.serverErrors[surfaceId]
  const isDone = state === 'saved' || state === 'cancelled'

  // ── 翻页状态 ──────────────────────────────────────────────
  const [page, setPage] = useState(1)
  // ── 内联高度快照（全屏时用作占位符，防止对话流塌陷） ────────
  const [inlineHeight, setInlineHeight] = useState(0)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // ── 全屏 portal 目标（主内容区） ─────────────────────────
  const mainAreaTarget = useMemo(
    () => (isFullscreen ? resolveMainAreaTarget() : null),
    [isFullscreen],
  )

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
      // 进入全屏前测量内联高度（布局高度，与滚动位置无关），留给占位符防止对话流塌陷
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
  // 全屏 surface（提取为变量，便于 portal 进主内容区）
  const surfaceEl = (
    <div
      ref={wrapperRef}
      className={cn(
        'relative',
        isFullscreen
          ? 'absolute inset-0 z-overlay flex flex-col bg-canvas'
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
          serverErrors={serverErrors}
        />
      </div>
    </div>
  )

  return (
    <>
      {/* 占位符：全屏时撑住原位，防止对话流塌陷 */}
      {isFullscreen && <div style={{ height: inlineHeight }} aria-hidden />}

      {/* 全屏时 portal 进主内容区，仅占据主显示区、保留左侧 panel */}
      {isFullscreen && mainAreaTarget ? createPortal(surfaceEl, mainAreaTarget) : surfaceEl}

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
