/**
 * @file timebox-drawer
 * @brief 时间盒抽屉（[023] A2，Variant C v2）
 *
 * 右侧 520px 抽屉（mobile 全屏 bottom sheet — 当前实现为 desktop right，D2 polish 留待 [023] 后续）。
 * 3 模式：create / edit / template-batch（template-batch 当前渲染同 create 骨架，业务逻辑后续接入）。
 * 字段序：标题 → 活动原型(嵌套 sub-card) → 时间 → 备注 → 关联。
 * 提交走 T2 server actions；create 路径 needs_confirm 由 AlertDialog 二次确认。
 *
 * [023] A2 C4：用 components/ui/sheet.tsx（radix Dialog）——自带 focus-trap / scroll-lock /
 * Esc 关闭 / scrim 点击关闭 / slide 动画，弃 [021] TaskCreateDrawer 的手写壳。
 *
 * 设计补丁（outside-voice round 2）：
 *   - OV#P1-#1：handleSubmit 客户端把 duration 折成 endTime（USOM 无 duration 字段）
 *   - OV#P2-#5：needs_confirm 弹窗用 AlertDialog 原语（非手写 modal）
 *   - D6：Drawer 全程 EnergyCost 只读（写入走 executionRecord / logTimebox）
 *   - 设计令牌：bg-surface-card 替代 bg-muted；Loader2 替换「保存中…」文本（§6.7）
 */

'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from '@/components/ui/sheet'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ArchetypePickerCard } from '@/components/archetype/archetype-picker-card'
import {
  ExecutionDetailFields,
  type ExecutionDetailDraft,
} from './execution-detail-fields'
import { getDefaultEnergyActual } from '../lib/get-default-energy-actual'
import {
  createTimebox,
  updateTimebox,
  deleteTimebox,
  transitionTimebox,
  type CreateTimeboxInput,
} from '@/app/actions/timebox'
import { getArchetypeById } from '@/app/actions/activity-archetype'
import type { Timebox } from '@/usom/types/objects'
import type { ActivityArchetype } from '@/usom/activity-archetype/types'

export type DrawerMode = 'create' | 'edit' | 'template-batch'

interface TimeboxDrawerProps {
  mode: DrawerMode
  editTarget?: Timebox
  date: Date
  onClose: () => void
  onSaved: () => void
}

const MODE_TITLE: Record<DrawerMode, string> = {
  create: '新建时间盒',
  edit: '编辑时间盒',
  'template-batch': '从模板批量创建',
}

