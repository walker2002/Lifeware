/**
 * @file timeboxes-workspace
 * @brief 时间盒工作台（[023] A2 / [026] A3.2 / [023.03] T3 错误反馈 / [023.03] T4 重命名 /schedule→/timeboxes / [023.13] T7 批量多选+回退确认）
 *
 * 左栏：日期导航 + 当日时间盒列表（DayView 复用），支持创建/编辑/删除/lifecycle。
 * 右栏：Timebox Drawer 挂载点（Variant C v2，T4 实现）。
 * 配色用 CSS 变量令牌（bg-canvas/text-ink/border-hairline）。
 *
 * [023.03] T3：
 * - handleEdit 包 try/catch：getTimeboxById 失败 → toast.error
 * - handleAction 包 try/catch + 处理 needs_confirm → AlertDialog
 * - Drawer 标题前缀 [新建]/[编辑] 区分模式
 *
 * [023.03] T4：route /schedule → /timeboxes 重命名，类型/组件标识同步。
 * 函数名/类型名 改为 TimeboxesWorkspace / TimeboxesEvent；
 * 文件路径在时间盒域内统一为 timeboxes-* 前缀。
 *
 * [026] A3.2：loadDay 改用 Promise.all 并行拉 timebox + appointment，
 * 合并为 TimeboxesEvent[] 后塞给 DayView。
 *
 * [026] codex D5 修复：loadDay **不**调 reconcileAndAdvanceAppointments
 * （避免 /timeboxes 翻日历页重推 N 次 SM）。reconcile 仅在 /appointments
 * 触发。Trade-off：/timeboxes 可能显陈旧状态。可接受 MVP。
 *
 * [023.06] T2：注入视图模式状态 dateMode，渲染 <DateNav> 切换日/周/月。
 * 范围拉取统一用 getDateRange(mode, date)，复用 T1 已抽出的纯函数。
 *
 * [023.06] T3：events 渲染分支改为三向路由（DayView / WeekView / MonthView）。
 * WeekView/MonthView 接收 TimeboxSummary[]，而 workspace 内部 state 是
 * TimeboxesEvent[]（discriminated union），所以在 workspace 里过滤
 * kind='timebox' 转 source 数组传入。appointment 在周/月视图不渲染
 * ——设计如此，时间盒域视图只显示 timebox，约定由 /appointments 域承担。
 *
 * [023.13] T7：批量多选模式 + 一键打卡 + 回退确认弹窗
 * - handleAction union 加 'quickLog'：不开抽屉，simple executionRecord（plannedDuration
 *   按 startTime/endTime 算，actualDuration=plannedDuration，deviation=0）走
 *   transitionTimebox('log', {executionRecord:{...}})，T6 验证 AM1 SM 写入路径
 * - handleAction union 加 'quickLog' 后 action='revert' 改为先查 executionRecord：
 *   logged+executionRecord → 弹 AlertDialog 二次确认（确认后调 revertTimebox
 *   传 {clearExecutionRecord:true}，复用 T5 P3 AM3 updateFields 路径），
 *   cancelled → 直接 revertTimebox()（无 executionRecord 守卫自动过）
 * - selectMode state（不持久化，刷新重置）+ selectedIds state + handleBatch 串行 await
 *   + 顶栏 [多选] toggle + 底部批量操作栏（已选 N 时显示）
 */

