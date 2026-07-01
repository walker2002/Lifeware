import { describe, it, expect, beforeEach, vi } from 'vitest'
import { timeboxCnuiHandler } from '../handlers'
import type { CnuiSurfaceOpenResult, CnuiSurfaceSubmitResult } from '@/nexus/ai-runtime/cnui/types'

// [023-01+] mock submitDynamicIntent（让 submit 测试可控）
vi.mock('@/app/actions/intent', () => ({
  submitDynamicIntent: vi.fn().mockResolvedValue({ success: true, object: { id: 'tb-x' } }),
}))

// Mock repositories 使用类构造函数
vi.mock('@/domains/timebox/repository', () => ({
  TimeboxRepository: class {
    async findByDateRange() {
      return [
        {
          id: 'timebox-1',
          title: '晨间阅读',
          startTime: '2026-05-29T06:00:00Z',
          endTime: '2026-05-29T07:00:00Z',
          status: 'planned',
          taskIds: ['task-1'],
          habitIds: [],
        },
      ]
    }
  },
}))

vi.mock('@/domains/tasks/repository', () => ({
  TaskRepository: class {
    async findByStatus() {
      return [
        {
          id: 'task-1',
          title: '完成设计文档',
          status: 'active',
          priority: 'P1',
          estimatedDuration: 60,
        },
        {
          id: 'task-2',
          title: '代码审查',
          status: 'active',
          priority: 'P2',
          estimatedDuration: 30,
        },
      ]
    }
  },
}))

vi.mock('@/domains/habits/repository/habit', () => ({
  HabitRepository: class {
    async findByUserId() {
      return [
        {
          id: 'habit-1',
          title: '晨间冥想',
          status: 'active',
          trackable: true,
          defaultTime: '06:00',
          defaultDuration: 20,
        },
      ]
    }
  },
}))

vi.mock('@/domains/habits/repository/habit-log', () => ({
  HabitLogRepository: class {
    async findByDate() {
      return []
    }
  },
}))

