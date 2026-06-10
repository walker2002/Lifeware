/**
 * @file CnuiSurfaceWrapper
 * @brief CN-UI 动作面包装器组件
 * 
 * 包装 CN-UI 渲染器，处理生命周期状态、数据快照和完成状态展示
 */

'use client'

import { CnuiRenderer } from './CnuiRenderer'
import { CnuiConfirmDialog } from './cnui-confirm-dialog'
import type { CnuiLifecycleState, CnuiLifecycleActions } from './use-cnui-lifecycle'

/**
 * CnuiSurfaceWrapper 组件属性
 */
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
}

export function CnuiSurfaceWrapper({
  surfaceId,
  domainId,
  action,
  surfaceType,
  dataSnapshot,
  lifecycleState,
  lifecycleActions,
}: CnuiSurfaceWrapperProps) {
  const state = lifecycleState.surfaceStates[surfaceId] ?? 'active'
  const data = lifecycleState.surfaceData[surfaceId] ?? dataSnapshot ?? {}
  const isLoading = lifecycleState.submittingId === surfaceId
  const errors = lifecycleState.validationErrors[surfaceId]
  const isDone = state === 'saved' || state === 'cancelled'

  if (isDone) {
    return (
      <div className="relative mt-3 rounded-lg border border-hairline bg-surface-soft p-4">
        <div className="pointer-events-none opacity-50">
          <CnuiRenderer
            surfaceType={surfaceType as any}
            dataModel={data}
            onDataChange={() => {}}
            onConfirm={() => {}}
            onCancel={() => {}}
            isLoading={false}
            isDone={true}
          />
        </div>
        <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-muted/30">
          <div
            className={`rounded-md px-4 py-2 text-sm font-medium shadow ${
              state === 'saved'
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            {state === 'saved' ? '已保存' : '已取消'}
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="mt-3 rounded-lg border border-hairline bg-surface-soft p-4">
        {errors && errors.length > 0 && (
          <div className="mb-3 rounded-md border border-error bg-error-soft px-3 py-2 text-sm text-error">
            {errors.map((err, i) => (
              <div key={i}>{err}</div>
            ))}
          </div>
        )}
        <CnuiRenderer
          surfaceType={surfaceType as any}
          dataModel={data}
          onDataChange={(d) => lifecycleActions.updateData(surfaceId, d)}
          onConfirm={(d) => lifecycleActions.requestSave(surfaceId, domainId, action, d)}
          onCancel={() => lifecycleActions.requestCancel(surfaceId)}
          isLoading={isLoading}
          isDone={false}
        />
      </div>

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
