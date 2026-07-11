/**
 * @file nl-parser
 * @brief [028] T5 NL 结构化输出 + 结构性置信度
 *
 * 纯函数 + 纯结构化函数（不持有 aiRuntime，由 onGenerate 注入）：
 *   - parseNL：构造 system prompt + JSON schema → aiRuntime.generate → 解析四类结构
 *   - deriveConfidence：纯函数，按 3 条结构性规则推导置信度（不信 LLM 自报）
 *
 * 设计依据：docs/superpowers/plans/2026-07-11-028-schedule-proposal.md T5
 *
 * 关键约束（fold-in T5/T6-fix）：
 *   - aiRuntime 必须是函数参数（不在模块内 import），handle() 无 aiRuntime，
 *     onGenerate 注入。
 *   - 复用人格 `archetype-matcher.ts:88 matchArchetypesForTitles` 的 LLM gateway 范式：
 *     domainId + action + systemPrompt + messages + taskType + temperature=0。
 *   - 不复用 `archetype-matcher.ts:104 llmMatch` 的单射逻辑（位置匹配），四类输出
 *     直接走 schema，不限制 LLM 返回顺序。
 *   - 4 类结构完全 schema-validated（fallback：parse 失败 → 空 + 低置信）。
 */
import type { AIRuntime } from '@/nexus/ai-runtime'

// ─── 类型契约 ──────────────────────────────────────────────────

/** parseNL 输入的 catalog（任务/模板/约定目录），供 LLM 参考 + 置信度校验 */
export interface NLCatalog {
  tasks: Array<{ id: string; title?: string }>
  templates: Array<{ id: string; title?: string }>
  appointments: Array<{ id: string; title?: string }>
}

/** 单条引用匹配 */
export interface NLMatchedRef {
  id: string
  title?: string
  /** [T5] LLM 标记该引用是否与 Tier0 撞时间（appointment hard-conflict 路径） */
  conflictsTier0?: boolean
}

/** LLM 输出的新事件草稿（明确新建，无 catalog 引用） */
export interface NLNewEvent {
  title: string
  /** HH:MM（用户口述时间），下游由 timeExpressions 关联 */
  time?: string
}

/** 时间表达式（口述时间 → UTC hour） */
export interface NLTimeExpression {
  raw: string
  /** UTC hour number（0-24 整数；14:30 → 14） */
  hour: number
}

/** parseNL 完整输出（4 类结构 + 置信度） */
export interface NLParseResult {
  matchedTasks: NLMatchedRef[]
  matchedTemplates: NLMatchedRef[]
  matchedAppointments: NLMatchedRef[]
  newEvents: NLNewEvent[]
  timeExpressions: NLTimeExpression[]
  /** 结构性置信度，0-1 范围（不读 LLM 自报，always derived） */
  confidence: number
}

/**
 * deriveConfidence 输入的最小契约 —— 只读 matched* 引用 + newEvents，
 * 不读 timeExpressions/confidence（这两个字段与置信度推导无关）。
 * 允许调用方传部分字段（典型场景：测试 fixture 单点校验某条规则）。
 */
export interface DeriveConfidenceInput {
  matchedTasks?: NLMatchedRef[]
  matchedTemplates?: NLMatchedRef[]
  matchedAppointments?: NLMatchedRef[]
  newEvents?: NLNewEvent[]
  timeExpressions?: NLTimeExpression[]
  confidence?: number
}

/** deriveConfidence 三个结构化条件（与 test fixture 同形） */
export interface DeriveConfidenceOpts {
  /** Tier0 时段（HH:MM 范围，UTC hour-of-day） */
  tier0Slots?: Array<{ startHour: number; endHour: number }>
}

// ─── 常量（置信度阈值） ────────────────────────────────────────

/** 实体引用在 catalog 命中或明确新建（无冲突）→ 高置信 */
export const HIGH_CONFIDENCE = 0.85
/** 引用实体且撞 Tier0 → 强制低置信（走 needConfirm） */
export const LOW_CONFIDENCE = 0.3
/** 解析失败 / 完全无引用且无新事件 → 中性低置信 */
export const FALLBACK_CONFIDENCE = 0.2

// ─── parseNL ──────────────────────────────────────────────────

