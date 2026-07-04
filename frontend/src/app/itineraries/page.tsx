/**
 * @file page
 * @brief /itineraries 独立页面路由（[026] A3）
 *
 * 手写 Next.js page route（不走 codegen）。h-screen 锚定视口，避免内层
 * overflow-y-auto 因缺高度天花板失效（参 app/timeboxes/page.tsx 同款约束）。
 *
 * [026] D2 reversal: server component 加载时调 reconcileAndAdvanceItineraries
 *   推进非终态行程。零 cron、零后台 job —— reconcile 是 page-level caller
 *   显式触发的入口（参 actions/reconcile-itineraries.ts 注释）。
 */
import { reconcileAndAdvanceItineraries } from '@/app/actions/reconcile-itineraries'
import { getItinerariesByRange } from '@/app/actions/intent'
import { ItineraryWorkspace } from '@/domains/timebox/components/itinerary-workspace'

// 多租户 T-02: MVP 阶段单用户占位（与 __tests__/seed-mvp-user.test.ts 同源）
const MVP_USER_ID = '00000000-0000-0000-0000-000000000001' as const

export default async function ItinerariesPage() {
  // [026] D2 reversal: lazy reconcile 在 server component 加载时触发
  await reconcileAndAdvanceItineraries(MVP_USER_ID)

  // 查询窗口：过去 7 天 + 未来 90 天（A3.1 范式，brief §Step 1 明确）
  const start = new Date()
  start.setDate(start.getDate() - 7)
  const end = new Date()
  end.setDate(end.getDate() + 90)
  const items = await getItinerariesByRange(start, end)

  return (
    <div className="h-screen flex flex-col">
      <ItineraryWorkspace initialItems={items} />
    </div>
  )
}