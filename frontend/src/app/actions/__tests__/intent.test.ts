// parseHabitIntentOnly Server Action — 单元测试
import { describe, it, expect, vi, beforeEach } from 'vitest'

// mock AI 依赖
vi.mock('@/nexus/core/intent-engine/ai-parser', () => ({
  parseHabitWithAI: vi.fn(),
  parseMultiTask: vi.fn(),
}))

vi.mock('@/nexus/ai-runtime', () => ({
  createAIRuntime: vi.fn(() => ({})),
}))

// [023.11] archetype 推断依赖（默认 findByUser 返 [] → 跳过 matcher）
vi.mock('@/lib/db/repositories/activity-archetype.repository', () => ({
  ActivityArchetypeRepository: vi.fn().mockImplementation(() => ({
    findByUser: vi.fn().mockResolvedValue([]),
  })),
}))

vi.mock('@/domains/timebox/lib/archetype-matcher', () => ({
  matchArchetypesForTitles: vi.fn(),
}))

import { parseHabitIntentOnly, parseTimeboxBatchIntentOnly, getActionResponse, resolveShortcut } from '../intent'
// [026.02.4] TD-028 Site 1 守护:matchTarget 用 deriveTimeboxDisplayStatus 判 running。
// 本测试验证该函数语义:planned + now∈[start,end] → 'running';其他状态 → null。
import { deriveTimeboxDisplayStatus } from '@/domains/timebox/status/derive-display-status'
import { parseHabitWithAI, parseMultiTask } from '@/nexus/core/intent-engine/ai-parser'
import { matchArchetypesForTitles } from '@/domains/timebox/lib/archetype-matcher'
import { ActivityArchetypeRepository } from '@/lib/db/repositories/activity-archetype.repository'

const mockParseHabitWithAI = vi.mocked(parseHabitWithAI)
const mockParseMultiTask = vi.mocked(parseMultiTask)
const mockMatchArchetypes = vi.mocked(matchArchetypesForTitles)

describe('parseHabitIntentOnly', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('解析成功时返回 action 和 fields', async () => {
    mockParseHabitWithAI.mockResolvedValueOnce({
      success: true,
      intent: {
        id: 'test-intent-id',
        intentionId: 'test-intention-id',
        targetDomain: 'habits',
        action: 'createHabit',
        fields: {
          title: '读书',
          defaultTime: '22:00',
          defaultDuration: 30,
        },
        confidence: 0.9,
        resolvedBy: 'ai',
        createdAt: new Date().toISOString(),
      },
    })

    const result = await parseHabitIntentOnly('每天晚上10点读书半小时')

    expect(result.success).toBe(true)
    expect(result.action).toBe('createHabit')
    expect(result.fields?.title).toBe('读书')
    expect(result.fields?.defaultTime).toBe('22:00')
    expect(result.fields?.defaultDuration).toBe(30)
  })

  it('AI 解析失败时返回错误', async () => {
    mockParseHabitWithAI.mockResolvedValueOnce({
      success: false,
      error: '无法识别意图',
    })

    const result = await parseHabitIntentOnly('这不是习惯相关的内容')

    expect(result.success).toBe(false)
    expect(result.error).toBe('无法识别意图')
  })

  it('AI 抛出异常时返回错误', async () => {
    mockParseHabitWithAI.mockRejectedValueOnce(new Error('网络超时'))

    const result = await parseHabitIntentOnly('测试输入')

    expect(result.success).toBe(false)
    expect(result.error).toBe('网络超时')
  })

  it('非 Error 异常时返回默认消息', async () => {
    mockParseHabitWithAI.mockRejectedValueOnce('unknown')

    const result = await parseHabitIntentOnly('测试输入')

    expect(result.success).toBe(false)
    expect(result.error).toBe('解析失败')
  })
})

// [023-01] Task 7 smoke test（codex Point 5）：
//   getActionResponse 收紧返回类型为 'cnui' | 'page' | 'text' | 'unimplemented'
//   后，调用方 use-intent-handler.ts 必须能拿到精确的 'page' 字面量以做 narrowing。
//   端到端验证 getActionResponse → manifest-utils.getResponseType 链路不断。
describe('getActionResponse（[023-01] type narrowing smoke）', () => {
  it('viewTimeboxes 返回 page（依赖 Task 1 显式声明 + Task 6 manifest-utils SSOT）', async () => {
    const result = await getActionResponse('timebox', 'viewTimeboxes')
    expect(result.responseType).toBe('page')
  })

  it('createTimebox 返回 cnui（manifest 显式声明 cnui_surface）', async () => {
    const result = await getActionResponse('timebox', 'createTimebox')
    expect(result.responseType).toBe('cnui')
  })

  it('未声明 action 返回 unimplemented（manifest-utils fallback）', async () => {
    const result = await getActionResponse('timebox', 'nonExistent')
    expect(result.responseType).toBe('unimplemented')
  })
})

