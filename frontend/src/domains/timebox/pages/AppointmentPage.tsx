/**
 * @file AppointmentPage
 * @brief 约定管理页面（供 ActionView 内联渲染，[026] viewAppointments 路由补齐 / [023.05] PR2 T9 itinerary→appointment）
 *
 * 成长领域菜单「时间盒 / 约定管理」点击 → handleGrowthAction('timebox', 'viewAppointments') →
 * setMainViewState({type:'action', domainId:'timebox', action:'viewAppointments'}) →
 * ActionView → 本组件。
 *
 * 与 /app/appointments/page.tsx（Next.js 页面路由）渲染同一 AppointmentWorkspace：
 * - 独立 route 走 server component（首屏直出，reconcileAndAdvanceAppointments + getAppointmentsByRange）
 * - 本组件走 client 懒加载 fetch（同 TimeboxTemplatesPage 范式），用于主框架内嵌
 *
 * 设计约束：SSOT 来自 manifest.yaml intent_triggers.viewAppointments（response_type: page）。
 * ActionView 的 VIEW_PAGE_COMPONENTS 路由表必须把 timebox.viewAppointments → 本组件，
 * 否则 GrowthMenu 点击会落到 "页面未找到" 占位文本（已修）。
 *
 * [023.12] T5: 3 态收敛后无 reconcile 写库路径——约定显示状态 badge
 * （in_progress / expired）由客户端读 appointments + now 派生
 * （status/derive-display-status.ts + status/reconcile-appointment.ts）。
 */

"use client"

import { useEffect, useState } from 'react'
import { AppointmentWorkspace } from '@/domains/timebox/components/appointment-workspace'
import { getAppointmentsByRange } from '@/app/actions/intent'
import type { AppointmentSummary } from '@/usom/types/summaries'

export function AppointmentPage() {
  const [items, setItems] = useState<AppointmentSummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    // 与 /app/appointments/page.tsx 保持窗口一致：过去 7 天 + 未来 90 天
    const start = new Date()
    start.setDate(start.getDate() - 7)
    const end = new Date()
    end.setDate(end.getDate() + 90)
    getAppointmentsByRange(start, end)
      .then(list => {
        if (cancelled) return
        setItems(list)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : '加载约定失败')
      })
    return () => { cancelled = true }
  }, [])

  if (error) {
    return (
      <div className="p-4">
        <p className="text-sm text-body">约定加载失败：{error}</p>
      </div>
    )
  }
  if (items === null) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-32 rounded bg-hairline animate-pulse" />
      </div>
    )
  }
  return (
    <div className="h-screen flex flex-col">
      <AppointmentWorkspace initialItems={items} />
    </div>
  )
}
