/**
 * @file page
 * @brief /timeboxes 独立页面路由（[023] A2 + [023.03] T4 重命名自 /schedule）
 *
 * 手写 Next.js page route（不走 codegen）。h-screen 锚定视口，避免内层
 * overflow-y-auto 因缺高度天花板失效（参 app/okrs/page.tsx 同款约束）。
 */

import { TimeboxesWorkspace } from '@/domains/timebox/components/timeboxes-workspace'

export default async function TimeboxesPage() {
  return (
    <div className="h-screen flex flex-col">
      <TimeboxesWorkspace />
    </div>
  )
}