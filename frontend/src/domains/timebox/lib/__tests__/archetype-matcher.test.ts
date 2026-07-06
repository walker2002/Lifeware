/**
 * @file archetype-matcher.test
 * @brief [023.11] 活动原型匹配原语单测（规则含 synonyms + LLM 位置匹配）
 */
import { describe, it, expect, vi } from 'vitest'
import { matchArchetypesForTitles, RULE_CONFIDENCE, REVERSE_CONFIDENCE, LLM_THRESHOLD } from '../archetype-matcher'
import type { ActivityArchetype } from '@/usom/activity-archetype/types'
import type { AIRuntime } from '@/nexus/ai-runtime'

function arch(id: string, l2Name: string, synonyms: string[] = []): ActivityArchetype {
  return {
    id, l2Name, synonyms,
    l1Category: '工作' as never,
    energyCost: { physical: 1, mental: 1, emotional: 1, creative: 1 },
    activityLabel: { enjoyment: 5, typicalDuration: 60, interruptTolerance: 'medium', environment: [], location: [], parallelizable: false },
    isSystem: false, userId: 'u', createdAt: '', updatedAt: '',
  } as ActivityArchetype
}
function mockRuntime(content: string): AIRuntime {
  return { generate: vi.fn().mockResolvedValue({ content }) } as unknown as AIRuntime
}