describe('timeboxCnuiHandler', () => {
  describe('open - createSmartSchedule', () => {
    it('应返回智能编排所需的数据', async () => {
      const result = await timeboxCnuiHandler.open('createSmartSchedule')

      expect(result.content).toContain('智能编排日程')
      expect(result.dataSnapshot).toHaveProperty('existingTimeboxes')
      expect(result.dataSnapshot).toHaveProperty('activeTasks')
      expect(result.dataSnapshot).toHaveProperty('pendingHabits')

      // 验证数据结构
      expect(Array.isArray(result.dataSnapshot.existingTimeboxes)).toBe(true)
      expect(Array.isArray(result.dataSnapshot.activeTasks)).toBe(true)
      expect(Array.isArray(result.dataSnapshot.pendingHabits)).toBe(true)

      // 验证 timebox 数据
      const timebox = result.dataSnapshot.existingTimeboxes[0]
      expect(timebox).toHaveProperty('id')
      expect(timebox).toHaveProperty('title')
      expect(timebox).toHaveProperty('startTime')
      expect(timebox).toHaveProperty('endTime')
      expect(timebox).toHaveProperty('status')
    })

    it('应包含未关联到 timebox 的任务', async () => {
      const result = await timeboxCnuiHandler.open('createSmartSchedule')

      const tasks = result.dataSnapshot.activeTasks
      expect(tasks.length).toBeGreaterThan(0)
      expect(tasks[0]).toHaveProperty('priority')
      expect(tasks[0]).toHaveProperty('estimatedDuration')
    })

    it('应包含未打卡的习惯', async () => {
      const result = await timeboxCnuiHandler.open('createSmartSchedule')

      const habits = result.dataSnapshot.pendingHabits
      expect(habits.length).toBeGreaterThan(0)
      expect(habits[0]).toHaveProperty('defaultTime')
      expect(habits[0]).toHaveProperty('defaultDuration')
    })
  })

  describe('open - adjustRemainingSchedule', () => {
    it('应返回调整日程所需的数据', async () => {
      const result = await timeboxCnuiHandler.open('adjustRemainingSchedule')

      expect(result.content).toContain('调整剩余日程')
      expect(result.dataSnapshot).toHaveProperty('existingTimeboxes')
      expect(result.dataSnapshot).toHaveProperty('remainingTasks')

      // 验证数据结构
      expect(Array.isArray(result.dataSnapshot.existingTimeboxes)).toBe(true)
      expect(Array.isArray(result.dataSnapshot.remainingTasks)).toBe(true)
    })

    it('应过滤出未关联到 timebox 的任务', async () => {
      const result = await timeboxCnuiHandler.open('adjustRemainingSchedule')

      const remainingTasks = result.dataSnapshot.remainingTasks
      // task-1 已经在 existingTimeboxes 中，所以应该被过滤掉
      const taskIds = remainingTasks.map((t: any) => t.id)
      expect(taskIds).not.toContain('task-1')
    })
  })

  describe('open - 未知 action', () => {
    it('应返回默认数据', async () => {
      const result = await timeboxCnuiHandler.open('unknown')

      expect(result.content).toBe('请填写信息')
      expect(result.dataSnapshot).toEqual({})
    })
  })

  describe('open - createTimebox（[023-01+] 空白 draft 初始化回归）', () => {
    it('无 intentFields → 初始化单条空白 draft（uuid + 空 title + 当前时间 + 1h 区间）', async () => {
      const before = Date.now()
      const result = await timeboxCnuiHandler.open('createTimebox', undefined)
      const after = Date.now()

      const items = result.dataSnapshot.items as Array<{ id: string; title: string; startTime: string; endTime: string }>
      expect(items).toHaveLength(1)
      expect(items[0].title).toBe('')
      expect(items[0].id).toBeTruthy()
      // startTime 应在 before/after 之间（容忍 50ms 时差）
      const startMs = new Date(items[0].startTime).getTime()
      expect(startMs).toBeGreaterThanOrEqual(before - 50)
      expect(startMs).toBeLessThanOrEqual(after + 50)
      // endTime 应为 startTime + 1h
      const endMs = new Date(items[0].endTime).getTime()
      expect(endMs - startMs).toBe(60 * 60 * 1000)
      // 内容：空白 draft 应提示「请填写」而非「请确认」
      expect(result.content).toBe('请填写时间盒信息')
    })

    it('intentFields={}（无 drafts 字段）→ 同上初始化空白 draft', async () => {
      const result = await timeboxCnuiHandler.open('createTimebox', {})

      const items = result.dataSnapshot.items as Array<{ id: string; title: string }>
      expect(items).toHaveLength(1)
      expect(items[0].title).toBe('')
    })

    it('intentFields.drafts 已透传 → 不覆盖，沿用传入草稿', async () => {
      const passedDrafts = [
        { id: 'd1', title: 'OKR 季度计划', startTime: '2026-07-01T10:30:00Z', endTime: '2026-07-01T12:30:00Z' },
        { id: 'd2', title: '带孩子出去玩', startTime: '2026-07-01T16:00:00Z', endTime: '2026-07-01T18:00:00Z' },
      ]
      const result = await timeboxCnuiHandler.open('createTimebox', { drafts: passedDrafts })

      const items = result.dataSnapshot.items as Array<{ id: string; title: string }>
      expect(items).toHaveLength(2)
      expect(items[0].title).toBe('OKR 季度计划')
      expect(items[1].title).toBe('带孩子出去玩')
      // 有内容时 content 用「请确认」
      expect(result.content).toBe('请确认要创建的时间盒')
    })

    it('intentFields.drafts=[]（空数组）→ 仍初始化单条空白 draft', async () => {
      const result = await timeboxCnuiHandler.open('createTimebox', { drafts: [] })

      const items = result.dataSnapshot.items as Array<{ id: string; title: string }>
      expect(items).toHaveLength(1)
      expect(items[0].title).toBe('')
    })
  })

  describe('submit - createTimebox（[023-01+] 错误原因透传回归）', () => {
    // [023-01+] RC-B 修复：handlers.submit 失败时 error 字符串拼接 failed[i].error
    //   之前："1 条失败："（只显示 count + title，title 空 → 用户看不到原因）
    //   现在："1 条失败：未命名（缺少必需字段: title）"（含 error 原因）
    it('空 title 失败 → error 字符串应包含具体 error 原因', async () => {
      // mock submitDynamicIntent 返回"缺少必需字段: title"失败
      const { submitDynamicIntent } = await import('@/app/actions/intent')
      vi.mocked(submitDynamicIntent).mockResolvedValueOnce({
        success: false,
        timeboxes: [],
        error: '缺少必需字段: title',
      })

      const result = await timeboxCnuiHandler.submit('createTimebox', {
        items: [{ id: 'd1', title: '', startTime: '2026-07-01T10:00:00Z', endTime: '2026-07-01T11:00:00Z' }],
      })

      expect(result.success).toBe(false)
      // RC-B：error 字符串必须包含具体 error 原因，不能只显示 "1 条失败："
      expect(result.error).toContain('缺少必需字段')
      expect(result.error).toContain('title')
      expect(result.error).not.toBe('1 条失败：')  // 旧 bug 行为
    })

    it('多条失败 → error 字符串拼接所有失败原因（分号分隔）', async () => {
      const { submitDynamicIntent } = await import('@/app/actions/intent')
      vi.mocked(submitDynamicIntent)
        .mockResolvedValueOnce({ success: false, timeboxes: [], error: '缺少必需字段: title' })
        .mockResolvedValueOnce({ success: false, timeboxes: [], error: 'endTime 必须晚于 startTime' })

      const result = await timeboxCnuiHandler.submit('createTimebox', {
        items: [
          { id: 'd1', title: '', startTime: '2026-07-01T10:00:00Z', endTime: '2026-07-01T11:00:00Z' },
          { id: 'd2', title: 'B', startTime: '2026-07-01T12:00:00Z', endTime: '2026-07-01T11:00:00Z' },
        ],
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('缺少必需字段')
      expect(result.error).toContain('endTime 必须晚于 startTime')
    })
  })

  describe('submit - createSmartSchedule', () => {
    it('应返回成功（暂未实现）', async () => {
      const result = await timeboxCnuiHandler.submit('createSmartSchedule', {})

      expect(result.success).toBe(true)
    })
  })

  describe('submit - adjustRemainingSchedule', () => {
    it('应返回成功（暂未实现）', async () => {
      const result = await timeboxCnuiHandler.submit('adjustRemainingSchedule', {})

      expect(result.success).toBe(true)
    })
  })

  describe('submit - 未知 action', () => {
    it('应返回错误', async () => {
      const result = await timeboxCnuiHandler.submit('unknown', {})

      expect(result.success).toBe(false)
      expect(result.error).toContain('Unknown CN-UI action')
    })
  })

  describe('错误处理', () => {
    // 注意：错误处理测试需要更复杂的 mock 设置，暂时跳过
    it.todo('repository 查询失败时应返回空数组')
  })
})
