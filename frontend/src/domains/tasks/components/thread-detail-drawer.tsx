/**
 * @file thread-detail-drawer
 * @brief 主线创建/详情 Drawer 组件
 *
 * 统一处理创建（threadId === '__new__'）和详情查看两种模式。
 * 详情模式展示主线概览、内嵌任务树和状态操作按钮。
 */

'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { X, ExternalLink, Pause, Play } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { getThreadById, getThreadWithCount, createThread, updateThreadStatus } from '@/app/actions/tasks'
import { TaskTreeView } from './task-tree-view'
import type { Thread } from '../../../usom/types/objects'

/** 带任务计数的 Thread 查询结果 */
interface ThreadWithCount {
  thread: Thread
  taskCount: number
  completedTaskCount: number
}

const PRESET_COLORS = ['#E74C3C', '#E67E22', '#F1C40F', '#2ECC71', '#1ABC9C', '#3498DB', '#9B59B6', '#95A5A6']

// ─── 组件属性 ──────────────────────────────────────────────────────────

interface ThreadDetailDrawerProps {
  threadId: string
  onClose: () => void
}

// ─── 主组件 ──────────────────────────────────────────────────────────────

/**
 * 主线创建/详情 Drawer 组件
 * @param props - 组件属性
 */
export function ThreadDetailDrawer({ threadId, onClose }: ThreadDetailDrawerProps) {
  const isCreate = threadId === '__new__'

  // 详情模式状态
  const [thread, setThread] = useState<Thread | null>(null)
  const [counts, setCounts] = useState<ThreadWithCount | null>(null)
  const [loadingDetail, setLoadingDetail] = useState(false)
  const [notFound, setNotFound] = useState(false)

  const router = useRouter()

  // ─── 详情模式：加载主线数据 ─────────────────────────────────────────
  useEffect(() => {
    if (isCreate) return
    let cancelled = false

    async function load() {
      setLoadingDetail(true)
      setNotFound(false)
      try {
        const t = await getThreadById(threadId)
        if (!t) {
          if (!cancelled) { setNotFound(true); setThread(null) }
          return
        }
        if (!cancelled) setThread(t)

        const wc = await getThreadWithCount(threadId)
        if (!cancelled) setCounts(wc)
      } catch {
        if (!cancelled) { setNotFound(true); setThread(null) }
      } finally {
        if (!cancelled) setLoadingDetail(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [isCreate, threadId])

  // ─── 状态操作 ─────────────────────────────────────────────────────
  const handleStatusChange = useCallback(async (newStatus: Thread['status']) => {
    try {
      const updated = await updateThreadStatus(thread!.id, newStatus)
      setThread(updated)
    } catch {
      // 静默降级
    }
  }, [thread])

  // ─── 创建模式表单状态 ─────────────────────────────────────────────
  const [name, setName] = useState('')
  const [color, setColor] = useState('#3498DB')
  const [priority, setPriority] = useState('')
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [description, setDescription] = useState('')
  const [saving, setSaving] = useState(false)

  const handleSave = async () => {
    if (!name.trim()) return
    setSaving(true)
    try {
      await createThread({
        name: name.trim(),
        color,
        priority: priority as any || undefined,
        startDate: startDate as any || undefined,
        endDate: endDate as any || undefined,
        description: description || undefined,
      })
      onClose()
    } catch (e) {
      setSaving(false)
    }
  }

  // ─── 详情模式头部信息 ────────────────────────────────────────────
  const renderDetailHeader = () => {
    if (!thread) return null
    const completionRate = counts && counts.taskCount > 0
      ? Math.round((counts.completedTaskCount / counts.taskCount) * 100)
      : 0

    return (
      <>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-hairline shrink-0">
          <div className="flex items-center gap-3">
            {/* 颜色圆点 */}
            <span
              className="w-3 h-3 rounded-full shrink-0"
              style={{ backgroundColor: thread.color ?? '#3498DB' }}
            />
            <h2 className="text-base font-semibold text-ink truncate max-w-[280px]">
              {thread.name}
            </h2>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push(`/threads/${threadId}`)}
              aria-label="在新页面打开"
              title="在新页面打开"
            >
              <ExternalLink className="size-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose} aria-label="关闭">
              <X className="size-4" />
            </Button>
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {/* 概览信息 */}
          <div className="px-5 py-4 space-y-3 border-b border-hairline-soft">
            {/* 状态 + 优先级 */}
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center rounded px-2 py-0.5 text-xs font-medium bg-surface-card text-ink">
                {thread.status === 'active' ? '进行中' : thread.status === 'paused' ? '已暂停' : thread.status === 'completed' ? '已完成' : thread.status}
              </span>
              <span className="text-xs text-muted">{thread.priority ?? '默认'} 优先级</span>
            </div>

            {/* 日期范围 */}
            {(thread.startDate || thread.endDate) && (
              <p className="text-xs text-muted">
                {thread.startDate ?? '未设置'} — {thread.endDate ?? '未设置'}
              </p>
            )}

            {/* 描述 */}
            {thread.description && (
              <p className="text-sm text-body">{thread.description}</p>
            )}

            {/* 任务统计 */}
            {counts && (
              <div className="space-y-2">
                <div className="flex items-center gap-4">
                  <div>
                    <span className="text-lg font-semibold text-ink">{counts.taskCount}</span>
                    <span className="text-xs text-muted ml-1">任务总数</span>
                  </div>
                  <div>
                    <span className="text-lg font-semibold text-ink">{counts.completedTaskCount}</span>
                    <span className="text-xs text-muted ml-1">已完成</span>
                  </div>
                  <div>
                    <span className="text-lg font-semibold text-ink">{completionRate}%</span>
                    <span className="text-xs text-muted ml-1">完成率</span>
                  </div>
                </div>

                {/* 进度条 */}
                <div className="w-full h-1.5 rounded-full bg-surface-soft overflow-hidden">
                  <div
                    className="h-full rounded-full bg-success transition-all duration-300"
                    style={{ width: `${completionRate}%` }}
                  />
                </div>
              </div>
            )}

            {/* 状态操作按钮 */}
            <div className="flex items-center gap-2 pt-1">
              {thread.status === 'active' && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleStatusChange('paused')}
                >
                  <Pause className="size-3.5 mr-1" />暂停
                </Button>
              )}
              {thread.status === 'paused' && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleStatusChange('active')}
                >
                  <Play className="size-3.5 mr-1" />恢复
                </Button>
              )}
            </div>
          </div>

          {/* 内嵌任务树 */}
          <div className="flex-1">
            <TaskTreeView
              threadId={threadId}
              onOpenTaskDetail={() => {}}
            />
          </div>
        </div>
      </>
    )
  }

  // ─── 渲染 ────────────────────────────────────────────────────────────

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 z-30 bg-[rgba(20,20,19,0.3)]" onClick={onClose} />

      {/* Drawer */}
      <div className="fixed right-0 top-0 z-40 h-full w-[480px] bg-canvas shadow-lg border-l border-hairline flex flex-col">
        {/* ═══ 创建模式 ═══════════════════════════════════════════ */}
        {isCreate && (
          <>
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-hairline shrink-0">
              <h2 className="text-base font-semibold text-ink">创建主线</h2>
              <Button variant="ghost" size="icon" onClick={onClose} aria-label="关闭">
                <X className="size-4" />
              </Button>
            </div>

            {/* Form body */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
              {/* Name */}
              <div>
                <label htmlFor="thread-name" className="block text-sm font-medium text-ink mb-1.5">主线名称 *</label>
                <input
                  id="thread-name"
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  maxLength={50}
                  placeholder="例如：事业进阶"
                  className="w-full h-9 rounded-md border border-hairline bg-canvas px-3 text-sm text-ink placeholder:text-muted-soft focus:outline-none focus:ring-2 focus:ring-[rgba(204,120,92,0.3)]"
                />
              </div>

              {/* Color picker */}
              <div>
                <label className="block text-sm font-medium text-ink mb-1.5">颜色</label>
                <div className="flex gap-2 flex-wrap">
                  {PRESET_COLORS.map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className="size-8 rounded-md border-2 transition-colors hover:scale-110"
                      style={{
                        backgroundColor: c,
                        borderColor: c === color ? '#141413' : 'transparent',
                      }}
                      aria-label={`颜色 ${c}`}
                    />
                  ))}
                </div>
              </div>

              {/* Priority */}
              <div>
                <label htmlFor="thread-priority" className="block text-sm font-medium text-ink mb-1.5">优先级</label>
                <select
                  id="thread-priority"
                  value={priority}
                  onChange={e => setPriority(e.target.value)}
                  className="w-full h-9 rounded-md border border-hairline bg-canvas px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-[rgba(204,120,92,0.3)]"
                >
                  <option value="">不设置</option>
                  <option value="critical">紧急</option>
                  <option value="high">高</option>
                  <option value="medium">中</option>
                  <option value="low">低</option>
                </select>
              </div>

              {/* Dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="thread-start" className="block text-sm font-medium text-ink mb-1.5">开始日期</label>
                  <input id="thread-start" type="date" value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    className="w-full h-9 rounded-md border border-hairline bg-canvas px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-[rgba(204,120,92,0.3)]" />
                </div>
                <div>
                  <label htmlFor="thread-end" className="block text-sm font-medium text-ink mb-1.5">结束日期</label>
                  <input id="thread-end" type="date" value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    className="w-full h-9 rounded-md border border-hairline bg-canvas px-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-[rgba(204,120,92,0.3)]" />
                </div>
              </div>

              {/* Description */}
              <div>
                <label htmlFor="thread-desc" className="block text-sm font-medium text-ink mb-1.5">描述</label>
                <textarea
                  id="thread-desc"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  maxLength={500}
                  rows={4}
                  placeholder="主线的描述说明…"
                  className="w-full rounded-md border border-hairline bg-canvas px-3 py-2 text-sm text-ink placeholder:text-muted-soft focus:outline-none focus:ring-2 focus:ring-[rgba(204,120,92,0.3)] resize-none"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-hairline shrink-0">
              <Button variant="secondary" onClick={onClose}>取消</Button>
              <Button onClick={handleSave} disabled={!name.trim() || saving}>
                {saving ? (
                  <><div className="size-4 animate-spin rounded-full border-2 border-white border-t-transparent mr-2" />保存中…</>
                ) : '创建主线'}
              </Button>
            </div>
          </>
        )}

        {/* ═══ 详情模式 ═══════════════════════════════════════════ */}
        {!isCreate && (
          <>
            {loadingDetail ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              </div>
            ) : notFound ? (
              /* 404 状态 */
              <div className="flex-1 flex flex-col items-center justify-center px-5 text-center">
                <p className="text-sm text-muted mb-4">主线不存在或已删除</p>
                <Button variant="secondary" onClick={onClose}>返回</Button>
              </div>
            ) : (
              renderDetailHeader()
            )}
          </>
        )}
      </div>
    </>
  )
}
