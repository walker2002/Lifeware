/**
 * @file use-auto-trigger.test
 * @brief [026.02.4] TD-028 Site 2 — 守护 auto-trigger 不再查 status='running'
 *
 * TD-028 根因：[023.12] 后 'running' 不持久化（读时由 derive-display-status 派生）。
 * 原 auto-trigger 第二个分支 `tb.status === 'running' && endTime <= now` 在持久化
 * 数据上从不为真 → 自动 overtime 永不触发。修后改为内联派生：`status='planned'
 * && endTime <= now`（planned + 已过结束时间 = 视为超时未启动）。
 */
import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { useAutoTrigger } from '../use-auto-trigger'
import type { TimeboxSummary } from '@/usom/types/summaries'

/** 构造 TimeboxSummary（最小字段集） */
function mkTb(overrides: Partial<TimeboxSummary> = {}): TimeboxSummary {
  const pastStart = new Date(Date.now() - 2 * 3600 * 1000).toISOString()
  const pastEnd = new Date(Date.now() - 60 * 1000).toISOString()
  return {
    id: 'tb-1',
    title: '测试',
    status: 'planned',
    startTime: pastStart,
    endTime: pastEnd,
    taskIds: [],
    habitIds: [],
    ...overrides,
  }
}

describe("[026.02.4] TD-028 Site 2 — auto-trigger 'planned' 内联派生", () => {
  it('TD-028 修复后:planned + endTime <= now → onTransition(tb, "overtime")', async () => {
    const onTransition = vi.fn().mockResolvedValue(undefined)
    // endTime 已过,startTime 也已过 → 原代码(status='running' & endTime<=now)永不命中,
    // 修后(status='planned' & endTime<=now)命中 → overtime
    const tb: TimeboxSummary = mkTb({
      id: 'tb-overdue',
      status: 'planned',
      startTime: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
      endTime: new Date(Date.now() - 60 * 1000).toISOString(),
    })

    renderHook(() => useAutoTrigger({
      timeboxes: [tb],
      onTransition,
      intervalMs: 60 * 60 * 1000, // 大间隔,只关心 mount 那次
    }))

    await waitFor(() => {
      // 至少调一次 overtime(可能也调 start,因 startTime<=now & endTime<=now 都满足)
      const calls = onTransition.mock.calls.filter((c: any[]) => c[1] === 'overtime')
      expect(calls.length).toBeGreaterThanOrEqual(1)
      expect(calls[0][0]).toBe('tb-overdue')
    })
  })
})
