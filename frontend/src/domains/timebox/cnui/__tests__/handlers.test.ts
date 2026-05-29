import { describe, it, expect, beforeEach, vi } from 'vitest'
import { timeboxCnuiHandler } from '../handlers'
import type { CnuiSurfaceOpenResult, CnuiSurfaceSubmitResult } from '@/nexus/ai-runtime/cnui/types'

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