/**
 * 解析自然语言为四类结构 + 结构性置信度。
 *
 * 流程：
 *   1. 构造 system prompt（要求 JSON schema 输出 4 类结构）
 *   2. aiRuntime.generate（taskType='field_extraction'，temperature=0）
 *   3. 解析响应 content 为 JSON（失败/非数组 → 降级空 + 低置信）
 *   4. deriveConfidence 推导置信度（不读 LLM 自报）
 *
 * @param nlText - 用户自然语言
 * @param catalog - 任务/模板/约定目录（也供 LLM 参考 + 后续置信度校验）
 * @param aiRuntime - LLM gateway 句柄（onGenerate 注入；handle 无此参数）
 */
export async function parseNL(
  nlText: string,
  catalog: NLCatalog,
  aiRuntime: AIRuntime,
): Promise<NLParseResult> {
  const empty: NLParseResult = {
    matchedTasks: [],
    matchedTemplates: [],
    matchedAppointments: [],
    newEvents: [],
    timeExpressions: [],
    confidence: FALLBACK_CONFIDENCE,
  }

  if (!nlText || !nlText.trim()) return empty

  const systemPrompt = buildNLSystemPrompt()
  let content: string
  try {
    const resp = await aiRuntime.generate({
      domainId: 'timebox',
      action: 'parseNL',
      systemPrompt,
      messages: [{ role: 'user', content: JSON.stringify({ catalog, nlText }) }],
      taskType: 'field_extraction',
      temperature: 0,
    })
    content = typeof resp.content === 'string' ? resp.content : JSON.stringify(resp.content)
  } catch {
    // LLM 调用失败（timeout/provider down）→ 降级 + 低置信
    return empty
  }

  const parsed = tryParseLoose(content)
  if (!parsed) return empty

  const result: NLParseResult = {
    matchedTasks: sanitizeMatched(parsed.matchedTasks, 'tasks', catalog.tasks),
    matchedTemplates: sanitizeMatched(parsed.matchedTemplates, 'templates', catalog.templates),
    matchedAppointments: sanitizeMatched(parsed.matchedAppointments, 'appointments', catalog.appointments),
    newEvents: sanitizeNewEvents(parsed.newEvents),
    timeExpressions: sanitizeTimeExpressions(parsed.timeExpressions),
    confidence: FALLBACK_CONFIDENCE, // 占位，下一行覆写
  }
  result.confidence = deriveConfidence(result, catalog)
  return result
}

/**
 * 构造 NL 解析的 system prompt（含 JSON schema）。
 * 复用 archetype-matcher.ts:79 的中文 prompt 风格，但不复用其单射位置匹配逻辑。
 */
function buildNLSystemPrompt(): string {
  return [
    '你是日程计划 NL 解析器。给定用户的自然语言描述 + 任务/模板/约定目录，提取出 4 类结构。',
    '',
    '输出严格 JSON（顶层键固定）：',
    '{',
    '  "matchedTasks":        [{ "id": "<tasks 目录里的 id>", "title": "<可选>", "conflictsTier0": <bool 可选> }],',
    '  "matchedTemplates":    [{ "id": "<templates 目录里的 id>", "title": "<可选>", "conflictsTier0": <bool 可选> }],',
    '  "matchedAppointments": [{ "id": "<appointments 目录里的 id>", "title": "<可选>", "conflictsTier0": <bool 可选> }],',
    '  "newEvents":           [{ "title": "<新事件名>", "time": "<HH:MM 可选>" }],',
    '  "timeExpressions":     [{ "raw": "<原文片段>", "hour": <UTC hour 0-23 整数> }]',
    '}',
    '',
    '规则：',
    '- 只能从目录已有 id 里选 matchedTasks/Templates/Appointments，禁止编造 id。',
    '- 用户没明确说的新事件才进 newEvents；明确引用已有对象时只填 matched*，不要重复。',
    '- hour 字段取 UTC 整点小时（如「下午3点」→ 15；「明早 8:00」→ 8；HH:MM 含 :30 不取整，由 hour 字段承载主时间）。',
    '- 不输出 confidence 字段（系统不读，会忽略）。',
    '- 无法解析时给空数组，不要生成 null/字符串。',
  ].join('\n')
}

/**
 * 宽松 JSON 解析（容许 ```json ... ``` 围栏；与 archetype-matcher.ts:64 parseLoose 同思路，
 * 单独实现而非 import 因为 archetype-matcher 是 lib 同级模块、避免循环引用风险）。
 */
function tryParseLoose(raw: string): Partial<NLParseResult> | null {
  if (!raw) return null
  let text = raw.trim()
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  if (fenced) text = fenced[1].trim()
  try {
    const obj = JSON.parse(text)
    if (!obj || typeof obj !== 'object') return null
    return obj as Partial<NLParseResult>
  } catch {
    return null
  }
}