// [023-01+] parseTimeboxBatchIntentOnly — chat 路径 dry-run 入口回归
//   模拟 MULTI_TASK_PROMPT 解析后的 StructuredIntent 数组，
//   验证函数正确提取 drafts（不提交）
describe('parseTimeboxBatchIntentOnly（[023-01+] chat dry-run）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('解析成功（多任务）→ 返回 drafts 数组', async () => {
    mockParseMultiTask.mockResolvedValueOnce({
      success: true,
      intents: [
        {
          id: 'i1',
          intentionId: 'in1',
          targetDomain: 'timebox',
          action: 'create_timebox',
          fields: {
            title: 'OKR 季度计划',
            startTime: '2026-07-01T10:30:00+08:00',
            endTime: '2026-07-01T12:30:00+08:00',
            duration: 120,
          },
          confidence: 0.92,
          resolvedBy: 'ai',
          createdAt: new Date().toISOString(),
        },
        {
          id: 'i2',
          intentionId: 'in1',
          targetDomain: 'timebox',
          action: 'create_timebox',
          fields: {
            title: '带孩子出去玩',
            startTime: '2026-07-01T16:00:00+08:00',
            endTime: '2026-07-01T18:00:00+08:00',
            duration: 120,
          },
          confidence: 0.9,
          resolvedBy: 'ai',
          createdAt: new Date().toISOString(),
        },
      ],
    })

    const result = await parseTimeboxBatchIntentOnly('10:30-12:30 OKR 季度计划；下午16:00-18:00 带孩子出去玩')

    expect(result.success).toBe(true)
    expect(result.drafts).toHaveLength(2)
    expect(result.drafts?.[0].title).toBe('OKR 季度计划')
    expect(result.drafts?.[0].startTime).toBe('2026-07-01T10:30:00+08:00')
    expect(result.drafts?.[0].duration).toBe(120)
    expect(result.drafts?.[1].title).toBe('带孩子出去玩')
  })

  it('解析失败（无 intents）→ 返回 success=false + error', async () => {
    mockParseMultiTask.mockResolvedValueOnce({
      success: false,
      intents: [],
      error: '所有子任务信息不完整',
    })

    const result = await parseTimeboxBatchIntentOnly('hjkahsdkj')

    expect(result.success).toBe(false)
    expect(result.error).toBe('所有子任务信息不完整')
    expect(result.drafts).toBeUndefined()
  })

  it('parseMultiTask 抛出异常 → 返回 success=false + 错误消息', async () => {
    mockParseMultiTask.mockRejectedValueOnce(new Error('LLM 网络超时'))

    const result = await parseTimeboxBatchIntentOnly('10:30-12:30 完成OKR计划')

    expect(result.success).toBe(false)
    expect(result.error).toBe('LLM 网络超时')
  })
})

// [023-01+ v2] resolveShortcut payload-aware 回归
//   根因 RC-1：matchShortcut 正则用 $ 结尾 + resolveShortcut 传整条 rawInput，
//   导致 /createTimebox [payload] 解析为 null → Commit 4 路由条件恒 false
//   → chat 落到 submitIntent → parseWithAI 非确定性（tasks/"任务标题必填" or "处理失败"）
//   修复：resolveShortcut 取首个空白前的 command token 再 matchShortcut
describe('resolveShortcut（[023-01+ v2] /cmd [payload] 须能解析出 domain/action）', () => {
  it('/createTimebox 晚上 21:00-23:00 外出看电影 → timebox/createTimebox（RC-1 核心）', async () => {
    const r = await resolveShortcut('/createTimebox 晚上 21:00-23:00 外出看电影')
    // 修复前：返回 null（matchShortcut 正则 $ 拒绝 payload）
    expect(r).not.toBeNull()
    expect(r?.domainId).toBe('timebox')
    expect(r?.action).toBe('createTimebox')
  })

  it('/createTimebox（无 payload）→ timebox/createTimebox（回归守护）', async () => {
    const r = await resolveShortcut('/createTimebox')
    expect(r?.domainId).toBe('timebox')
    expect(r?.action).toBe('createTimebox')
  })

  it('/createHabit 每天跑步 → habits/createHabit（跨域守护）', async () => {
    const r = await resolveShortcut('/createHabit 每天跑步')
    expect(r?.domainId).toBe('habits')
    expect(r?.action).toBe('createHabit')
  })

  it('/createTimebox 上午完成OKR计划（含空格标题）→ timebox/createTimebox', async () => {
    const r = await resolveShortcut('/createTimebox 上午完成OKR计划')
    expect(r?.domainId).toBe('timebox')
    expect(r?.action).toBe('createTimebox')
  })
})

