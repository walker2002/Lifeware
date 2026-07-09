/**
 * @file parse-appointments
 * @brief [026.01] EditAppointment AI 解析（解析优先模式）
 *
 * 范式：参照 parse-timeboxes.ts
 * - LLM 解析 prompt 出 { kind: 'edit', appointmentId, newStartTime?, newDurationMin?, newTitle?, confidence }
 * - 失败/不确定 → { kind: 'unsure', reason }
 * - 不解析 archetype（走 ArchetypePickerCard UI 端 matchArchetypeForTitle）
 */

import type { AIRuntime } from '@/nexus/ai-runtime'
import type { AIGenerateResponse } from '@/nexus/ai-runtime/types'

export type AppointmentParseResult =
  | {
      kind: 'edit'
      appointmentId: string
      newStartTime?: string
      newDurationMin?: number
      newTitle?: string
      confidence: number
    }
  | {
      kind: 'unsure'
      reason: string
    }

const APPOINTMENT_PARSE_PROMPT = `
你是一个意图解析器。用户会说："我想修改我的某个约定"。
请分析用户的输入，从候选列表中找出最匹配的约定，并提取修改意图。

候选约定（JSON 数组）：
{candidates}

用户输入：
{userInput}

返回 JSON（严格格式）：
{
  "kind": "edit" | "unsure",
  "appointmentId": "<候选 id 或空>",
  "newStartTime": "<ISO 时间或空，如 '2026-07-15T14:00:00+08:00'>",
  "newDurationMin": <新时长（数字必须>0；留空表示不修改）>,
  "newTitle": "<新标题或空>",
  "confidence": <0-1>,
  "reason": "<解析说明，kind=unsure 时必填>"
}

注意：
1. 模糊匹配（部分标题、时间相近）confidence 0.5-0.8
2. 完全匹配 confidence 0.9-1.0
3. 无法判断或候选列表为空 → kind=unsure
4. 仅返回 JSON，不要其他文本
`.trim()

export async function parseAppointmentIntent(
  prompt: string,
  todayAppointments: ReadonlyArray<{
    id: string
    title: string
    startTime: string
    durationMin: number
    status: string
  }>,
  aiRuntime: AIRuntime,
): Promise<AppointmentParseResult> {
  if (!prompt?.trim()) {
    return { kind: 'unsure', reason: '请提供修改意图，例如：「把看牙医改到下午3点」' }
  }

  if (todayAppointments.length === 0) {
    return { kind: 'unsure', reason: '当前没有可修改的约定' }
  }

  const candidates = todayAppointments.map(a => ({
    id: a.id,
    title: a.title,
    startTime: a.startTime,
    durationMin: a.durationMin,
    status: a.status,
  }))

  const filledPrompt = APPOINTMENT_PARSE_PROMPT
    .replace('{candidates}', JSON.stringify(candidates, null, 2))
    .replace('{userInput}', prompt)

  try {
    const response: AIGenerateResponse = await aiRuntime.generate({
      domainId: 'timebox',
      action: 'parseAppointmentEditIntent',
      systemPrompt: APPOINTMENT_PARSE_PROMPT,
      messages: [{ role: 'user', content: filledPrompt }],
      taskType: 'intent_routing',
      temperature: 0.3,
    })
    // 兼容 mock：test mock 通过 spread 注入 .text；真实 AIRuntime 返回 .content
    const rawText = (response as { text?: string }).text ?? (
      typeof response.content === 'string' ? response.content : ''
    )
    const text = rawText.trim()

    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) {
      return { kind: 'unsure', reason: '解析响应非 JSON 格式' }
    }

    const parsed = JSON.parse(jsonMatch[0])

    if (parsed.kind === 'unsure') {
      return { kind: 'unsure', reason: parsed.reason ?? '未识别到具体修改意图' }
    }

    if (parsed.kind !== 'edit' || typeof parsed.appointmentId !== 'string') {
      return { kind: 'unsure', reason: '解析响应格式异常' }
    }

    // [026.02.4] TD-022 #2: UUID v4 regex check（防御深度 #2，按设计而非按意外）
    // 在 candidates.find 之前挡掉非 UUID 形态的 appointmentId，
    // 避免后续 DB 查询/外键逻辑被畸形 id 污染
    const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    if (!UUID_V4.test(parsed.appointmentId)) {
      return { kind: 'unsure', reason: '候选 appointmentId 不是合法 UUID v4' }
    }

    const target = candidates.find(c => c.id === parsed.appointmentId)
    if (!target) {
      return { kind: 'unsure', reason: '未找到匹配的约定（候选列表中不存在）' }
    }

    // [026.01] post-ship adversarial review fix: LLM-supplied newStartTime 必须 ISO 格式，
    // 否则 `new Date(garbage).toISOString()` 在 AppointmentFormFields.tsx:64 抛 RangeError，
    // 直接污染 UI/潜在 DB 写脏数据（防御深度 #1）
    const startTimeValid = !parsed.newStartTime || !Number.isNaN(Date.parse(parsed.newStartTime))
    if (!startTimeValid) {
      return { kind: 'unsure', reason: 'LLM 返回时间格式无效（需 ISO 8601）' }
    }

    // [026.02.4] TD-022 #3: newDurationMin 显式拒绝（防御深度 #3，按 prompt 契约而非静默丢弃）
    // LLM 返回 0 或非正数时不应被静默丢弃成「不修改」，而是明确告知用户/上游解析失败
    if (parsed.newDurationMin !== undefined && parsed.newDurationMin !== null) {
      if (typeof parsed.newDurationMin !== 'number' || !Number.isFinite(parsed.newDurationMin) || parsed.newDurationMin <= 0) {
        return { kind: 'unsure', reason: '新时长必须 > 0；留空表示不修改' }
      }
    }

    return {
      kind: 'edit',
      appointmentId: parsed.appointmentId,
      ...(parsed.newStartTime && startTimeValid ? { newStartTime: parsed.newStartTime } : {}),
      ...(typeof parsed.newDurationMin === 'number' && parsed.newDurationMin > 0 ? { newDurationMin: parsed.newDurationMin } : {}),
      ...(parsed.newTitle ? { newTitle: parsed.newTitle } : {}),
      confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.5,
    }
  } catch (e) {
    return {
      kind: 'unsure',
      reason: `解析失败：${e instanceof Error ? e.message : '未知错误'}`,
    }
  }
}