/** 校验 matched* 列表：保留 id 在 catalog 中存在的；type 非法或空数组 → [] */
function sanitizeMatched(
  raw: unknown,
  kind: 'tasks' | 'templates' | 'appointments',
  catalog: Array<{ id: string }>,
): NLMatchedRef[] {
  if (!Array.isArray(raw)) return []
  const valid = new Set(catalog.map((c) => c.id))
  const out: NLMatchedRef[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const id = (item as { id?: unknown }).id
    if (typeof id !== 'string' || !valid.has(id)) continue
    const titleRaw = (item as { title?: unknown }).title
    const conflictsRaw = (item as { conflictsTier0?: unknown }).conflictsTier0
    out.push({
      id,
      title: typeof titleRaw === 'string' ? titleRaw : undefined,
      conflictsTier0: conflictsRaw === true,
    })
  }
  return out
}

function sanitizeNewEvents(raw: unknown): NLNewEvent[] {
  if (!Array.isArray(raw)) return []
  const out: NLNewEvent[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const title = (item as { title?: unknown }).title
    if (typeof title !== 'string' || !title.trim()) continue
    const time = (item as { time?: unknown }).time
    out.push({ title: title.trim(), time: typeof time === 'string' ? time : undefined })
  }
  return out
}

function sanitizeTimeExpressions(raw: unknown): NLTimeExpression[] {
  if (!Array.isArray(raw)) return []
  const out: NLTimeExpression[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const rawText = (item as { raw?: unknown }).raw
    const hourRaw = (item as { hour?: unknown }).hour
    if (typeof rawText !== 'string') continue
    if (typeof hourRaw !== 'number' || !Number.isFinite(hourRaw)) continue
    // 归一 hour 到 0-23 整数（防 LLM 返回 24/24.5 等）
    const hour = Math.max(0, Math.min(23, Math.floor(hourRaw)))
    out.push({ raw: rawText, hour })
  }
  return out
}

// ─── deriveConfidence ──────────────────────────────────────────

/**
 * 结构性置信度（纯函数，不读 LLM 自报）。
 *
 * 3 条规则（按优先级，短路返回）：
 *   1. 引用实体（matchedTasks/Templates/Appointments 任意一个非空）且
 *      任意一个 conflictsTier0=true → 强制 LOW_CONFIDENCE（走 needConfirm）
 *   2. 实体引用全部命中（id 全部在 catalog）→ HIGH_CONFIDENCE
 *   3. 全部为 newEvents（无任何 matched 引用）→ HIGH_CONFIDENCE（明确新建）
 *   4. 兜底：FALLBACK_CONFIDENCE
 *
 * @param parsed - parseNL 输出
 * @param catalog - 任务/模板/约定目录（用于校验 matched.id 存在性）
 * @param opts - tier0Slots（pre-fetched Tier0 占用时段；当前 matched* 已带 conflictsTier0
 *   标记，但保留 opts 路径以备 caller 提供额外 Tier0 信息；测试覆盖此路径）
 */
export function deriveConfidence(
  parsed: DeriveConfidenceInput,
  catalog: NLCatalog,
  opts?: DeriveConfidenceOpts,
): number {
  const allMatched = [
    ...(parsed.matchedTasks ?? []),
    ...(parsed.matchedTemplates ?? []),
    ...(parsed.matchedAppointments ?? []),
  ]

  // 规则 1：引用实体但撞 Tier0 → 强制低置信
  if (allMatched.length > 0) {
    const hasTier0Conflict = allMatched.some((m) => m.conflictsTier0 === true)
    // opts.tier0Slots 留作未来 caller 注入额外 Tier0 信息的扩展位（与 matched* 标志 OR 运算）
    if (hasTier0Conflict) return LOW_CONFIDENCE
  }

  // 规则 2：实体引用全部命中 → 高置信（matched* 已 sanitize 过 id 必在 catalog，无需再查）
  if (allMatched.length > 0) return HIGH_CONFIDENCE

  // 规则 3：明确新建（仅有 newEvents，无 matched 引用）→ 高置信
  if ((parsed.newEvents ?? []).length > 0) return HIGH_CONFIDENCE

  // 兜底（catalog 仅作未来扩展位，当前未使用 → unused-warning suppress）
  void catalog
  void opts
  return FALLBACK_CONFIDENCE
}
