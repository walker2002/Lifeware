/**
 * @file AppointmentFormFields
 * @brief [026.01] 5 字段共享表单组件（4 字段 + archetype picker）
 *
 * CreateAppointment / EditAppointment 共用，避免 3 处重复字段定义 + 多端修正。
 * 字段：title (input) + startTime (datetime-local) + durationMin (number) +
 *       people (逗号分隔 input) + detail (textarea) + activityArchetypeId (picker)
 *
 * 不持有 react state 自行发请求；遵循 surface props 模式（onChange 回调）。
 */

'use client'

import { isoToLocalDatetimeInput, localDatetimeInputToIso } from './time-input-helpers'
import { ArchetypePickerCard } from '@/components/archetype/archetype-picker-card'

/**
 * 约定 draft 形态（与 ai-parser 的 AppointmentDraft 对齐，扩展 id/detail/archetype）。
 * id 由 handler 在注入时分配（runtime 唯一标识）；detail 为可选详情文本。
 */
export interface AppointmentDraftFields {
  id: string
  title: string
  startTime: string
  durationMin: number
  detail?: string | null
  people: string[]
  /** [026.01] 关联 Activity Archetype（[026.02.4] 3-state: undefined=skip, null=clear, string=set；ArchetypePickerCard 渲染） */
  activityArchetypeId?: string | null
}

export interface AppointmentFormFieldsProps {
  draft: AppointmentDraftFields
  onChange: (patch: Partial<AppointmentDraftFields>) => void
  /** [026] 表单整体 disabled（提交后只读 / SM 终态禁编等） */
  disabled?: boolean
}

/**
 * 5 字段表单（不含提交按钮 / 翻页 / 列表）。父组件负责 view/pagination/状态。
 * id 前缀动态生成（避免多 surface 同时挂载时 label-for 冲突）。
 *
 * [026.02.3] 防御深度：所有 draft 数组字段访问加 ?? [] fallback，
 * 防止上游 mapper 漏字段（如 handlers.ts todayAppointments 早期 bug）
 * 触发 .join() 抛 TypeError。生产 handler 已修，但 form 自身不应假设上游完美。
 */
export function AppointmentFormFields({ draft, onChange, disabled }: AppointmentFormFieldsProps) {
  const idPrefix = `app-ff-${draft.id}`
  const peopleArr = draft.people ?? []  // [026.02.3] 防御深度（defense in depth）
  const detailVal = draft.detail ?? '' // [026.02.3] 同上
  return (
    <div className="rounded-md border border-hairline bg-canvas p-3 space-y-2">
      <div>
        <label htmlFor={`${idPrefix}-title`} className="text-xs text-body">事件名称</label>
        <input
          id={`${idPrefix}-title`}
          type="text"
          value={draft.title}
          onChange={e => onChange({ title: e.target.value })}
          disabled={disabled}
          className="mt-0.5 h-7 w-full rounded border border-hairline bg-canvas px-2 text-sm text-ink disabled:opacity-50"
        />
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <label htmlFor={`${idPrefix}-start`} className="text-xs text-body">开始</label>
          <input
            id={`${idPrefix}-start`}
            type="datetime-local"
            value={isoToLocalDatetimeInput(draft.startTime)}
            onChange={e => onChange({ startTime: localDatetimeInputToIso(e.target.value) })}
            disabled={disabled}
            className="mt-0.5 h-7 w-full rounded border border-hairline bg-canvas px-2 text-sm text-ink disabled:opacity-50"
          />
        </div>
        <div className="w-24">
          <label htmlFor={`${idPrefix}-dur`} className="text-xs text-body">时长(分)</label>
          <input
            id={`${idPrefix}-dur`}
            type="number"
            min={1}
            value={draft.durationMin}
            onChange={e => onChange({ durationMin: Number(e.target.value) || 0 })}
            disabled={disabled}
            className="mt-0.5 h-7 w-full rounded border border-hairline bg-canvas px-2 text-sm text-ink disabled:opacity-50"
          />
        </div>
      </div>
      <div>
        <label htmlFor={`${idPrefix}-people`} className="text-xs text-body">关系人（逗号分隔）</label>
        <input
          id={`${idPrefix}-people`}
          type="text"
          value={peopleArr.join('，')}
          onChange={e => onChange({ people: e.target.value.split(/[，,]/).map(s => s.trim()).filter(Boolean) })}
          disabled={disabled}
          className="mt-0.5 h-7 w-full rounded border border-hairline bg-canvas px-2 text-sm text-ink disabled:opacity-50"
        />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-detail`} className="text-xs text-body">详情</label>
        <textarea
          id={`${idPrefix}-detail`}
          value={detailVal}
          onChange={e => onChange({ detail: e.target.value })}
          disabled={disabled}
          className="mt-0.5 w-full rounded border border-hairline bg-canvas px-2 py-1 text-sm text-ink disabled:opacity-50"
        />
      </div>

      {/* [026.01] archetype picker 嵌入（对齐 CreateTimebox.tsx:107-117）
        *  [026.02.4] TD-022 #6: picker emits undefined on clear.
        *  Appointment surface converts to null (= "explicit clear" semantics).
        *  Timebox surface 用不同语义（undefined=clear），此处只在 appointment 域转换。 */}
      <ArchetypePickerCard
        value={draft.activityArchetypeId ?? undefined}
        onChange={(archetypeId) => onChange({
          activityArchetypeId: archetypeId === undefined ? null : archetypeId,
        })}
        enableAiMatch
        title={draft.title}
      />
    </div>
  )
}