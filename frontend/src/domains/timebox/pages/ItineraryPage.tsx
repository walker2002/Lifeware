/**
 * @file ItineraryPage
 * @brief 行程管理页面（供 ActionView 内联渲染，[026] viewItineraries 路由补齐）
 *
 * 成长领域菜单「时间盒 / 行程管理」点击 → handleGrowthAction('timebox', 'viewItineraries') →
 * setMainViewState({type:'action', domainId:'timebox', action:'viewItineraries'}) →
 * ActionView → 本组件。
 *
 * 与 /app/itineraries/page.tsx（Next.js 页面路由）渲染同一 ItineraryWorkspace：
 * - 独立 route 走 server component（首屏直出，reconcileAndAdvanceItineraries + getItinerariesByRange）
 * - 本组件走 client 懒加载 fetch（同 TimeboxTemplatesPage 范式），用于主框架内嵌
 *
 * 设计约束：SSOT 来自 manifest.yaml intent_triggers.viewItineraries（response_type: page）。
 * ActionView 的 VIEW_PAGE_COMPONENTS 路由表必须把 timebox.viewItineraries → 本组件，
 * 否则 GrowthMenu 点击会落到 "页面未找到" 占位文本（已修）。
 *
 * [026] D2 reversal：client 端调 getItinerariesByRange 同样纯读（D5 修复），
 * reconcile 不在 read 路径触发（由 /itineraries 独立 route server 加载时调）。
 * 因此经 GrowthMenu 进入时 status 可能是「过日未推进」的旧值（与独立 route 行为差异），
 * 这是 SSOT 路径选择：GrowthMenu = 快速进入（无 reconcile），独立 route = 完整路径（含 reconcile）。
 */

"use client"

import { useEffect, useState } from 'react'
import { ItineraryWorkspace } from '@/domains/timebox/components/itinerary-workspace'
import { getItinerariesByRange } from '@/app/actions/intent'
import type { ItinerarySummary } from '@/usom/types/summaries'

export function ItineraryPage() {
  const [items, setItems] = useState<ItinerarySummary[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    // 与 /app/itineraries/page.tsx 保持窗口一致：过去 7 天 + 未来 90 天
    const start = new Date()
    start.setDate(start.getDate() - 7)
    const end = new Date()
    end.setDate(end.getDate() + 90)
    getItinerariesByRange(start, end)
      .then(list => {
        if (cancelled) return
        setItems(list)
      })
      .catch((e: unknown) => {
        if (cancelled) return
        setError(e instanceof Error ? e.message : '加载行程失败')
      })
    return () => { cancelled = true }
  }, [])

  if (error) {
    return (
      <div className="p-4">
        <p className="text-sm text-body">行程加载失败：{error}</p>
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
      <ItineraryWorkspace initialItems={items} />
    </div>
  )
}
