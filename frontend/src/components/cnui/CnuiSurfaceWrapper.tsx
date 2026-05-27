'use client'

import { CnuiRenderer } from './CnuiRenderer'
import { CnuiConfirmDialog } from './cnui-confirm-dialog'
import type { CnuiLifecycleState, CnuiLifecycleActions } from './use-cnui-lifecycle'

interface CnuiSurfaceWrapperProps {
  surfaceId: string
  domainId: string
  action: string
  surfaceType: string
  dataSnapshot: Record<string, unknown> | undefined
  lifecycleState: CnuiLifecycleState
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
          <div className="mb-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
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

      <CnuiConfirmDialog
        open={lifecycleState.confirmDialog.open}
        title={lifecycleState.confirmDialog.title}
        message={lifecycleState.confirmDialog.message}
        onConfirm={lifecycleActions.confirmDialogAction}
        onCancel={lifecycleActions.dismissDialog}
      />
    </>
  )
}