function toLocalInput(d: Date): string {
  // datetime-local 格式 YYYY-MM-DDTHH:MM
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export function TimeboxDrawer({ mode, editTarget, date, onClose, onSaved }: TimeboxDrawerProps) {
  const [title, setTitle] = useState(editTarget?.title ?? '')
  // [023] A2 final review hot-fix: editTarget 来自 getTimeboxById（runtime USOM 携带 activityArchetypeId），
  // 但 usom/types/objects.ts Timebox 接口本轮未声明该字段（intentional, local change），
  // 运行时数据实际有该字段，用 type narrow 读取而非 cast。
  const [activityArchetypeId, setActivityArchetypeId] = useState<string | undefined>(
    editTarget ? (editTarget as unknown as { activityArchetypeId?: string }).activityArchetypeId : undefined,
  )
  const [startTime, setStartTime] = useState(() => {
    const s = editTarget
      ? new Date(editTarget.startTime)
      : (() => {
          const d = new Date(date)
          d.setHours(9, 0, 0, 0)
          return d
        })()
    return toLocalInput(s)
  })
  const [duration, setDuration] = useState(
    editTarget
      ? Math.round(
          (new Date(editTarget.endTime).getTime() - new Date(editTarget.startTime).getTime()) /
            60000,
        )
      : 60,
  )
  const [notes, setNotes] = useState(editTarget?.notes ?? '')
  const [submitting, setSubmitting] = useState(false)
  const [confirming, setConfirming] = useState<{
    message: string
    action: () => Promise<void>
  } | null>(null)

  // [023.13] AM4 — 打卡专区 state（仅 edit 模式生效）+ archetype 详情 fetch
  const [execDetail, setExecDetail] = useState<ExecutionDetailDraft>({})
  const [archetype, setArchetype] = useState<ActivityArchetype | null>(null)
  useEffect(() => {
    // 仅 edit 模式拉 archetype；fetch 失败/未找到 → null（降级为 undefined 默认能量）
    if (mode !== 'edit' || !activityArchetypeId) {
      setArchetype(null)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const r = await getArchetypeById(activityArchetypeId)
        if (!cancelled) setArchetype(r.success ? r.data ?? null : null)
      } catch {
        if (!cancelled) setArchetype(null)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [mode, activityArchetypeId])
  const defaultEnergyActual = useMemo(
    () => (archetype ? getDefaultEnergyActual(archetype) : undefined),
    [archetype],
  )

  const handleSubmit = useCallback(
    async (confirmed?: boolean) => {
      const trimmed = title.trim()
      if (!trimmed || submitting) return
      setSubmitting(true)
      try {
        const startIso = new Date(startTime).toISOString()
        // OV#P1-#1：把 duration 折成 endTime（USOM 无 duration 字段）
        const endIso = new Date(new Date(startIso).getTime() + duration * 60000).toISOString()

        if (mode === 'edit' && editTarget) {
          // [023.13] AM4 — 打卡专区写入：若 execDetail 任一字段有值 → 走 detailed log 路径，
          // 构造 DetailedExecutionRecord 调 transitionTimebox(..., 'log', { executionRecord })
          // SM 端（state-machine/index.ts）会从 proposal.payload['executionRecord'] 透传并写列。
          const hasExecDetail = Boolean(
            execDetail.actualStartTime ||
              execDetail.actualEndTime ||
              execDetail.focusMinutes !== undefined ||
              execDetail.energyActual !== undefined ||
              execDetail.notes,
          )
          if (hasExecDetail) {
            const plannedMinutes = Math.round(
              (new Date(editTarget.endTime).getTime() - new Date(editTarget.startTime).getTime()) / 60000,
            )
            const actualMinutes =
              execDetail.actualStartTime && execDetail.actualEndTime
                ? Math.round(
                    (Date.parse(execDetail.actualEndTime) - Date.parse(execDetail.actualStartTime)) / 60000,
                  )
                : plannedMinutes
            const detailed = {
              mode: 'detailed' as const,
              completionStatus: 'completed' as const,
              actualDuration: actualMinutes,
              plannedDuration: plannedMinutes,
              deviationMinutes: actualMinutes - plannedMinutes,
              sourceType: 'timebox' as const,
              loggedAt: new Date().toISOString(),
              completionRating: 5,
              actualOutput: '',
              notes: execDetail.notes,
              actualStartTime: execDetail.actualStartTime,
              actualEndTime: execDetail.actualEndTime,
              focusMinutes: execDetail.focusMinutes,
              energyActual: execDetail.energyActual,
            }
            const r = await transitionTimebox(editTarget.id, 'log', { executionRecord: detailed })
            if (r.status !== 'ok') {
              throw new Error('打卡失败')
            }
            toast.success('时间盒已更新并打卡')
            onSaved()
            return
          }
          // 无打卡字段：仅改计划字段（保持原 updateTimebox 路径）
          await updateTimebox(editTarget.id, {
            title: trimmed,
            startTime: startIso,
            endTime: endIso,
            activityArchetypeId,
            notes: notes || undefined,
          })
          toast.success('时间盒已更新')
          onSaved()
          return
        }

        const input: CreateTimeboxInput = {
          title: trimmed,
          startTime: startIso,
          endTime: endIso,
          activityArchetypeId,
          notes: notes || undefined,
        }
        const r = await createTimebox(input, confirmed)
        if (r.status === 'needs_confirm') {
          setConfirming({
            message: r.message,
            action: () => handleSubmit(true),
          })
        } else {
          toast.success('时间盒已创建')
          onSaved()
        }
      } catch (e) {
        console.error('[TimeboxDrawer] 提交失败', e)
        toast.error('保存失败，请重试')
      } finally {
        setSubmitting(false)
      }
    },
    [
      title,
      startTime,
      duration,
      activityArchetypeId,
      notes,
      mode,
      editTarget,
      submitting,
      execDetail,
      onSaved,
    ],
  )

  return (
    <>
      <Sheet open onOpenChange={o => { if (!o) onClose() }}>
        <SheetContent
          side="right"
          className="w-[520px] sm:max-w-[520px] gap-0 p-0"
          aria-label={MODE_TITLE[mode]}
          onKeyDown={e => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleSubmit()
          }}
        >
          <SheetHeader className="flex flex-row items-center justify-between shrink-0 space-y-0 px-5 py-3 border-b border-hairline-soft">
            <SheetTitle className="text-sm font-semibold text-ink">
              {MODE_TITLE[mode]}
            </SheetTitle>
          </SheetHeader>
          <SheetDescription className="sr-only">{MODE_TITLE[mode]}</SheetDescription>

          {/* body：标题 → 活动原型 → 时间 → 备注 → 关联 */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            <div>
              <label className="text-xs text-body mb-1 block">
                标题 <span className="text-error">*</span>
              </label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                autoFocus
                maxLength={100}
                placeholder="例如：专注写作"
                className="h-8 w-full rounded-md border border-hairline bg-canvas px-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-focus-ring"
              />
            </div>

            <ArchetypePickerCard
              value={activityArchetypeId}
              onChange={id => setActivityArchetypeId(id)}
              enableAiMatch
              title={title}
            />

            <div>
              <label className="text-xs text-body mb-1 block">时间</label>
              <div className="flex items-center gap-2">
                <input
                  type="datetime-local"
                  value={startTime}
                  onChange={e => setStartTime(e.target.value)}
                  className="h-8 flex-1 rounded-md border border-hairline bg-canvas px-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-focus-ring"
                />
                <input
                  type="number"
                  min={5}
                  max={480}
                  value={duration}
                  onChange={e => setDuration(Number(e.target.value))}
                  className="h-8 w-20 rounded-md border border-hairline bg-canvas px-2 text-sm text-ink"
                  aria-label="时长分钟"
                />
                <span className="text-xs text-body">分</span>
              </div>
            </div>

            <div>
              <label className="text-xs text-body mb-1 block">备注</label>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder="可选：本次时间盒的目标或上下文"
                className="w-full rounded-md border border-hairline bg-canvas px-2 py-1.5 text-sm text-ink resize-none focus:outline-none focus:ring-2 focus:ring-focus-ring"
              />
            </div>

            {/* [023.13] AM4 — 打卡专区（仅 edit 模式）：实际时间/专注/能量/执行详情 → detailed log */}
            {mode === 'edit' && (
              <ExecutionDetailFields
                value={execDetail}
                onChange={setExecDetail}
                defaultEnergyActual={defaultEnergyActual}
              />
            )}
          </div>

          {/* footer */}
          <div className="shrink-0 border-t border-hairline px-5 py-3 flex items-center justify-between gap-2">
            {mode === 'edit' ? (
              <Button
                variant="destructive"
                size="sm"
                disabled={submitting}
                onClick={async () => {
                  if (!editTarget) return
                  try {
                    const r = await deleteTimebox(editTarget.id)
                    if (r.status === 'ok') {
                      toast.success('时间盒已取消')
                      onSaved()
                    }
                  } catch (e) {
                    // [023] A2 final review hot-fix: OV#8 守卫在 action 内，message 清晰（"已记录/结束"等）
                    toast.error(e instanceof Error ? e.message : '删除失败')
                  }
                }}
              >
                {submitting ? <Loader2 className="size-3 animate-spin" /> : '删除'}
              </Button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              <Button variant="secondary" onClick={onClose}>
                取消
              </Button>
              <Button
                onClick={() => handleSubmit()}
                disabled={!title.trim() || submitting}
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-1 size-3 animate-spin" />
                    保存中
                  </>
                ) : (
                  '保存时间盒'
                )}
              </Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* needs_confirm 二次确认弹窗（仅 create 路径；AlertDialog 原语，OV#P2-#5） */}
      <AlertDialog open={!!confirming} onOpenChange={o => { if (!o) setConfirming(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认创建</AlertDialogTitle>
            <AlertDialogDescription>{confirming?.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                void confirming?.action()
                setConfirming(null)
              }}
            >
              确认
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
