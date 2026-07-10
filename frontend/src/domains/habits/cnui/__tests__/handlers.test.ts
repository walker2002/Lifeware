import { describe, it, expect, beforeEach, vi } from 'vitest'
import { habitCnuiHandler } from '../handlers'
import type { CnuiSurfaceOpenResult, CnuiSurfaceSubmitResult } from '@/nexus/ai-runtime/cnui/types'

// Mock repositories
const mockHabitRepo = {
  findByUserId: vi.fn().mockResolvedValue([]),
  findById: vi.fn().mockResolvedValue(null),
  create: vi.fn().mockResolvedValue({
    id: 'test-habit-id',
    title: '测试习惯',
    status: 'draft',
  }),
  updateStatus: vi.fn().mockResolvedValue({
    id: 'test-habit-id',
    title: '测试习惯',
    status: 'active',
  }),
}

const mockHabitLogRepo = {
  findByUserAndDate: vi.fn().mockResolvedValue([]),
  save: vi.fn().mockResolvedValue(undefined),
}

const mockEventRepo = {
  append: vi.fn().mockResolvedValue(undefined),
}

vi.mock('@/domains/habits/repository/habit', () => ({
  HabitRepository: vi.fn().mockImplementation(() => mockHabitRepo),
}))

vi.mock('@/domains/habits/repository/habit-log', () => ({
  HabitLogRepository: vi.fn().mockImplementation(() => mockHabitLogRepo),
}))

vi.mock('@/lib/db/repositories/system-event.repository', () => ({
  SystemEventRepository: vi.fn().mockImplementation(() => mockEventRepo),
}))

// [020] Phase 1 RT1 连带：validation 新增 HABIT_RULE_MESSAGES 导出，mock 须同步——用 importOriginal
// 自动带出全部真实导出，仅 override validateHabitFields（handlers 测试不消费 HABIT_RULE_MESSAGES，但
// mock 契约须完整，否则 vitest 报 "No HABIT_RULE_MESSAGES export is defined on the mock"）。
vi.mock('@/domains/habits/validation', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/domains/habits/validation')>()
  return {
    ...actual,
    validateHabitFields: vi.fn(() => ({ valid: true, errors: [] })),
  }
})

vi.mock('@/domains/habits/transitions', () => ({
  findTransition: vi.fn(() => ({
    from: null,
    to: 'draft',
    action: 'create',
    eventType: 'HabitCreated',
  })),
}))

describe('habitCnuiHandler', () => {
  describe('open', () => {
    it('createHabit action 应返回表单初始数据', async () => {
      const result = await habitCnuiHandler.open('createHabit')

      expect(result.content).toBe('请填写习惯信息')
      expect(result.dataSnapshot).toHaveProperty('startDate')
      expect(result.dataSnapshot.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    })

    it('logHabitLog action 应返回可打卡习惯列表', async () => {
      const result = await habitCnuiHandler.open('logHabitLog')

      expect(result.content).toBe('请选择要打卡的习惯')
      expect(result.dataSnapshot).toHaveProperty('items')
      expect(Array.isArray(result.dataSnapshot.items)).toBe(true)
    })

    it('activateHabit action 应返回草稿状态习惯列表', async () => {
      const result = await habitCnuiHandler.open('activateHabit')

      expect(result.content).toContain('激活')
      expect(result.dataSnapshot).toHaveProperty('items')
      expect(result.dataSnapshot).toHaveProperty('action')
      expect(result.dataSnapshot.action).toBe('activate')
    })

    it('suspendHabit action 应返回活跃状态习惯列表', async () => {
      const result = await habitCnuiHandler.open('suspendHabit')

      expect(result.content).toContain('暂停')
      expect(result.dataSnapshot.action).toBe('suspend')
    })

    it('archiveHabit action 应返回暂停状态习惯列表', async () => {
      const result = await habitCnuiHandler.open('archiveHabit')

      expect(result.content).toContain('归档')
      expect(result.dataSnapshot.action).toBe('archive')
    })

    it('reactivateHabit action 应返回暂停状态习惯列表', async () => {
      const result = await habitCnuiHandler.open('reactivateHabit')

      expect(result.content).toContain('恢复')
      expect(result.dataSnapshot.action).toBe('reactivate')
    })

    it('未知 action 应返回默认数据', async () => {
      const result = await habitCnuiHandler.open('unknown')

      expect(result.content).toBe('请填写信息')
      expect(result.dataSnapshot).toEqual({})
    })
  })

  describe('submit - createHabit', () => {
    it('校验失败应返回错误', async () => {
      const { validateHabitFields } = await import('@/domains/habits/validation')
      vi.mocked(validateHabitFields).mockReturnValue({
        valid: false,
        errors: ['标题不能为空'],
        warnings: [],
      })

      const result = await habitCnuiHandler.submit('createHabit', {})

      expect(result.success).toBe(false)
      expect(result.error).toContain('标题不能为空')
    })

    // 注意：完整创建测试需要正确设置所有 mocks，暂时跳过
    it.todo('应成功创建习惯')
  })

  describe('submit - lifecycle actions', () => {
    it('未选择任何习惯应返回错误', async () => {
      const result = await habitCnuiHandler.submit('activateHabit', {
        selectedIds: [],
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('未选择任何习惯')
    })

    it('selectedIds 缺失应返回错误', async () => {
      const result = await habitCnuiHandler.submit('activateHabit', {})

      expect(result.success).toBe(false)
      expect(result.error).toContain('未选择任何习惯')
    })

    // 注意：完整 lifecycle 测试需要正确设置所有 mocks，暂时跳过
    it.todo('activateHabit 应成功激活习惯')
  })

  describe('submit - logHabitLog', () => {
    it('未选择习惯应返回错误', async () => {
      const result = await habitCnuiHandler.submit('logHabitLog', {
        selectedIds: [],
      })

      expect(result.success).toBe(false)
      expect(result.error).toContain('未选择任何习惯')
    })

    // 注意：完整打卡测试需要正确设置所有 mocks，暂时跳过
    it.todo('应成功打卡习惯')
    it.todo('支持批量打卡')
  })

  describe('submit - 未知 action', () => {
    it('应返回错误', async () => {
      const result = await habitCnuiHandler.submit('unknown', {})

      expect(result.success).toBe(false)
      expect(result.error).toContain('Unknown CN-UI action')
    })
  })
})
