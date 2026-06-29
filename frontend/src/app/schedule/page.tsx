/**
 * @file page
 * @brief /schedule 独立页面路由（[023] A2，参 022 OKRWorkspace standalone）
 *
 * 手写 Next.js page route（不走 codegen）。h-screen 锚定视口，避免内层
 * overflow-y-auto 因缺高度天花板失效（参 app/okrs/page.tsx 同款约束）。
 */

import { ScheduleWorkspace } from '@/domains/timebox/components/schedule-workspace'

export default async function SchedulePage() {
  return (
    <div className="h-screen flex flex-col">
      <ScheduleWorkspace />
    </div>
  )
}