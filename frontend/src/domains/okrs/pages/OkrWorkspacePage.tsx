/**
 * @file OkrWorkspacePage
 * @brief OKR 工作台页面组件（供 ActionView 内联渲染）
 *
 * [022] GrowthMenu "OKR工作台" 点击 → ActionView → 本组件。
 * 与 /app/okrs/page.tsx（Next.js 页面路由）渲染同一 OKRWorkspace，
 * 仅 standalone 标记不同（内嵌模式不加 PageBanner）。
 */

"use client"

import { OKRWorkspace } from "@/domains/okrs/components/okr-workspace"

export function OkrWorkspacePage() {
  return (
    <div className="h-full flex flex-col">
      <OKRWorkspace standalone={false} />
    </div>
  )
}
