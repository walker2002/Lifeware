/**
 * @file itinerary-workspace
 * @brief 行程管理 Workspace（[026] A3 D2 reversal）
 *
 * server component 加载时已调 reconcileAndAdvanceItineraries 推进非终态行程；
 * 此处纯客户端渲染 + 多选删除。
 *
 * 列表筛 {scheduled, in_progress}（已过期/已完成/已取消不显示）：
 *   - getItinerariesByRange 服务端已按 ItineraryRepository.findActiveByRange
 *     过滤（终态排除），client 再 filter 保险（双层防御）。
 *   - server/client 双层是 [026] D2 reversal 的明示约定（brief §Step 2 注释）。
 *
 * 写入口:多选删除走 deleteItinerary server action（[026] T7 落地），
 *   走 Nexus 流水线（submitDynamicIntent → Orchestrator → RuleEngine → SM）。
 *   workspace 不直调 repo —— R-01 仓储隔离 + T-02 多租户透传。
 */
'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/empty-state'
import { Plus, CalendarOff, Trash2 } from 'lucide-react'
import { deleteItinerary } from '@/app/actions/timebox'
import type { ItinerarySummary } from '@/usom/types/summaries'

export function ItineraryWorkspace({ initialItems }: { initialItems: ItinerarySummary[] }) {
  const [items, setItems] = useState<ItinerarySummary[]>(initialItems)
  const [selected, setSelected] = useState<Set<string>>(new Set())

  // 列表筛 {scheduled, in_progress}（D2 reversal: server 已 filter，client 也再 filter 保险）
  const active = items.filter(i => i.status === 'scheduled' || i.status === 'in_progress')
  // 按 startTime 升序（最近未来在前）；Date 转毫秒可比较，TSO 兼容任意时区
  const sorted = [...active].sort(
    (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
  )

  const toggle = (id: string) =>
    setSelected(prev => {
      const n = new Set(prev)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const handleDelete = async () => {
    // 快照 selected 防止 await 期间 setSelected 状态变更
    const ids = Array.from(selected)
    for (const id of ids) {
      try {
        // [026] deleteItinerary 走 submitDynamicIntent → Orchestrator → SM transition
        await deleteItinerary(id as any)
      } catch (e) {
        // 单条失败不阻断剩余删除（与 reconcileAndAdvanceItineraries 同款错误隔离）
        console.error('[ItineraryWorkspace] deleteItinerary failed', id, e)
      }
    }
    setSelected(new Set())
    // 简化 refresh：本地清掉已删的，不重新 fetch。
    // 完整 invalidate router 留给后续 PR（T14 阶段可一并优化）。
    setItems(prev => prev.filter(i => !ids.includes(i.id)))
  }

  return (
    <div className="flex h-full">
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex items-center justify-between px-4 py-3 border-b border-hairline">
          <h1 className="text-base font-display text-ink">我的行程</h1>
          <div className="flex gap-2">
            {selected.size > 0 && (
              <Button size="sm" variant="destructive" onClick={handleDelete}>
                <Trash2 className="size-4 mr-1" />
                删除选中（{selected.size}）
              </Button>
            )}
            <Button
              size="sm"
              onClick={() => {
                // [026] A3.1 hash trigger：通过 window.location.hash 唤起 CNUI
                // surface 'createItinerary'。use-intent-handler 监听 hash 变化
                // 后路由到 openCnuiSurface（与既有 schedule 模式一致）。
                window.location.hash = 'createItinerary'
              }}
            >
              <Plus className="size-4 mr-1" />
              新建行程
            </Button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {sorted.length === 0 ? (
            <EmptyState
              icon={CalendarOff}
              title="还没有行程"
              description="创建一个行程，把它钉到未来的日历上"
              action={{
                label: '新建一个',
                onClick: () => {
                  window.location.hash = 'createItinerary'
                },
              }}
            />
          ) : (
            <div className="space-y-2">
              {sorted.map(it => {
                const checked = selected.has(it.id)
                return (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => toggle(it.id)}
                    className={`w-full text-left rounded-md border p-3 ${
                      checked ? 'border-primary bg-primary/5' : 'border-hairline bg-canvas'
                    } hover:bg-hover-overlay`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-ink truncate">{it.title}</span>
                      <span className="text-xs text-body/70">
                        {it.status === 'in_progress' ? '执行中' : '计划'}
                      </span>
                    </div>
                    <div className="text-xs text-body/70">
                      {new Date(it.startTime).toLocaleString('zh-CN')} · {it.durationMin}分钟
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}