'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { usePathname } from 'next/navigation'
import { DayView } from './day-view'
import { WeekView } from './week-view'
import { MonthView } from './month-view'
import { DateNav } from './date-nav'
import { TimeboxDrawer, type DrawerMode } from './timebox-drawer'
import { transitionTimebox, getTimeboxById, revertTimebox, deleteTimebox } from '@/app/actions/timebox'
import { getTimeboxesByRange, getAppointmentsByRange } from '@/app/actions/intent'
import { mergeEvents, type TimeboxesEvent } from './timeboxes-event'
import { Button } from '@/components/ui/button'
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader,
  AlertDialogTitle, AlertDialogDescription,
  AlertDialogFooter, AlertDialogCancel, AlertDialogAction,
} from '@/components/ui/alert-dialog'
import { EmptyState } from '@/components/empty-state'
import { Plus, CalendarOff, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
// [028] T9：workspace 入口 — ScheduleProposal surface 组件（替代 [023.08] CreateSmartTimebox；
//   CreateSmartTimebox 仅保留为 client 注册 `create-smart-timebox` surface 用作 revertSmartTimeboxes 撤销面板）
import { ScheduleProposal } from '@/domains/timebox/cnui/surfaces/ScheduleProposal'
import { submitDynamicIntent, submitCnuiSurface } from '@/app/actions/intent'
// [023.06] C1 fix: getDateRange/navigateDate 复用 hooks/use-timebox.ts 的 export，
// 删本地副本避免行为漂移（plan T1 Step 3 约束）。
import { getDateRange, navigateDate } from '@/hooks/use-timebox'
import type { Timebox } from '@/usom/types/objects'
import type { TimeboxSummary } from '@/usom/types/summaries'
import type { DateViewMode } from './types'

const MVP_USER_ID = '00000000-0000-0000-0000-000000000001'

interface DrawerState {
  mode: DrawerMode
  editTarget?: Timebox
}

/** [023.03] T3：needs_confirm 二次确认弹窗内容 */
interface ConfirmState {
  message: string
  /** 确认后的执行动作（已携带 confirmed=true） */
  action: () => Promise<void>
}

export function TimeboxesWorkspace() {
  // [023.06] T2：视图模式 state + 当前浏览日期
  const [dateMode, setDateMode] = useState<DateViewMode>('day')
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date())
  const [dateLoadKey, setDateLoadKey] = useState(0) // 触发 reload（避免 compare 不全）
  const [events, setEvents] = useState<TimeboxesEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [drawer, setDrawer] = useState<DrawerState | null>(null)
  // [023.03] T3：needs_confirm AlertDialog 状态
  const [confirming, setConfirming] = useState<ConfirmState | null>(null)
  const [actionSubmitting, setActionSubmitting] = useState(false)
  // [023.08] T5：AI 编排 panel — workspace 入口按钮 + 弹出面板
  const [aiPanelOpen, setAiPanelOpen] = useState(false)
  // AI panel 状态：proposals（来自 mock LLM provider 或 orchestration handler，本任务用静态占位）
  const [aiProposals, setAiProposals] = useState<Array<{ id: string; title: string; startTime: string; endTime: string }>>([])
  // revertableBatches（来自 cnui handler open 调用 getRevertableBatches）
  const [revertableBatches, setRevertableBatches] = useState<Array<{ batchId: string; acceptedAt: number; count: number }>>([])
  // [023.13] T7：批量多选模式 + 回退确认弹窗 state
  const [selectMode, setSelectMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<string[]>([])
  // 回退确认：logged + executionRecord 时弹窗让用户显式确认清空执行记录
  const [revertConfirm, setRevertConfirm] = useState<{ id: string } | null>(null)

  // [023.06] T2：范围拉取（替代 loadDay，行为对齐 T1 getDateRange）
  // [023.12] T14 fix: pathname 守卫 —— workspace 只在 /timeboxes（或含时间盒主区）挂载
  //   拉取。其他路径下的 mount（如挂在共享 layout 时）是 HMR/Next devtools 副作用，
  //   catch 静默 no-op，避免 [TimeboxesWorkspace] 加载失败 噪声日志误以为真错。
  const pathname = usePathname()
  const isWorkspaceRoute = pathname?.startsWith('/timeboxes') ?? false
  const loadRange = useCallback(async (mode: DateViewMode, d: Date) => {
    setLoading(true)
    try {
      const { start, end } = getDateRange(mode, d)
      const [timeboxList, appointmentList] = await Promise.all([
        getTimeboxesByRange(start, end),
        getAppointmentsByRange(start, end),
      ])
      setEvents(mergeEvents(timeboxList, appointmentList))
    } catch (e) {
      // 仅在 workspace 路由下才报可见错误；非 workspace 路由（layout 误挂载）静默 no-op
      if (isWorkspaceRoute) {
        console.error('[TimeboxesWorkspace] 加载失败', e)
      }
    } finally {
      setLoading(false)
    }
  }, [isWorkspaceRoute])

  useEffect(() => {
    loadRange(dateMode, currentDate)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateMode, currentDate, dateLoadKey])

  // [023.06] T2：DateNav 上 / 下导航（按当前 mode 步进日/周/月）
  const handleNavigate = useCallback((direction: 'prev' | 'next') => {
    setCurrentDate(prev => navigateDate(dateMode, prev, direction))
  }, [dateMode])

  // [023.06] T2：DateNav 切换视图模式
  const handleDateModeChange = useCallback((newMode: DateViewMode) => {
    if (newMode === dateMode) return
    setDateMode(newMode)
  }, [dateMode])

  // [023.06] T2：DayView mini-calendar 选日期 → 切回日视图并跳到该日
  const handleDateSelect = useCallback((d: Date) => {
    setCurrentDate(d)
    setDateMode('day')
  }, [])

  // [023.06] T3：WeekView/MonthView 的 props 是 TimeboxSummary[]；
  // workspace 内部 state 是 TimeboxesEvent[]（discriminated union）。
  // 在 workspace 里把 events 过滤 kind='timebox' 转 source 数组传——
  // appointment 在周/月视图不渲染（设计如此；时间盒域视图只显 timebox）。
  const timeboxSources = useMemo(
    () =>
      events
        .filter(
          (e): e is Extract<TimeboxesEvent, { kind: 'timebox' }> => e.kind === 'timebox',
        )
        .map((e) => e.source),
    [events],
  )

  /**
   * [023.03] T3 / [023.12] T8 / [023.13] T7：handleAction 包 try/catch + 处理 needs_confirm AlertDialog
   *
   * [023.12] T8 扩展：
   * - 新增 'revert' / 'delete' 动作（取代旧 start/end 流程）
   * - 'revert' 走 revertTimebox（[AM7] executionRecord 守卫：守卫命中会 throw
   *   '请先清理执行记录再回退'，catch 内 toast.error 提示）
   * - 'delete' 走 deleteTimebox（仅 planned 可用；其他状态 throw）
   *
   * [023.13] T7 扩展：
   * - 新增 'quickLog' 动作（planned 卡一键 simple 打卡，不开 Drawer）。
   *   走 transitionTimebox('log', {executionRecord:{simple + plannedDuration/0 偏差/...}})，
   *   T6 验证 AM1 SM 写入路径。plannedDuration 按 startTime/endTime 算分钟，
   *   actualDuration=plannedDuration，deviation=0（按时完成假设）。
   * - 'revert' 流程改为：查 events 拿该 timebox 的 executionRecord；
   *   有值 → 弹 AlertDialog 二次确认（确认后走 revertTimebox(id, {clearExecutionRecord:true}，
   *   复用 T5 P3 AM3 updateFields 路径）；无值（cancelled 状态）→ 直接 revertTimebox()。
   */
  const handleAction = useCallback(async (
    timeboxId: string,
    action: 'start' | 'end' | 'cancel' | 'log' | 'quickLog' | 'revert' | 'delete' | 'viewLog',
  ) => {
    setActionSubmitting(true)
    try {
      if (action === 'revert') {
        // [023.13] T7：logged + executionRecord → 弹窗确认清空；cancelled → 直接 revert
        const tb = events.find(
          (e): e is Extract<TimeboxesEvent, { kind: 'timebox' }> =>
            e.kind === 'timebox' && e.source.id === timeboxId,
        )?.source
        if (tb?.executionRecord) {
          setRevertConfirm({ id: timeboxId })
          return
        }
        await revertTimebox(timeboxId)
        toast.success('已回退为已规划')
        await loadRange(dateMode, currentDate)
        return
      }
      if (action === 'delete') {
        // [023.12] T8：deleteTimebox 仅 planned 可用（其他状态 SM/守卫会 throw）
        await deleteTimebox(timeboxId)
        toast.success('已删除时间盒')
        await loadRange(dateMode, currentDate)
        return
      }
      if (action === 'viewLog') {
        // viewLog 是只读跳转，workspace 端不处理（由父级面板接管）
        return
      }
      // [023.13] T7：quickLog 一键 simple 打卡（不开 Drawer）
      if (action === 'quickLog') {
        const tb = events.find(
          (e): e is Extract<TimeboxesEvent, { kind: 'timebox' }> =>
            e.kind === 'timebox' && e.source.id === timeboxId,
        )?.source
        if (!tb) {
          toast.error('未找到该时间盒')
          return
        }
        const plannedDuration = Math.max(
          0,
          Math.round(
            (new Date(tb.endTime).getTime() - new Date(tb.startTime).getTime()) / 60000,
          ),
        )
        const r = await transitionTimebox(timeboxId, 'log', {
          executionRecord: {
            mode: 'simple',
            completionStatus: 'completed',
            actualDuration: plannedDuration,
            plannedDuration,
            deviationMinutes: 0,
            sourceType: 'timebox',
            loggedAt: new Date().toISOString(),
          },
        })
        if (r.status === 'ok') {
          toast.success('已打卡')
          await loadRange(dateMode, currentDate)
          return
        }
        if (r.status === 'needs_confirm') {
          // quickLog 一般不会撞 needs_confirm（logged 已是终态），但 SM 兜底提示
          toast.error(r.message ?? '需要确认')
          return
        }
        return
      }
      // [023.13] QA BUG #3 fix：'log' (打卡) 不直接 transition，而是打开 TimeboxDrawer
      // edit 模式，让用户填 ExecutionDetailFields（actualStartTime/endTime/focusMinutes/
      // energyActual/notes）。drawer save handler 按 hasExecDetail 走 detailed log，
      // 否则 simple log。直接 simple log 改由 quickLog 一键完成。
      if (action === 'log') {
        const tb = events.find(
          (e): e is Extract<TimeboxesEvent, { kind: 'timebox' }> =>
            e.kind === 'timebox' && e.source.id === timeboxId,
        )?.source
        if (!tb) {
          toast.error('未找到该时间盒')
          return
        }
        await handleEdit(tb)
        return
      }
      // [023.03] T3 旧路径：start/end/cancel 走 transitionTimebox + needs_confirm
      const r = await transitionTimebox(timeboxId, action, {}, false)
      if (r.status === 'ok') {
        await loadRange(dateMode, currentDate)
        return
      }
      if (r.status === 'needs_confirm') {
        setConfirming({
          message: r.message,
          action: async () => {
            // 二次确认：用 confirmed=true 再调一次；二次调用 SM 应当返回 ok，不再开 confirm
            await transitionTimebox(timeboxId, action, {}, true)
            await loadRange(dateMode, currentDate)
          },
        })
        return
      }
      // 未知 status（防御性提示）
      toast.error('操作未完成')
    } catch (e) {
      console.error('[TimeboxesWorkspace.handleAction] failed', e)
      // [023.12] T8 [AM7]：revertTimebox 守卫错误信息透传
      toast.error(`操作失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setActionSubmitting(false)
    }
  }, [dateMode, currentDate, loadRange, events])

  /**
   * [023.13] T7：批量多选 toggle 切换 + 批量操作
   * - handleToggleSelect：单 id 切换（已选剔除/未选加入）
   * - handleBatch：遍历 selectedIds 顺序 await transitionTimebox(id, action, ...)
   *   聚合成功/失败计数；MVP 串行可接受（小 N），大 N 优化留 P1 债。
   * - 退出多选时清空 selectedIds（避免下次进选状态残留）
   */
  const handleToggleSelectMode = useCallback(() => {
    setSelectMode(prev => {
      if (prev) setSelectedIds([])
      return !prev
    })
  }, [])

  const handleToggleSelect = useCallback((id: string) => {
    setSelectedIds(prev => (prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]))
  }, [])

  const handleBatch = useCallback(async (batchAction: 'log' | 'cancel') => {
    if (selectedIds.length === 0) return
    // 仅 planned 卡参与批量（其他状态过滤：cancelled/logged 单卡已有专属按钮）
    const findTimebox = (id: string) =>
      events.find(
        (e): e is Extract<TimeboxesEvent, { kind: 'timebox' }> =>
          e.kind === 'timebox' && e.source.id === id,
      )?.source
    const plannedIds = selectedIds.filter((id) => findTimebox(id)?.status === 'planned')
    if (plannedIds.length === 0) {
      toast.error('所选时间盒无可批量操作的状态')
      return
    }
    setActionSubmitting(true)
    let successCount = 0
    let failCount = 0
    try {
      for (const id of plannedIds) {
        try {
          if (batchAction === 'cancel') {
            const r = await transitionTimebox(id, 'cancel', {}, false)
            if (r.status === 'ok') successCount++
            else failCount++
          } else {
            // 批量 log 走 simple 模式（同 quickLog）：plannedDuration 来自 timebox 自身
            const tb = findTimebox(id)
            if (!tb) {
              failCount++
              continue
            }
            const plannedDuration = Math.max(
              0,
              Math.round(
                (new Date(tb.endTime).getTime() - new Date(tb.startTime).getTime()) / 60000,
              ),
            )
            const r = await transitionTimebox(id, 'log', {
              executionRecord: {
                mode: 'simple',
                completionStatus: 'completed',
                actualDuration: plannedDuration,
                plannedDuration,
                deviationMinutes: 0,
                sourceType: 'timebox',
                loggedAt: new Date().toISOString(),
              },
            })
            if (r.status === 'ok') successCount++
            else failCount++
          }
        } catch (e) {
          console.error('[TimeboxesWorkspace.handleBatch] item failed', id, e)
          failCount++
        }
      }
      if (successCount > 0) {
        toast.success(
          batchAction === 'log'
            ? `已批量打卡 ${successCount} 个${failCount > 0 ? `（${failCount} 失败）` : ''}`
            : `已批量取消 ${successCount} 个${failCount > 0 ? `（${failCount} 失败）` : ''}`,
        )
      } else {
        toast.error('批量操作全部失败')
      }
      await loadRange(dateMode, currentDate)
      setSelectedIds([])
    } finally {
      setActionSubmitting(false)
    }
  }, [selectedIds, events, dateMode, currentDate, loadRange])

  /**
   * [023.08] T5：AI 智能推荐入口 — 打开 AI panel
   * - 拉取当前 session 5 分钟内可 revert 的 batches（T4 已有 getRevertableBatches 路径，
   *   但本任务直接保留 state 由 surface submit 后刷新 — 简化实现）
   * - 生成 mock proposals（等待 [023.08] T1 mock LLM provider + T3 orchestration-handler 接入；
   *   本任务 T5 阶段用静态占位 3 条 simulation proposals — 给 E2E 一个稳定的 selector target）
   */
  const openAiPanel = useCallback(() => {
    // [023.08] T5 [F5 fold]: workspace AI 入口触发（data-testid=ai-orchestrate-button 在按钮上）
    //   proposals 静态填充：3 条「主题 + 间隔」proposal 占位（编排逻辑由 orchestration handler 接入时替换）
    const todayLocal = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' })
    void todayLocal // proposals 使用 HH:MM 占位；表内具体 ISO convert 由 handler 端 T2 ISO convert 处理
    setAiProposals([
      { id: 'p-sim-1', title: '深度专注: 上午核心工作', startTime: '09:00', endTime: '11:00' },
      { id: 'p-sim-2', title: '协作: 午后站会同步', startTime: '14:00', endTime: '15:00' },
      { id: 'p-sim-3', title: '复盘: 收尾整理', startTime: '16:30', endTime: '17:00' },
    ])
    setAiPanelOpen(true)
  }, [])

  /**
   * [023.08] T5：AI panel 接受 → 走 submitDynamicIntent → handler 已支持 _source='createSmartTimebox'
   *   触发 recordBatchProposals 写入真实 timebox ids（T4 placeholder 修复）。
   * AI panel 撤销 → 走 submitDynamicIntent('timebox', 'createSmartTimeboxes') 路径
   *   (handler 在 createSmartTimeboxes 分支保留旧 stub 已废弃 — 见 handler 注释)。
   *   实际生产实现：[023.10] 抽 batch-revert server action，本任务先以 placeholder 提示前端。
   */
  const handleAiConfirm = useCallback(async (data: Record<string, unknown>) => {
    const action = data.action as string
    if (!action) return
    try {
      setActionSubmitting(true)
      if (action === 'revertSmartTimeboxes') {
        // [023.10] T1 — workspace revert 真 wire 到 submitCnuiSurface（取代 [023.08] placeholder toast）
        // 关联：[023.08] P0 (4d6e7ca) 同源路由错配 — accept 已修，revert 仍 placeholder。
        // cnui/handlers.ts:revertSmartTimeboxes 分支（line 452-482）只在 submitCnuiSurface 路由下可达：
        //   迭代 revertBatchProposals 内部 items[] → EpisodeRepository.markReverted → 逐条 deleteTimebox。
        // batchId 优先取自 surface 上送的 data.fields.batchId（避免 stale closure 陷阱，
        //   handleAiConfirm deps 缺 revertableBatches 会导致旧 closure 读到 []）。
        const fields = (data.fields ?? {}) as { batchId?: string }
        const firstBatch = revertableBatches[0]
        const batchId = fields.batchId ?? firstBatch?.batchId
        if (!batchId) {
          toast.error('无可撤销批次')
          return
        }
        const result = await submitCnuiSurface(
          '',  // cnuiSurfaceId — ignored by handler
          'timebox',
          'revertSmartTimeboxes',
          { batchId },
        )
        // 清空本地状态 + 刷新（与原 placeholder 行为一致）
        setRevertableBatches([])
        await loadRange(dateMode, currentDate)
        if (result.success) {
          toast.success('已撤销最近批次')
        } else {
          toast.error(`撤销失败：${result.error ?? '未知错误'}`)
        }
      } else if (action === 'createTimebox') {
        // [023.08] T5 [P0 fix]: 走 submitCnuiSurface (非 submitDynamicIntent) 才能路由到
        //   cnui/handlers.ts createTimebox submit branch — 该 branch 迭代 items[]、
        //   HH:MM→ISO convert、调 submitDynamicIntent 单条、记录 batch (recordBatchProposals)。
        //   submitDynamicIntent 走 SM 契约路径期望单条 timebox 顶层字段,会拒绝 { items } 格式。
        const fields = (data.fields ?? {}) as Record<string, unknown>
        const result = await submitCnuiSurface(
          '',  // cnuiSurfaceId — ignored by handler
          'timebox',
          'createTimebox',
          fields,
        )
        if (result.success) {
          await loadRange(dateMode, currentDate)
          setAiPanelOpen(false)
          // submitCnuiSurface 把 handler.submit 返回的 result.data spread 到顶层,
          // 所以 batchId 直接可读 (来自 cnui/handlers.ts:408 data.batchId)
          const batchId = (result as { batchId?: string }).batchId
          if (batchId) {
            const items = (fields.items as unknown[]) ?? []
            setRevertableBatches([{ batchId, acceptedAt: Date.now(), count: items.length }])
          }
        } else {
          toast.error(`创建失败：${result.error ?? '未知错误'}`)
        }
      }
    } catch (e) {
      console.error('[TimeboxesWorkspace.handleAiConfirm] failed', e)
      toast.error(`AI panel 操作失败：${e instanceof Error ? e.message : String(e)}`)
    } finally {
      setActionSubmitting(false)
    }
  }, [dateMode, currentDate, loadRange, revertableBatches])

  /** [023.03] T3：handleEdit 包 try/catch + 视觉强化（标题前缀在 Drawer 内已实现） */
  const handleEdit = useCallback(async (summary: TimeboxSummary) => {
    try {
      const tb = await getTimeboxById(summary.id)
      if (!tb) {
        toast.error('未找到该时间盒')
        return
      }
      setDrawer({ mode: 'edit', editTarget: tb })
    } catch (e) {
      console.error('[TimeboxesWorkspace.handleEdit] failed', e)
      toast.error(`加载时间盒失败：${e instanceof Error ? e.message : String(e)}`)
    }
  }, [])

  return (
    <div className="flex h-full">
      {/* 左栏：当日时间盒列表 */}
      <div className="flex-1 flex flex-col min-h-0">
        {/* [023.03] UI 统一：去重标题。PageBanner 已在主页 context 显示"我的时间盒"，
            独立 /timeboxes 路由的 PageBanner 同样提供标题。本组件不再重复。 */}
        <div className="flex items-center justify-between gap-4 border-b border-hairline px-4 py-3">
          {/* [023.06] T2：顶栏左侧 DateNav 视图模式切换 */}
          <DateNav
            mode={dateMode}
            currentDate={currentDate}
            onModeChange={handleDateModeChange}
            onNavigate={handleNavigate}
          />
          <div className="flex items-center gap-2">
            {/* [023.13] T7：批量多选 toggle（进入多选模式时按钮高亮） */}
            <Button
              size="sm"
              variant={selectMode ? 'default' : 'outline'}
              data-testid="batch-toggle-btn"
              onClick={handleToggleSelectMode}
            >
              {selectMode ? '退出多选' : '多选'}
            </Button>
            {/* [023.08] T5 [F5 fold]: AI 智能推荐入口（data-testid 给 E2E + 验证测试用） */}
            <Button
              size="sm"
              variant="outline"
              data-testid="ai-orchestrate-button"
              onClick={openAiPanel}
            >
              <Sparkles className="mr-1 size-4" />
              AI 智能推荐
            </Button>
            <Button size="sm" onClick={() => setDrawer({ mode: 'create' })}>
              <Plus className="size-4 mr-1" />新建时间盒
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            // [023.12] T14 fix: 加载占位明确标 "加载中…"，避免与空卡片视觉混淆
            //   原 h-16 bg-surface-card animate-pulse 在 /qa 截图里被误判为「空时间盒卡」。
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-sm text-body/70">
              <div className="size-6 animate-spin rounded-full border-2 border-hairline border-t-primary" />
              <span>加载中…</span>
            </div>
          ) : dateMode === 'day' ? (
            events.length === 0 ? (
              <EmptyState
                icon={CalendarOff}
                title="今天还没有时间盒"
                description="创建一个时间盒，开始专注执行"
                action={{ label: '新建一个', onClick: () => setDrawer({ mode: 'create' }) }}
              />
            ) : (
              <DayView
                events={events}
                currentDate={currentDate}
                onDateSelect={handleDateSelect}
                onAction={(id, action) => handleAction(id, action as 'start' | 'end' | 'cancel' | 'log' | 'quickLog' | 'revert' | 'delete' | 'viewLog')}
                onEdit={handleEdit}
                selectMode={selectMode}
                selectedIds={selectedIds}
                onToggleSelect={handleToggleSelect}
              />
            )
          ) : (
            // [023.06] T3 三向路由 — 周/月视图
            timeboxSources.length === 0 ? (
              <p className="py-8 text-center text-sm text-body/70">
                该{dateMode === 'week' ? '周' : '月'}暂无时间盒
              </p>
            ) : dateMode === 'week' ? (
              <WeekView timeboxes={timeboxSources} currentDate={currentDate} />
            ) : (
              <MonthView timeboxes={timeboxSources} currentDate={currentDate} />
            )
          )}
        </div>
        {/* [023.13] T7：批量操作底栏（selectMode + 已选 N > 0 时显示） */}
        {selectMode && (
          <div
            data-testid="batch-action-bar"
            className="flex items-center justify-between gap-2 border-t border-hairline px-4 py-2 bg-surface-card"
          >
            <span className="text-xs text-body">
              已选 <span data-testid="batch-count" className="font-medium text-ink">{selectedIds.length}</span> 个
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                disabled={selectedIds.length === 0 || actionSubmitting}
                onClick={() => handleBatch('log')}
                data-testid="batch-log-btn"
              >
                批量打卡
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-body"
                disabled={selectedIds.length === 0 || actionSubmitting}
                onClick={() => handleBatch('cancel')}
                data-testid="batch-cancel-btn"
              >
                批量取消
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* 右栏：Drawer（T4 实现，由 drawer 状态控制开关） */}
      {drawer && (
        <TimeboxDrawer
          mode={drawer.mode}
          editTarget={drawer.editTarget}
          date={currentDate}
          onClose={() => setDrawer(null)}
          onSaved={() => { setDrawer(null); loadRange(dateMode, currentDate) }}
        />
      )}

      {/* [023.08] T5 [F5 fold]: AI 智能推荐 panel — 右栏 Drawer 同位 420px 浮层 */}
      {aiPanelOpen && (
        <aside
          className="flex w-[420px] flex-col border-l border-hairline bg-canvas"
          data-testid="ai-panel-overlay"
        >
          <div className="flex items-center justify-between border-b border-hairline px-4 py-3">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              <h2 className="text-sm font-medium text-ink">AI 智能推荐</h2>
            </div>
            <button
              type="button"
              data-testid="ai-panel-close"
              onClick={() => setAiPanelOpen(false)}
              className="text-xs text-body hover:text-ink"
            >
              关闭
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <ScheduleProposal
              surfaceType="schedule-proposal"
              dataModel={{
                proposals: aiProposals,
                revertableBatches,
              }}
              onDataChange={() => undefined}
              onConfirm={handleAiConfirm}
              onCancel={() => setAiPanelOpen(false)}
              isLoading={actionSubmitting}
            />
          </div>
        </aside>
      )}

      {/* [023.03] T3：needs_confirm 二次确认 AlertDialog */}
      <AlertDialog open={!!confirming} onOpenChange={o => { if (!o) setConfirming(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认操作</AlertDialogTitle>
            <AlertDialogDescription>{confirming?.message}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionSubmitting}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={actionSubmitting}
              onClick={async () => {
                const a = confirming?.action
                setConfirming(null)
                if (a) await a()
              }}
            >
              {actionSubmitting ? '处理中...' : '确认'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* [023.13] T7：logged + executionRecord 回退二次确认 AlertDialog
          - 复用 P3 AM3 updateFields 路径：确认后调 revertTimebox(id, {clearExecutionRecord:true})
          - 取消按钮 disabled 时防双击（actionSubmitting）
          - 关闭（点空白 / Esc）只清 state，不调任何 revert（按 brief） */}
      <AlertDialog
        open={!!revertConfirm}
        onOpenChange={o => { if (!o) setRevertConfirm(null) }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认回退</AlertDialogTitle>
            <AlertDialogDescription>
              此操作将清除该时间盒的执行记录（实际时长、深度专注、能量消耗、执行详情），不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={actionSubmitting}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={actionSubmitting}
              data-testid="revert-confirm-btn"
              onClick={async () => {
                const id = revertConfirm?.id
                setRevertConfirm(null)
                if (!id) return
                setActionSubmitting(true)
                try {
                  await revertTimebox(id, { clearExecutionRecord: true })
                  toast.success('已回退为已规划')
                  await loadRange(dateMode, currentDate)
                } catch (e) {
                  toast.error(`操作失败：${e instanceof Error ? e.message : String(e)}`)
                } finally {
                  setActionSubmitting(false)
                }
              }}
            >
              {actionSubmitting ? '处理中...' : '确认回退'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}