// [028] T10: scheduleProposal manifest-driven 接线守护
//   manifest A-block intent_triggers 声明：
//     - action: scheduleProposal, shortcut: /smartTimeboxes
//   resolveShortcut manifest-driven 自动解析（无需 intent.ts 手写 action map）。
//   旧 /smartTimeboxes shortcut 必须保留为兼容入口（fold-in T10-fix），
//   也走同一 scheduleProposal action（manifest 已声明）。
describe('resolveShortcut（[028] T10 manifest-driven scheduleProposal）', () => {
  it('/ScheduleProposal（长格式）→ timebox/scheduleProposal', async () => {
    const r = await resolveShortcut('/ScheduleProposal')
    expect(r).not.toBeNull()
    expect(r?.domainId).toBe('timebox')
    expect(r?.action).toBe('scheduleProposal')
  })

  it('/smartTimeboxes（短格式兼容入口）→ timebox/scheduleProposal', async () => {
    // fold-in T10-fix：/smartTimeboxes 兼容旧入口，manifest A-block 已声明
    //   shortcut: /smartTimeboxes for action: scheduleProposal
    const r = await resolveShortcut('/smartTimeboxes')
    expect(r).not.toBeNull()
    expect(r?.domainId).toBe('timebox')
    expect(r?.action).toBe('scheduleProposal')
  })

  it('/timebox:scheduleProposal（长格式含域前缀）→ timebox/scheduleProposal', async () => {
    const r = await resolveShortcut('/timebox:scheduleProposal')
    expect(r).not.toBeNull()
    expect(r?.domainId).toBe('timebox')
    expect(r?.action).toBe('scheduleProposal')
  })
})

