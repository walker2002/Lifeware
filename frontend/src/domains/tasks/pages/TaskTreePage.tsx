/**
 * @file TaskTreePage
 * @brief 任务树页面 — Sprint 1 完整布局
 *
 * 图片横幅 + 左侧主线列表 + 右侧任务树 + 任务/主线详情抽屉 + 响应式移动端。
 */

'use client'

import { useState, useCallback } from 'react'
import { ChevronUp, Plus, PanelLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { PageBanner } from '@/components/layout/page-banner'
import { ThreadListPanel } from '../components/thread-list-panel'
import { TaskTreeView } from '../components/task-tree-view'
import { TaskDetailDrawer } from '../components/task-detail-drawer'
import { ThreadDetailDrawer } from '../components/thread-detail-drawer'
import { TaskFullscreenView } from '../components/task-fullscreen-view'

// ─── 状态类型 ──────────────────────────────────────────────────

/**
 * 抽屉状态联合类型
 * - closed: 无抽屉
 * - task: 任务详情抽屉（携带 taskId）
 * - thread: 主线详情抽屉（携带 threadId）
 * - fullscreen: 任务全屏视图（携带 taskId）
 */
type DrawerState =
  | { type: 'closed' }
  | { type: 'task'; taskId: string }
  | { type: 'thread'; threadId: string }
  | { type: 'fullscreen'; taskId: string }

// ─── 页面组件 ──────────────────────────────────────────────────

/**
 * 任务树页面组件
 * @description 横幅 + 左（主线列表）右（任务树）布局 + 详情抽屉 + 响应式
 */
export default function TaskTreePage() {
  const [selectedThreadId, setSelectedThreadId] = useState<string>('__all__')
  const [drawer, setDrawer] = useState<DrawerState>({ type: 'closed' })
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false)
  const [refreshKey, setRefreshKey] = useState(0)

  // ─── 筛选状态 ──────────────────────────────────────────────

  const [filterClarity, setFilterClarity] = useState<string[]>(['fuzzy', 'scoped', 'actionable'])
  const [filterStatus, setFilterStatus] = useState<string[]>(['todo', 'planned', 'in_progress', 'completed'])

  /** 筛选变更回调（复选框切换） */
  const handleFilterChange = useCallback((key: 'clarity' | 'status', value: string) => {
    const setter = key === 'clarity' ? setFilterClarity : setFilterStatus
    setter(prev => {
      if (prev.includes(value)) {
        const next = prev.filter(v => v !== value)
        return next.length === 0 ? prev : next
      }
      return [...prev, value]
    })
  }, [])

  // ─── 抽屉控制 ────────────────────────────────────────────────

  /** 打开任务详情抽屉 */
  const openTaskDetail = useCallback((taskId: string) => {
    setDrawer({ type: 'task', taskId })
  }, [])

  /** 打开主线详情抽屉 */
  const openThreadDetail = useCallback((threadId: string) => {
    setDrawer({ type: 'thread', threadId })
  }, [])

  /** 关闭所有抽屉 */
  const closeDrawer = useCallback(() => {
    setDrawer({ type: 'closed' })
  }, [])

  /** 数据变更回调 — 递增 refreshKey 触发树和主线列表刷新 */
  const handleDataChanged = useCallback(() => {
    setRefreshKey(k => k + 1)
  }, [])

  /** 将任务提升为主线（打开 __new__ 模式主线详情抽屉） */
  const promoteToThread = useCallback((taskId: string) => {
    setDrawer({ type: 'thread', threadId: '__new__' })
  }, [])

  /** 进入全屏模式 */
  const enterFullscreen = useCallback((taskId: string) => {
    setDrawer({ type: 'fullscreen', taskId })
  }, [])

  /** 退出全屏模式 */
  const exitFullscreen = useCallback(() => {
    setDrawer({ type: 'closed' })
  }, [])

  // ─── 主线选择 ────────────────────────────────────────────────

  /** 选中主线并关闭移动端面板 */
  const handleSelectThread = useCallback((threadId: string) => {
    setSelectedThreadId(threadId)
    setMobilePanelOpen(false)
  }, [])

  // ─── 渲染 ────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-canvas">
      {/* ═══ 图片横幅 + 操作工具栏 ════════════════════════════════ */}
      <header className="border-b border-hairline">
        <PageBanner domainId="tasks" title="任务树管理" />

        {/* 操作工具栏 */}
        <div className="flex items-center justify-between border-t border-hairline px-4 py-2">
          <p className="text-xs text-body">
            管理项目主线，组织和分解任务，保持清晰的行动路径。
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => openThreadDetail('__new__')}>
              <Plus className="size-4" />
              创建主线
            </Button>
          </div>
        </div>
      </header>

      {/* ═══ 主内容区（左面板 + 右内容区） ══════════════════════ */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* ─── 移动端面板切换按钮 ─────────────────────────────── */}
        <button
          type="button"
          className={cn(
            'md:hidden absolute top-3 left-3 z-30 rounded-md border border-hairline bg-surface-soft p-1.5',
            'text-muted hover:text-ink transition-colors',
          )}
          onClick={() => setMobilePanelOpen(v => !v)}
          aria-label="切换主线面板"
        >
          <PanelLeft className="size-5" />
        </button>

        {/* ─── 左侧：主线列表面板 ───────────────────────────────── */}
        <aside
          className={cn(
            // 桌面端常显
            'md:block md:relative md:w-[260px] md:flex-shrink-0',
            // 移动端抽屉式
            'hidden',
            mobilePanelOpen && 'fixed inset-0 z-50 block bg-canvas',
            'border-r border-hairline bg-surface-soft',
          )}
        >
          {/* 移动端关闭按钮 */}
          {mobilePanelOpen && (
            <div className="flex items-center justify-between p-3 border-b border-hairline md:hidden">
              <span className="text-sm font-semibold text-ink">主线列表</span>
              <button
                type="button"
                onClick={() => setMobilePanelOpen(false)}
                className="rounded p-1 text-muted hover:text-ink transition-colors"
                aria-label="关闭面板"
              >
                <ChevronUp className="size-5 rotate-90" />
              </button>
            </div>
          )}

          <ThreadListPanel
            selectedThreadId={selectedThreadId}
            onSelectThread={handleSelectThread}
            onOpenThreadDetail={openThreadDetail}
            refreshKey={refreshKey}
            filterClarity={filterClarity}
            filterStatus={filterStatus}
            onFilterChange={handleFilterChange}
          />
        </aside>

        {/* ─── 右侧：任务树 / 全屏详情（互斥渲染） ──────────── */}
        <main className="flex-1 overflow-y-auto">
          {drawer.type === 'fullscreen' ? (
            <TaskFullscreenView
              taskId={drawer.taskId}
              userId={'placeholder' as any}
              onBack={exitFullscreen}
              onTaskChanged={handleDataChanged}
            />
          ) : (
            <TaskTreeView
              threadId={selectedThreadId}
              refreshKey={refreshKey}
              onOpenTaskDetail={openTaskDetail}
              onPromoteToThread={promoteToThread}
              onDataChanged={handleDataChanged}
              filterClarity={filterClarity}
              filterStatus={filterStatus}
            />
          )}
        </main>
      </div>

      {/* ═══ 详情抽屉（仅 task / thread，fullscreen 在 main 内渲染） ═══ */}
      {drawer.type === 'task' && (
        <TaskDetailDrawer
          taskId={drawer.taskId}
          userId={'placeholder' as any}
          onClose={closeDrawer}
          onEnterFullscreen={enterFullscreen}
          onTaskChanged={handleDataChanged}
        />
      )}
      {drawer.type === 'thread' && (
        <ThreadDetailDrawer
          threadId={drawer.threadId}
          onClose={closeDrawer}
          onThreadChanged={handleDataChanged}
        />
      )}
    </div>
  )
}
