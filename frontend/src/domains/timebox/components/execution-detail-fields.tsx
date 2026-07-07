/**
 * @file execution-detail-fields
 * @brief [023.13] 打卡专区共享字段组件（§3 抽屉 + §4 LogTimebox 共消费，防 CNUI 表单分叉）
 *
 * 字段：实际开始/结束时间（派生实际时长）、深度专注时长（≤ 实际时长）、
 * 实际能量消耗（1-10，默认 archetype 均值）、任务执行详情（→ notes）。
 */
'use client'

import { isoToLocalDatetimeInput, localDatetimeInputToIso } from '../cnui/surfaces/time-input-helpers'

/** 打卡专区草稿（DetailedExecutionRecord 子集） */
export interface ExecutionDetailDraft {
  actualStartTime?: string
  actualEndTime?: string
  focusMinutes?: number
  energyActual?: number
  notes?: string
}

interface Props {
  value: ExecutionDetailDraft
  onChange: (next: ExecutionDetailDraft) => void
  /** archetype 均值（caller 调 getDefaultEnergyActual 算好传入）；undefined 表示无 archetype */
  defaultEnergyActual?: number
}

/** 两时间齐备时派生实际时长（分钟），否则 undefined */
function deriveActualMinutes(v: ExecutionDetailDraft): number | undefined {
  if (!v.actualStartTime || !v.actualEndTime) return undefined
  const ms = Date.parse(v.actualEndTime) - Date.parse(v.actualStartTime)
  if (isNaN(ms) || ms < 0) return undefined
  return Math.round(ms / 60000)
}

export function ExecutionDetailFields({ value, onChange, defaultEnergyActual }: Props) {
  const actualMinutes = deriveActualMinutes(value)
  const focusOverLimit =
    actualMinutes !== undefined && value.focusMinutes !== undefined && value.focusMinutes > actualMinutes

  return (
    <div className="space-y-3 rounded-md border border-hairline bg-canvas p-3">
      <div className="text-sm font-medium text-ink">打卡专区</div>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1">
          <span className="text-xs text-body">实际开始时间</span>
          <input
            type="datetime-local"
            aria-label="实际开始时间"
            value={value.actualStartTime ? isoToLocalDatetimeInput(value.actualStartTime) : ''}
            onChange={(e) => onChange({ ...value, actualStartTime: e.target.value ? localDatetimeInputToIso(e.target.value) : undefined })}
            className="rounded border border-hairline bg-canvas px-2 py-1 text-sm text-ink"
          />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-xs text-body">实际结束时间</span>
          <input
            type="datetime-local"
            aria-label="实际结束时间"
            value={value.actualEndTime ? isoToLocalDatetimeInput(value.actualEndTime) : ''}
            onChange={(e) => onChange({ ...value, actualEndTime: e.target.value ? localDatetimeInputToIso(e.target.value) : undefined })}
            className="rounded border border-hairline bg-canvas px-2 py-1 text-sm text-ink"
          />
        </label>
      </div>
      {actualMinutes !== undefined && (
        <div className="text-xs text-body">实际时长：{actualMinutes} 分钟</div>
      )}

      <label className="flex flex-col gap-1">
        <span className="text-xs text-body">深度专注时长（分钟）</span>
        <input
          type="number"
          aria-label="深度专注时长（分钟）"
          value={value.focusMinutes ?? ''}
          min={0}
          onChange={(e) => onChange({ ...value, focusMinutes: e.target.value === '' ? undefined : Number(e.target.value) })}
          className={`rounded border bg-canvas px-2 py-1 text-sm text-ink ${focusOverLimit ? 'border-error text-error' : 'border-hairline'}`}
        />
        {focusOverLimit && (
          <span className="text-xs text-error">专注时长超过实际时长，请调整</span>
        )}
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-body">
          实际能量消耗（1-10）{defaultEnergyActual !== undefined && <span className="text-muted">（活动原型默认 {defaultEnergyActual}）</span>}
        </span>
        <input
          type="number"
          aria-label="实际能量消耗"
          value={value.energyActual ?? ''}
          min={1}
          max={10}
          placeholder={defaultEnergyActual !== undefined ? String(defaultEnergyActual) : '请输入 1-10'}
          onChange={(e) => onChange({ ...value, energyActual: e.target.value === '' ? undefined : Number(e.target.value) })}
          className="rounded border border-hairline bg-canvas px-2 py-1 text-sm text-ink"
        />
      </label>

      <label className="flex flex-col gap-1">
        <span className="text-xs text-body">任务执行详情</span>
        <textarea
          aria-label="任务执行详情"
          value={value.notes ?? ''}
          onChange={(e) => onChange({ ...value, notes: e.target.value })}
          rows={3}
          placeholder="执行过程、产出、反思…"
          className="resize-none rounded border border-hairline bg-canvas px-2 py-1 text-sm text-ink"
        />
      </label>
    </div>
  )
}