// [023.11] parseTimeboxBatchIntentOnly 被动推断 archetype
//   createTimebox dry-run 后再过 archetype-matcher 填 activityArchetypeId
//   （仅字段为空时填；degrade gracefully）
describe('[023.11] parseTimeboxBatchIntentOnly 被动推断 archetype', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // 复位顶层 module mock（vi.clearAllMocks 会清调用记录但保留实现；
    // mockImplementationOnce 一次性覆盖需要重新挂回默认实现以保证独立性）
    vi.mocked(ActivityArchetypeRepository).mockImplementation(function () {
      return { findByUser: vi.fn().mockResolvedValue([]) } as unknown as InstanceType<typeof ActivityArchetypeRepository>
    })
  })

  it('matcher 命中 → drafts 带 activityArchetypeId', async () => {
    mockParseMultiTask.mockResolvedValueOnce({
      success: true,
      intents: [
        {
          id: 'i1', intentionId: 't', targetDomain: 'timebox', action: 'create_timebox',
          fields: { title: '深度专注写作', startTime: '2026-07-06T14:00:00+08:00', duration: 60, endTime: '2026-07-06T15:00:00+08:00' },
          confidence: 0.9, resolvedBy: 'ai', createdAt: '',
        },
      ],
    })
    vi.mocked(ActivityArchetypeRepository).mockImplementationOnce(function () {
      return { findByUser: vi.fn().mockResolvedValue([{ id: 'a1' }, { id: 'a2' }]) } as unknown as InstanceType<typeof ActivityArchetypeRepository>
    })
    mockMatchArchetypes.mockResolvedValueOnce([{ archetypeId: 'a1', confidence: 0.9, source: 'rule' }])
    const r = await parseTimeboxBatchIntentOnly('下午深度专注写作')
    expect(r.success).toBe(true)
    expect(r.drafts![0].activityArchetypeId).toBe('a1')
  })

  it('matcher 未命中 → activityArchetypeId undefined', async () => {
    mockParseMultiTask.mockResolvedValueOnce({
      success: true,
      intents: [
        {
          id: 'i1', intentionId: 't', targetDomain: 'timebox', action: 'create_timebox',
          fields: { title: '未知活动', startTime: '2026-07-06T14:00:00+08:00', duration: 60, endTime: '2026-07-06T15:00:00+08:00' },
          confidence: 0.9, resolvedBy: 'ai', createdAt: '',
        },
      ],
    })
    vi.mocked(ActivityArchetypeRepository).mockImplementationOnce(function () {
      return { findByUser: vi.fn().mockResolvedValue([{ id: 'a1' }]) } as unknown as InstanceType<typeof ActivityArchetypeRepository>
    })
    mockMatchArchetypes.mockResolvedValueOnce([null])
    const r = await parseTimeboxBatchIntentOnly('未知活动')
    expect(r.drafts![0].activityArchetypeId).toBeUndefined()
  })

  it('[错误路径] archetype repo 抛错 → degrade：drafts 仍 success 不带 archetypeId', async () => {
    // 改为 reject：findByUser 抛错
    vi.mocked(ActivityArchetypeRepository).mockImplementationOnce(function () {
      return { findByUser: vi.fn().mockRejectedValue(new Error('db down')) } as unknown as InstanceType<typeof ActivityArchetypeRepository>
    })
    mockParseMultiTask.mockResolvedValueOnce({
      success: true,
      intents: [
        {
          id: 'i1', intentionId: 't', targetDomain: 'timebox', action: 'create_timebox',
          fields: { title: '写代码', startTime: '2026-07-06T14:00:00+08:00', duration: 60, endTime: '2026-07-06T15:00:00+08:00' },
          confidence: 0.9, resolvedBy: 'ai', createdAt: '',
        },
      ],
    })
    const r = await parseTimeboxBatchIntentOnly('写代码')
    expect(r.success).toBe(true)
    expect(r.drafts![0].activityArchetypeId).toBeUndefined()
  })

  it('[错误路径] archetypes 为空 → 跳过 matcher', async () => {
    mockParseMultiTask.mockResolvedValueOnce({
      success: true,
      intents: [
        {
          id: 'i1', intentionId: 't', targetDomain: 'timebox', action: 'create_timebox',
          fields: { title: '写代码', startTime: '2026-07-06T14:00:00+08:00', duration: 60, endTime: '2026-07-06T15:00:00+08:00' },
          confidence: 0.9, resolvedBy: 'ai', createdAt: '',
        },
      ],
    })
    // default mock: findByUser returns []
    const r = await parseTimeboxBatchIntentOnly('写代码')
    expect(r.drafts![0].activityArchetypeId).toBeUndefined()
    expect(mockMatchArchetypes).not.toHaveBeenCalled()
  })
})

// [026.02.4] TD-028 Site 1: matchTarget 用 deriveTimeboxDisplayStatus 判 'running'。
//   修前:status === 'running' → 持久化层无值,永远返 null,AI 解析「现在的」「跑着的」等表达找不到 tb
//   修后:deriveTimeboxDisplayStatus(status, start, end, now) === 'running'
//   本测试守护 derive 语义,确保 Site 1 不退化。
describe('[026.02.4] TD-028 Site 1 — matchTarget predicate deriveTimeboxDisplayStatus', () => {
  const now = new Date('2026-07-09T12:00:00Z')
  const start = new Date('2026-07-09T11:00:00Z').toISOString()
  const end = new Date('2026-07-09T13:00:00Z').toISOString()

  it('planned + now ∈ [startTime, endTime] → "running"', () => {
    expect(deriveTimeboxDisplayStatus('planned', start, end, now)).toBe('running')
  })

  it('planned + now > endTime → "overtime" (派生显示态;非持久化 status)', () => {
    const later = new Date('2026-07-09T14:00:00Z')
    expect(deriveTimeboxDisplayStatus('planned', start, end, later)).toBe('overtime')
  })

  it('logged / cancelled 持久化状态直接返 null (不派生)', () => {
    expect(deriveTimeboxDisplayStatus('logged', start, end, now)).toBeNull()
    expect(deriveTimeboxDisplayStatus('cancelled', start, end, now)).toBeNull()
  })
})
