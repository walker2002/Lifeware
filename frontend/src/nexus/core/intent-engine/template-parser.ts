// Template Parser — 表单模式意图解析器
// T024: 将表单字段直接构造为 StructuredIntent，无需 AI 调用

import type { StructuredIntent, USOM_ID, Timestamp } from '@/usom'

/**
 * 表单输入字段
 */
export interface TemplateFormFields {
  /** 时间盒标题 */
  title: string
  /** 开始时间（datetime-local 格式：YYYY-MM-DDTHH:MM） */
  startTime: string
  /** 时长（分钟） */
  duration: number
}

/**
 * 将 datetime-local 输入值转换为 ISO 8601 时间戳
 *
 * datetime-local 返回 "YYYY-MM-DDTHH:MM" 格式（本地时间，无时区后缀）。
 * 此函数追加秒数和时区偏移（默认 +08:00 中国时区）。
 */
function toISO8601(datetimeLocal: string): string {
  // datetime-local 格式：2026-05-03T10:00
  // 直接追加 :00（秒）和 +08:00（中国时区）
  return `${datetimeLocal}:00+08:00`
}

/**
 * 计算结束时间
 *
 * @param isoStartTime - ISO 8601 开始时间
 * @param durationMinutes - 时长（分钟）
 * @returns ISO 8601 结束时间
 */
function calculateEndTime(isoStartTime: string, durationMinutes: number): string {
  // 解析带时区偏移的时间字符串
  const date = new Date(isoStartTime)
  date.setMinutes(date.getMinutes() + durationMinutes)
  // 格式化为 ISO 8601 并保留 +08:00 时区
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}+08:00`
}

/**
 * 从表单字段直接构造 StructuredIntent
 *
 * 不需要 AI 调用，confidence=1.0，resolvedBy='template_form'。
 *
 * @param fields   - 表单输入字段
 * @param intentionId - 关联的 Intention 对象 ID
 * @returns 构造好的 StructuredIntent
 */
export function parseTemplateForm(
  fields: TemplateFormFields,
  intentionId: USOM_ID,
): StructuredIntent {
  const isoStartTime = toISO8601(fields.startTime)
  const endTime = calculateEndTime(isoStartTime, fields.duration)

  return parseDynamicForm('timebox', 'create_timebox', {
    title: fields.title,
    startTime: isoStartTime,
    endTime,
    duration: fields.duration,
  }, intentionId)
}

/**
 * 通用动态表单 → StructuredIntent 转换
 *
 * 接受任意域和 action 的字段映射，构造 StructuredIntent。
 * confidence=1.0, resolvedBy='template_form'。
 */
export function parseDynamicForm(
  targetDomain: string,
  action: string,
  fields: Record<string, unknown>,
  intentionId: USOM_ID,
): StructuredIntent {
  return {
    id: crypto.randomUUID() as USOM_ID,
    intentionId,
    targetDomain,
    action,
    fields,
    confidence: 1.0,
    resolvedBy: 'template_form',
    createdAt: new Date().toISOString() as Timestamp,
  }
}
