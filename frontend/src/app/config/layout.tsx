/**
 * @file layout
 * @brief Config 共享 layout — 最小化（无顶部导航/侧栏，纯内容）
 */
import type { ReactNode } from 'react'

export default function ConfigLayout({ children }: { children: ReactNode }) {
  return (
    <div className="h-full flex flex-col bg-canvas">
      <header className="flex items-center gap-4 px-6 py-4 border-b border-border">
        <h1 className="text-lg font-semibold text-ink">配置管理</h1>
        <span className="text-sm text-muted-foreground">Activity Archetype 活动原型词典</span>
      </header>
      <main className="flex-1 overflow-auto px-6 py-4">
        {children}
      </main>
    </div>
  )
}