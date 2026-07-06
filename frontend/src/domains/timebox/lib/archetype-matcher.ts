/**
 * @file archetype-matcher
 * @brief [023.11] 活动原型匹配原语（规则优先 + LLM 兜底）
 *
 * 纯函数 —— DB/aiRuntime 由调用方注入（守 R-01，便于单测 mock）。
 *
 * 规则轮（本地）：标题归一化后判 l2Name 或任一 synonym 的子串包含。
 *   正向包含（title 含 term）→ 0.9；反向包含（term 含 title，title≥3 字）→ 0.75（[C5] 防短词误匹配）。正向优先。
 * LLM 兜底轮（仅对规则未命中的非空标题，批量一次）：注入 archetype 目录（含 synonyms），
 *   要求 results 按输入 titles 顺序返回（位置匹配，Issue 1），长度不等则整体降级 null。
 */
import type { AIRuntime } from '@/nexus/ai-runtime'
import type { ActivityArchetype } from '@/usom/activity-archetype/types'

export interface ArchetypeMatch {
  archetypeId: string
  confidence: number
  source: 'rule' | 'llm'
}

export const RULE_CONFIDENCE = 0.9
/** [C5] 反向包含（term 含 title，title≥3 字）—— 较低置信，避免短标题过度自信误匹配 */
export const REVERSE_CONFIDENCE = 0.75
export const LLM_THRESHOLD = 0.7

function normalizeTitle(title: string): string {
  return title.trim().toLowerCase()
    .replace(/\d{1,2}\s*[：:]\s*\d{1,2}/g, '')
    .replace(/\d{1,2}\s*点(半)?/g, '')
    .replace(/(上午|下午|早上|晚上|凌晨|中午)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * 规则轮：单标题在目录里找匹配。
 * - 正向包含（title 含 term）→ RULE_CONFIDENCE(0.9)，取最长 term
 * - 反向包含（term 含 title，且 title≥3 字）→ REVERSE_CONFIDENCE(0.75)，取最长 term
 * - 正向优先于反向（正向更具体）；都不命中 → null（交 LLM 兜底）
 * [C5] 反向要求 title≥3 字 + 降置信，挡住 2 字泛词（如"工作"/"运动"）误匹配。
 */
function ruleMatch(title: string, archetypes: ActivityArchetype[]): ArchetypeMatch | null {
  const norm = normalizeTitle(title)
  if (!norm) return null
  let bestForward: { a: ActivityArchetype; score: number } | null = null
  let bestReverse: { a: ActivityArchetype; score: number } | null = null
  for (const a of archetypes) {
    const terms = [a.l2Name, ...(a.synonyms ?? [])]
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.length > 0)
    for (const t of terms) {
      if (norm.includes(t)) {
        if (!bestForward || t.length > bestForward.score) bestForward = { a, score: t.length }
      } else if (norm.length >= 3 && t.includes(norm)) {
        if (!bestReverse || t.length > bestReverse.score) bestReverse = { a, score: t.length }
      }
    }
  }
  if (bestForward) return { archetypeId: bestForward.a.id, confidence: RULE_CONFIDENCE, source: 'rule' }
  if (bestReverse) return { archetypeId: bestReverse.a.id, confidence: REVERSE_CONFIDENCE, source: 'rule' }
  return null
}

function parseLoose(raw: string): unknown {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)
  return JSON.parse((fenced ? fenced[1] : raw).trim())
}

/** LLM 兜底：批量未命中标题一次调用，位置匹配（Issue 1） */
async function llmMatch(
  titles: string[],
  archetypes: ActivityArchetype[],
  aiRuntime: AIRuntime,
): Promise<(ArchetypeMatch | null)[]> {
  const catalog = archetypes.map((a) => ({
    id: a.id, l2Name: a.l2Name, l1Category: a.l1Category, synonyms: a.synonyms ?? [],
    environment: a.activityLabel?.environment ?? [], location: a.activityLabel?.location ?? [],
  }))
  const systemPrompt = [
    '你是活动原型分类器。依据用户活动标题，从已有原型目录里选最匹配的一项。',
    '规则：',
    '- 只能从目录已有 id 里选，禁止编造 id。',
    '- 输出严格 JSON：{ "results": [{ "archetypeId": "<id 或 null>", "confidence": <0-1> }] }',
    '- results 必须与输入 titles 顺序一一对应、长度相等（不要回传 title，按下标对应）。',
    '- 无合适项时 archetypeId 给 null 或 confidence < 0.7。',
    '- 标题与原型语义无关时给低分。',
  ].join('\n')
  const resp = await aiRuntime.generate({
    domainId: 'timebox', action: 'matchArchetype', systemPrompt,
    messages: [{ role: 'user', content: JSON.stringify({ archetypes: catalog, titles }) }],
    taskType: 'field_extraction', temperature: 0,
  })
  const content = resp.content
  const jsonStr = typeof content === 'string' ? content : JSON.stringify(content)
  let parsed: { results?: Array<{ archetypeId: string | null; confidence: number } | null> }
  try {
    parsed = parseLoose(jsonStr) as typeof parsed
  } catch {
    return titles.map(() => null)
  }
  const arr = parsed.results ?? []
  // Issue 1：位置匹配；长度不对齐 → 整体降级（防 LLM 丢条/并条导致错位）
  if (!Array.isArray(arr) || arr.length !== titles.length) return titles.map(() => null)
  const validIds = new Set(archetypes.map((a) => a.id))
  return titles.map((_, i) => {
    const hit = arr[i]
    if (!hit || !hit.archetypeId) return null
    if (!validIds.has(hit.archetypeId)) return null
    if (typeof hit.confidence !== 'number' || hit.confidence < LLM_THRESHOLD) return null
    return { archetypeId: hit.archetypeId, confidence: hit.confidence, source: 'llm' }
  })
}

export async function matchArchetypesForTitles(
  titles: string[],
  archetypes: ActivityArchetype[],
  aiRuntime: AIRuntime,
): Promise<(ArchetypeMatch | null)[]> {
  if (archetypes.length === 0) return titles.map(() => null)
  const results: (ArchetypeMatch | null)[] = titles.map((t) => (t && t.trim() ? ruleMatch(t, archetypes) : null))
  const missIdx = titles.map((t, i) => ({ t, i })).filter((x) => !results[x.i] && x.t && x.t.trim())
  if (missIdx.length === 0) return results
  const llmHits = await llmMatch(missIdx.map((x) => x.t), archetypes, aiRuntime)
  missIdx.forEach((x, k) => { results[x.i] = llmHits[k] })
  return results
}