describe('[023.11] archetype-matcher', () => {
  it('常量门槛', () => { expect(RULE_CONFIDENCE).toBe(0.9); expect(LLM_THRESHOLD).toBe(0.7) })

  it('规则精确命中 l2Name → rule', async () => {
    const [r] = await matchArchetypesForTitles(['深度专注'], [arch('a1', '深度专注')], mockRuntime('x'))
    expect(r).toEqual({ archetypeId: 'a1', confidence: RULE_CONFIDENCE, source: 'rule' })
  })

  it('[synonyms] 规则命中同义词（标题不含 l2Name）→ rule，零 LLM', async () => {
    const runtime = mockRuntime('x')
    const [r] = await matchArchetypesForTitles(['写代码'], [arch('a1', '深度专注', ['写代码', '编程'])], runtime)
    expect(r).toEqual({ archetypeId: 'a1', confidence: RULE_CONFIDENCE, source: 'rule' })
    expect(runtime.generate).not.toHaveBeenCalled()
  })

  it('规则子串命中 l2Name → rule', async () => {
    const [r] = await matchArchetypesForTitles(['下午深度专注写作'], [arch('a1', '深度专注')], mockRuntime('x'))
    expect(r?.source).toBe('rule'); expect(r?.archetypeId).toBe('a1')
  })

  it('多 archetype 命中 → 取最长匹配串', async () => {
    const [r] = await matchArchetypesForTitles(['深度专注'], [arch('a1', '专注'), arch('a2', '深度专注')], mockRuntime('x'))
    expect(r?.archetypeId).toBe('a2')
  })

  it('[C5] 反向包含（title≥3 字，term 含 title）→ REVERSE_CONFIDENCE(0.75)', async () => {
    // title '深度专注'(4字) 是 l2Name '深度专注工作' 的子串 → 反向包含
    const [r] = await matchArchetypesForTitles(['深度专注'], [arch('a1', '深度专注工作')], mockRuntime('x'))
    expect(r).toEqual({ archetypeId: 'a1', confidence: REVERSE_CONFIDENCE, source: 'rule' })
  })

  it('[C5] 2 字标题不触发反向包含 → 落 LLM（防泛词误匹配）', async () => {
    // title '专注'(2字) 是 l2Name '深度专注' 的子串，但 <3 字 → 反向被挡 → 规则 null
    const runtime = mockRuntime(JSON.stringify({ results: [{ archetypeId: 'a1', confidence: 0.8 }] }))
    const [r] = await matchArchetypesForTitles(['专注'], [arch('a1', '深度专注')], runtime)
    expect(r?.source).toBe('llm') // 规则未命中，LLM 兜底
  })

  it('[C5] 正向包含优先于反向（同时命中取正向高置信）', async () => {
    // a1 l2Name='深度专注'(正向命中 title '深度专注')；a2 l2Name='深度专注工作'(反向命中)
    const [r] = await matchArchetypesForTitles(['深度专注'],
      [arch('a1', '深度专注'), arch('a2', '深度专注工作')], mockRuntime('x'))
    expect(r?.archetypeId).toBe('a1')
    expect(r?.confidence).toBe(RULE_CONFIDENCE)
  })

  it('规则未命中 → LLM 位置匹配命中（≥门槛）→ llm', async () => {
    const runtime = mockRuntime(JSON.stringify({ results: [{ archetypeId: 'a1', confidence: 0.8 }] }))
    const [r] = await matchArchetypesForTitles(['写代码'], [arch('a1', '深度专注', ['编程'])], runtime)
    expect(r).toEqual({ archetypeId: 'a1', confidence: 0.8, source: 'llm' })
  })

  it('LLM confidence < 门槛 → null', async () => {
    const runtime = mockRuntime(JSON.stringify({ results: [{ archetypeId: 'a1', confidence: 0.4 }] }))
    const [r] = await matchArchetypesForTitles(['吃饭'], [arch('a1', '深度专注')], runtime)
    expect(r).toBeNull()
  })

  it('LLM 返回不存在 id → null（防幻觉）', async () => {
    const runtime = mockRuntime(JSON.stringify({ results: [{ archetypeId: 'ghost', confidence: 0.9 }] }))
    const [r] = await matchArchetypesForTitles(['写代码'], [arch('a1', '深度专注')], runtime)
    expect(r).toBeNull()
  })

  it('LLM 结果长度与 titles 不等 → 全 null（Issue 1 位置匹配安全降级）', async () => {
    const runtime = mockRuntime(JSON.stringify({ results: [{ archetypeId: 'a1', confidence: 0.9 }] }))
    const res = await matchArchetypesForTitles(['写代码', '跑步'], [arch('a1', '深度专注')], runtime)
    expect(res).toEqual([null, null])
  })

  it('LLM 畸形 JSON → null（不抛）', async () => {
    const [r] = await matchArchetypesForTitles(['写代码'], [arch('a1', '深度专注')], mockRuntime('not json'))
    expect(r).toBeNull()
  })

  it('空标题 → null', async () => {
    const [r] = await matchArchetypesForTitles([''], [arch('a1', '深度专注')], mockRuntime('x'))
    expect(r).toBeNull()
  })

  it('空 archetypes → 全 null 且不发 LLM', async () => {
    const runtime = mockRuntime('x')
    expect(await matchArchetypesForTitles(['写代码'], [], runtime)).toEqual([null])
    expect(runtime.generate).not.toHaveBeenCalled()
  })

  it('batch 混合：部分规则部分 LLM → 单次 LLM 调用，位置对齐', async () => {
    const runtime = mockRuntime(JSON.stringify({ results: [{ archetypeId: 'a2', confidence: 0.85 }] }))
    const res = await matchArchetypesForTitles(
      ['深度专注写作', '散步'],
      [arch('a1', '深度专注', ['写代码']), arch('a2', '有氧运动', ['跑步'])],
      runtime,
    )
    expect(res[0]).toMatchObject({ archetypeId: 'a1', source: 'rule' })   // titles[0] 规则命中
    expect(res[1]).toMatchObject({ archetypeId: 'a2', source: 'llm' })    // titles[1] LLM 兜底
    expect(runtime.generate).toHaveBeenCalledTimes(1)
  })

  it('时间词被剥：含 HH:MM/点/时段词仍规则命中', async () => {
    const [r] = await matchArchetypesForTitles(['下午14:00 深度专注'], [arch('a1', '深度专注')], mockRuntime('x'))
    expect(r?.source).toBe('rule')
  })
})
