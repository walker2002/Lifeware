/**
 * @file TaskTreePage
 * @brief 任务树页面
 *
 * 左侧：主线列表 + 筛选；右侧：选中主线的任务树（可嵌套展开）
 */

'use client'

/**
 * 任务树页面组件
 * @description 三栏布局：主线列表 + 任务树
 */
export default function TaskTreePage() {
  return (
    <div className="flex h-full">
      {/* 左侧：主线列表 */}
      <aside className="w-64 border-r border-border bg-canvas-subtle">
        <div className="p-4">
          <h2 className="text-lg font-semibold text-ink">主线</h2>
          {/* TODO: 主线列表组件 */}
        </div>
      </aside>

      {/* 右侧：任务树 */}
      <main className="flex-1 p-4">
        <h2 className="text-lg font-semibold text-ink">任务树</h2>
        {/* TODO: 任务树组件 */}
      </main>
    </div>
  )
}
