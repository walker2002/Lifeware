/**
 * @file CnuiSurfaceWrapper
 * @brief CN-UI 动作面包装器组件
 *
 * 包装 CN-UI 渲染器，处理：
 * - 翻页：拦截 dataModel.items 自动分页
 * - 全屏：Dialog 覆盖主显示区
 * - 完成态：折叠摘要 + 可展开只读
 * - 生命周期状态、数据快照和验证错误
 */

'use client'

import { useState, useCallback } from 'react'
import { CnuiRenderer } from './CnuiRenderer'
import { CnuiConfirmDialog } from './cnui-confirm-dialog'
import { CnuiSurfaceDone } from './CnuiSurfaceDone'
import { CnuiSurfaceFullscreen } from './CnuiSurfaceFullscreen'
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
  /** 是否允许展开到全屏（默认 true） */
  expandable?: boolean
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
  expandable = true,
}: CnuiSurfaceWrapperProps) {
  const state = lifecycleState.surfaceStates[surfaceId] ?? 'active'
  const rawData = lifecycleState.surfaceData[surfaceId] ?? dataSnapshot ?? {}
  const isLoading = lifecycleState.submittingId === surfaceId
  const errors = lifecycleState.validationErrors[surfaceId]
  const isDone = state === 'saved' || state === 'cancelled'

  // ── 翻页状态 ──────────────────────────────────────────────
  const [page, setPage] = useState(1)
  // ── 全屏状态 ──────────────────────────────────────────────
  const [fullscreen, setFullscreen] = useState(false)

  // ── 分页计算 ──────────────────────────────────────────────
  const items = rawData[itemsKey]
  const itemsArray = Array.isArray(items) ? items : []
  const { items: paginatedItems, pagination } = paginateItems(itemsArray, page, pageSize)
  // 构建分页后的 dataModel：替换 items 为当前页切片，注入 _pagination
  const dataModel: Record<string, unknown> = pagination
    ? { ...rawData, [itemsKey]: paginatedItems, _pagination: pagination }
    : rawData

  // 全屏模式：使用原始 dataModel（不分页）
  const fullscreenDataModel = rawData

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

  // ── 全屏按钮回调 ─────────────────────────────────────────
  const requestFullscreen = useCallback(() => setFullscreen(true), [])

  // ── 完成态 ────────────────────────────────────────────────
  if (isDone) {
    return <CnuiSurfaceDone surfaceType={surfaceType} dataModel={rawData} state={state} />
  }

  // ── 活跃态 ────────────────────────────────────────────────
  return (
    <>
      <div className="relative mt-3 max-h-[65vh] overflow-hidden rounded-lg border border-hairline bg-surface-soft p-4">
        {errors && errors.length > 0 && (
          <div className="mb-3 rounded-md border border-error bg-error-soft px-3 py-2 text-sm text-error">
            {errors.map((err, i) => (
              <div key={i}>{err}</div>
            ))}
          </div>
        )}
        <CnuiRenderer
          surfaceType={surfaceType as never}
          dataModel={dataModel}
          onDataChange={handleDataChange}
          onConfirm={(d) => lifecycleActions.requestSave(surfaceId, domainId, action, d)}
          onCancel={() => lifecycleActions.requestCancel(surfaceId)}
          isLoading={isLoading}
          isDone={false}
        />
        {/* ── 右上角全屏按钮 ──────────────────────────────── */}
        {expandable && (
          <button
            type="button"
            onClick={requestFullscreen}
            className="absolute right-2 top-2 flex size-6 items-center justify-center rounded text-muted hover:bg-hover-overlay hover:text-ink transition-colors"
            title="全屏展开"
          >
            □
          </button>
        )}
      </div>

      {/* ── 全屏 Dialog ──────────────────────────────────── */}
      {expandable && fullscreen && (
        <CnuiSurfaceFullscreen
          open={fullscreen}
          title={String(rawData._title ?? action)}
          onClose={() => setFullscreen(false)}
        >
          <CnuiRenderer
            surfaceType={surfaceType as never}
            dataModel={fullscreenDataModel}
            onDataChange={(d) => lifecycleActions.updateData(surfaceId, d)}
            onConfirm={(d) => lifecycleActions.requestSave(surfaceId, domainId, action, d)}
            onCancel={() => lifecycleActions.requestCancel(surfaceId)}
            isLoading={isLoading}
            isDone={false}
            onRequestFullscreen={undefined}
          />
        </CnuiSurfaceFullscreen>
      )}

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
