/**
 * @file task-orphan-count.regression-1
 * @brief 回归测试：orphan 任务计数（无主线任务不再从侧栏计数中消失）
 *
 * Regression: ISSUE-F1 — /tasks 侧栏「全部任务」/「普通任务」漏掉 thread_id 为空的 orphan 任务。
 *   根因：ThreadRepository.findAllWithCount 以 threads LEFT JOIN tasks ON thread_id 关联，
 *   thread_id 为空的任务不挂任何主线行，永不计入。新增 TaskRepository.countOrphanTasks 单独统计。
 * Found by /qa on 2026-06-18
 * Report: .gstack/qa-reports/qa-report-localhost-2026-06-18.md
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TaskRepository } from '../../../../domains/tasks/repository/task'

// Mock db：select 链返回带 count 的行，模拟 orphan 计数聚合查询
vi.mock('../../../../lib/db/index', () => {
  const mockWhere = vi.fn(() => Promise.resolve([{ count: 2 }]))
  const mockFrom = vi.fn(() => ({ where: mockWhere }))
  const mockSelect = vi.fn(() => ({ from: mockFrom }))
  return {
    db: {
      select: mockSelect,
      insert: vi.fn(() => ({ values: vi.fn(() => ({ onConflictDoUpdate: vi.fn(() => Promise.resolve()) })) })),
      update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })) })),
      delete: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })),
    },
  }
})

describe('TaskRepository.countOrphanTasks (regression F1)', () => {
  const userId = '00000000-0000-0000-0000-000000000001'
  let repo: TaskRepository

  beforeEach(() => {
    repo = new TaskRepository()
    vi.clearAllMocks()
  })

  it('应透传数据库统计的 orphan 任务数（修复前该计数从未被查询，恒表现为缺失）', async () => {
    const count = await repo.countOrphanTasks(userId)
    // mock 返回 [{ count: 2 }]，方法应读取 rows[0].count 并返回，而非恒为 0
    expect(count).toBe(2)
  })

  it('数据库返回空结果时安全回退为 0', async () => {
    // 重新 mock：select 返回空数组
    const dbModule = await import('../../../../lib/db/index')
    ;(dbModule.db.select as ReturnType<typeof vi.fn>).mockReturnValueOnce({
      from: () => ({ where: () => Promise.resolve([]) }),
    })
    const count = await repo.countOrphanTasks(userId)
    expect(count).toBe(0)
  })
})
