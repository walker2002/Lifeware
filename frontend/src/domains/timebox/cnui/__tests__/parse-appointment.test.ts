/**
 * @file parse-appointment
 * @brief [026] A2.1 parseAppointmentIntentOnly 单元测试
 *
 * 覆盖：
 * - ";" 多记录分隔符 → 多 drafts
 * - "@" 前缀提取 people
 * - 纯中文（无 @ 无 ;）→ 单 draft 默认 people=[]
 * - LLM 返回格式坏 → success=false + error
 * - parseAppointmentWithAI 底层 mock LLM 行为
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AIRuntime } from '@/nexus/ai-runtime'
import type { AIGenerateResponse } from '@/nexus/ai-runtime/types'
import { parseAppointmentIntent } from '@/domains/timebox/cnui/parse-appointments'

// ── Mock AIRuntime factory（参考 ai-parser-migration.test.ts） ──

function createMockAIRuntime(response: Partial<AIGenerateResponse> & { text?: string }): AIRuntime {
  const fullResponse: AIGenerateResponse = {
    content: response.content ?? response.text ?? '',
    tokenUsage: response.tokenUsage ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    model: response.model ?? 'test-model',
    cached: false,
    ...response,
  }
  return {
    generate: vi.fn().mockResolvedValue(fullResponse),
    stream: vi.fn(),
    gateway: {} as never,
    budget: { record: vi.fn(), getDailySummary: vi.fn() },
    cache: { get: vi.fn(), set: vi.fn(), invalidate: vi.fn(), clear: vi.fn(), generateKey: vi.fn() },
  } as unknown as AIRuntime
}

describe('parseAppointmentWithAI（[026] A2.1 LLM 解析 — 底层）', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('";" 分隔多记录 → 多 drafts', async () => {
    const { parseAppointmentWithAI } = await import('@/nexus/core/intent-engine/ai-parser')
    const aiRuntime = createMockAIRuntime({
      content: {
        drafts: [
          {
            title: '看牙医',
            startTime: '2026-07-15T14:00:00+08:00',
            durationMin: 60,
            people: [],
            confidence: 0.9,
          },
          {
            title: '吃饭',
            startTime: '2026-07-17T19:00:00+08:00',
            durationMin: 90,
            people: ['张三'],
            confidence: 0.92,
          },
        ],
      },
    })

    const result = await parseAppointmentWithAI(
      '7月15日下午2点看牙医；下周三19:00 @张三 吃饭',
      aiRuntime,
    )

    expect(result.success).toBe(true)
    expect(result.drafts).toHaveLength(2)
    expect(result.drafts[0].title).toBe('看牙医')
    expect(result.drafts[0].durationMin).toBe(60)
    expect(result.drafts[1].title).toBe('吃饭')
    expect(result.drafts[1].people).toEqual(['张三'])
  })

  it('"@" 前缀提取 people（多 @）', async () => {
    const { parseAppointmentWithAI } = await import('@/nexus/core/intent-engine/ai-parser')
    const aiRuntime = createMockAIRuntime({
      content: {
        drafts: [
          {
            title: '开会',
            startTime: '2026-07-20T15:00:00+08:00',
            durationMin: 60,
            people: ['张三', '李四'],
            confidence: 0.9,
          },
        ],
      },
    })

    const result = await parseAppointmentWithAI('@张三 @李四 开会', aiRuntime)

    expect(result.success).toBe(true)
    expect(result.drafts[0].people).toEqual(['张三', '李四'])
  })

  it('纯中文（无 @ 无 ;）→ 单 draft 默认 people=[]', async () => {
    const { parseAppointmentWithAI } = await import('@/nexus/core/intent-engine/ai-parser')
    const aiRuntime = createMockAIRuntime({
      content: {
        drafts: [
          {
            title: '看书',
            startTime: '2026-07-10T20:00:00+08:00',
            durationMin: 60,
            people: [],
            confidence: 0.85,
          },
        ],
      },
    })

    const result = await parseAppointmentWithAI('晚上8点看书', aiRuntime)

    expect(result.success).toBe(true)
    expect(result.drafts).toHaveLength(1)
    expect(result.drafts[0].title).toBe('看书')
    expect(result.drafts[0].people).toEqual([])
  })

  it('LLM 返回坏 JSON → success=false + 错误', async () => {
    const { parseAppointmentWithAI } = await import('@/nexus/core/intent-engine/ai-parser')
    const aiRuntime = createMockAIRuntime({
      content: '这不是 JSON',
    })

    const result = await parseAppointmentWithAI('测试', aiRuntime)

    expect(result.success).toBe(false)
    expect(result.drafts).toEqual([])
    expect(result.error).toContain('无法解析')
  })

  it('LLM 返回空 content → success=false', async () => {
    const { parseAppointmentWithAI } = await import('@/nexus/core/intent-engine/ai-parser')
    const aiRuntime = createMockAIRuntime({
      content: '',
    })

    const result = await parseAppointmentWithAI('测试', aiRuntime)

    expect(result.success).toBe(false)
    expect(result.error).toBe('LLM 返回内容为空')
  })

  it('LLM 返回 markdown 代码块 → 仍能提取 JSON', async () => {
    const { parseAppointmentWithAI } = await import('@/nexus/core/intent-engine/ai-parser')
    const aiRuntime = createMockAIRuntime({
      content:
        '```json\n{"drafts":[{"title":"开会","startTime":"2026-07-15T15:00:00+08:00","durationMin":60,"people":["张三"],"confidence":0.9}]}\n```',
    })

    const result = await parseAppointmentWithAI('测试', aiRuntime)

    expect(result.success).toBe(true)
    expect(result.drafts[0].title).toBe('开会')
    expect(result.drafts[0].people).toEqual(['张三'])
  })

  it('AI Runtime 抛出 → success=false + 错误透传', async () => {
    const { parseAppointmentWithAI } = await import('@/nexus/core/intent-engine/ai-parser')
    const aiRuntime = {
      generate: vi.fn().mockRejectedValue(new Error('API 连接超时')),
    } as unknown as AIRuntime

    const result = await parseAppointmentWithAI('测试', aiRuntime)

    expect(result.success).toBe(false)
    expect(result.error).toContain('API 连接超时')
  })

  it('过滤缺字段 draft（缺 durationMin）→ 只返回完整 draft', async () => {
    const { parseAppointmentWithAI } = await import('@/nexus/core/intent-engine/ai-parser')
    const aiRuntime = createMockAIRuntime({
      content: {
        drafts: [
          {
            title: '看牙医',
            startTime: '2026-07-15T14:00:00+08:00',
            durationMin: 60,
            people: [],
            confidence: 0.9,
          },
          {
            // 缺 durationMin → 应被过滤
            title: '无效',
            startTime: '2026-07-16T10:00:00+08:00',
            people: [],
            confidence: 0.5,
          },
        ],
      },
    })

    const result = await parseAppointmentWithAI('测试', aiRuntime)

    expect(result.success).toBe(true)
    expect(result.drafts).toHaveLength(1)
    expect(result.drafts[0].title).toBe('看牙医')
  })

  it('drafts 为空数组 → success=false', async () => {
    const { parseAppointmentWithAI } = await import('@/nexus/core/intent-engine/ai-parser')
    const aiRuntime = createMockAIRuntime({
      content: { drafts: [] },
    })

    const result = await parseAppointmentWithAI('测试', aiRuntime)

    expect(result.success).toBe(false)
    expect(result.error).toBe('未识别到有效的约定')
  })

  it('systemPrompt 应含「约定意图解析器」与「@」提取规则', async () => {
    const { parseAppointmentWithAI } = await import('@/nexus/core/intent-engine/ai-parser')
    const aiRuntime = createMockAIRuntime({
      content: {
        drafts: [
          {
            title: '测试',
            startTime: '2026-07-15T10:00:00+08:00',
            durationMin: 60,
            people: [],
            confidence: 0.9,
          },
        ],
      },
    })

    await parseAppointmentWithAI('测试', aiRuntime)

    const callArg = (aiRuntime.generate as ReturnType<typeof vi.fn>).mock.calls[0][0]
    expect(callArg.taskType).toBe('field_extraction')
    expect(callArg.systemPrompt).toContain('约定意图解析器')
    expect(callArg.systemPrompt).toContain('@')
    expect(callArg.systemPrompt).toContain('；')  // 全角分号分隔符
  })
})

// [026] A2.1 parseAppointmentIntentOnly Server Action（mock 底层 ai-parser）
describe('parseAppointmentIntentOnly（[026] A2.1 约定 dry-run）', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('解析成功 → 返回 drafts（透传底层）', async () => {
    const aiParser = await import('@/nexus/core/intent-engine/ai-parser')
    const spy = vi.spyOn(aiParser, 'parseAppointmentWithAI').mockResolvedValueOnce({
      success: true,
      drafts: [
        { title: '看牙医', startTime: '2026-07-15T14:00:00+08:00', durationMin: 60, people: [] },
      ],
    })

    const { parseAppointmentIntentOnly } = await import('@/app/actions/intent')
    const result = await parseAppointmentIntentOnly('7月15日下午2点看牙医')

    expect(spy).toHaveBeenCalledOnce()
    expect(result.success).toBe(true)
    expect(result.drafts).toHaveLength(1)
    expect(result.drafts?.[0].title).toBe('看牙医')
  })

  it('底层解析失败 → success=false + 错误透传', async () => {
    const aiParser = await import('@/nexus/core/intent-engine/ai-parser')
    vi.spyOn(aiParser, 'parseAppointmentWithAI').mockResolvedValueOnce({
      success: false,
      drafts: [],
      error: '无法解析约定 JSON 响应',
    })

    const { parseAppointmentIntentOnly } = await import('@/app/actions/intent')
    const result = await parseAppointmentIntentOnly('乱七八糟的输入')

    expect(result.success).toBe(false)
    expect(result.drafts).toBeUndefined()
    expect(result.error).toBe('无法解析约定 JSON 响应')
  })

  it('底层抛出异常 → success=false + 错误透传', async () => {
    const aiParser = await import('@/nexus/core/intent-engine/ai-parser')
    vi.spyOn(aiParser, 'parseAppointmentWithAI').mockRejectedValueOnce(new Error('LLM 网络超时'))

    const { parseAppointmentIntentOnly } = await import('@/app/actions/intent')
    const result = await parseAppointmentIntentOnly('7月15日下午2点看牙医')

    expect(result.success).toBe(false)
    expect(result.error).toBe('LLM 网络超时')
    expect(result.drafts).toBeUndefined()
  })
})

// [026.01] T2 parseAppointmentIntent —— EditAppointment 解析优先模式
describe('parseAppointmentIntent', () => {
  const todayAppointments = [
    { id: 'a-1', title: '看牙医', startTime: '2026-07-15T14:00:00Z', durationMin: 60, status: 'scheduled' },
    { id: 'a-2', title: '和张三吃饭', startTime: '2026-07-16T19:00:00Z', durationMin: 90, status: 'scheduled' },
  ]

  it('returns edit with appointmentId when high confidence match', async () => {
    const runtime = createMockAIRuntime({ text: JSON.stringify({
      kind: 'edit',
      appointmentId: 'a-1',
      newStartTime: '2026-07-15T15:00:00Z',
      newDurationMin: 0,
      newTitle: '',
      confidence: 0.95,
      reason: '',
    }) })
    const result = await parseAppointmentIntent('把看牙医改到下午3点', todayAppointments, runtime)
    expect(result.kind).toBe('edit')
    if (result.kind === 'edit') {
      expect(result.appointmentId).toBe('a-1')
      expect(result.newStartTime).toBe('2026-07-15T15:00:00Z')
      expect(result.confidence).toBe(0.95)
    }
  })

  it('returns unsure when prompt is empty', async () => {
    const runtime = createMockAIRuntime({ text: '' })
    const result = await parseAppointmentIntent('', todayAppointments, runtime)
    expect(result.kind).toBe('unsure')
  })

  it('returns unsure when todayAppointments is empty', async () => {
    const runtime = createMockAIRuntime({ text: '' })
    const result = await parseAppointmentIntent('把看牙医改到下午3点', [], runtime)
    expect(result.kind).toBe('unsure')
  })

  it('returns unsure when LLM response is non-JSON', async () => {
    const runtime = createMockAIRuntime({ text: '不是 JSON' })
    const result = await parseAppointmentIntent('把看牙医改到下午3点', todayAppointments, runtime)
    expect(result.kind).toBe('unsure')
  })

  it('returns unsure when appointmentId not in candidates', async () => {
    const runtime = createMockAIRuntime({ text: JSON.stringify({
      kind: 'edit',
      appointmentId: 'ghost-id',
      newStartTime: '',
      newDurationMin: 0,
      confidence: 0.9,
      reason: '',
    }) })
    const result = await parseAppointmentIntent('ghost match', todayAppointments, runtime)
    expect(result.kind).toBe('unsure')
  })

  it('returns unsure when LLM throws', async () => {
    const runtime = { generate: async () => { throw new Error('mock LLM 异常') } }
    const result = await parseAppointmentIntent('把看牙医改到下午3点', todayAppointments, runtime as any)
    expect(result.kind).toBe('unsure')
  })
})
