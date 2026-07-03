/**
 * @file habit-validate.golden
 * @brief [018-G3] R1 golden — 冻结 habits onValidate + validateHabitFields 精确 errors 输出
 *
 * 迁移到规则三层架构后，本测试须逐字通过（errors 文案/顺序/边界值不变）。
 * 设计 §6 P5 / §8 #8 迁移等价性护栏。
 */
import { describe, it, expect } from 'vitest'
import { vi } from 'vitest'
import type { ValidationResult } from '@/usom/types/process'
import type { StructuredIntent } from '@/usom/types/objects'
import type { USOM_ID } from '@/usom/types/primitives'

vi.mock('@/domains/manifest-loader', () => ({
  loadDomainManifest: () => ({
    success: true,
    manifest: {
      id: 'habits', version: '1.0.0', name: '习惯管理', description: 'd',
      intent_triggers: [], lifecycle: {},
      field_metadata: { habit: { frequencyType: { type: 'enum', label: '频率类型', required: true, options: ['daily', 'weekly', 'custom'] } } },
      list_actions: [],
      required_fields: {},
      subscribed_events: [],
      // [018-G3] R1 Task5：添加 rules 区块（D 模式，聚合置首）
      rules: [
        // 权威聚合（phase: submit）
        { id: 'habit_action_fields_valid', phase: 'submit', fields: ['title', 'defaultTime', 'earliestTime', 'latestStartTime', 'defaultDuration', 'minDuration', 'frequencyType', 'habitId', 'name', 'applicableDays', 'templateId', 'date', 'timeOverride'], message: '习惯字段校验失败' },
        // 客户端 realtime（phase: both）
        { id: 'habit_default_duration_positive', phase: 'both', fields: ['defaultDuration'], message: '默认时长必须大于 0' },
        { id: 'habit_min_duration_positive', phase: 'both', fields: ['minDuration'], message: '最短时长必须大于 0' },
        { id: 'habit_frequency_type_valid', phase: 'both', fields: ['frequencyType'], message: '频率类型必须是 daily/weekly/custom' },
        { id: 'habit_default_time_format', phase: 'both', fields: ['defaultTime'], message: '默认时间必须是有效的 HH:MM 格式' },
        { id: 'habit_earliest_time_format', phase: 'both', fields: ['earliestTime'], message: '最早开始时间必须是有效的 HH:MM 格式' },
        { id: 'habit_latest_time_format', phase: 'both', fields: ['latestStartTime'], message: '最迟开始时间必须是有效的 HH:MM 格式' },
      ],
    },
  }),
}))

import { validateHabitFields } from '../validation'
import { habitsPlugin } from '../index'

/** 把 ValidationResult 折成 { kind, errors } 便于精确断言 */
function snap(r: ValidationResult): { kind: string; errors: string[] } {
  return { kind: r.kind, errors: r.kind === 'Rejected' ? r.errors : [] }
}

function makeIntent(overrides: Partial<StructuredIntent> = {}): StructuredIntent {
  return {
    id: 'i' as USOM_ID, intentionId: 'in' as USOM_ID, targetDomain: 'habits',
    action: 'createHabit',
    fields: { title: '晨跑', defaultTime: '07:00', earliestTime: '06:30', latestStartTime: '08:00', defaultDuration: 30, minDuration: 15, trackable: true, frequencyType: 'daily' },
    confidence: 0.95, resolvedBy: 'ai', createdAt: '2026-06-20T00:00:00Z',
    ...overrides,
  } as unknown as StructuredIntent
}

const snap_ = { userId: 'u' as USOM_ID, activeObjectives: [], activeKeyResults: [], activeTasks: [], pendingHabits: [], upcomingTimeboxes: [], pendingIntentions: [], currentTime: '2026-06-20T08:00:00Z', currentDate: '2026-06-20', dayOfWeek: 6, timeOfDay: 'morning', energyState: { inferredLevel: 7, calibratedLevel: null, activeLevel: 7, source: 'system' }, sourceSnapshotId: 's' as USOM_ID }

describe('[golden] validateHabitFields 精确 errors', () => {
  it('createHabit 缺 title + duration<=0 + 频率非法 → 三错误按序', () => {
    const r = validateHabitFields({ title: '', defaultDuration: 0, frequencyType: 'bad' }, 'createHabit')
    expect(r.errors).toEqual(['标题必填', '默认时长必须大于 0', '频率类型必须是 daily/weekly/custom'])
  })

  it('createHabit defaultTime 非法格式 → 含默认时间格式错误', () => {
    const r = validateHabitFields({ title: 't', defaultTime: '25:00', earliestTime: '06:30', latestStartTime: '08:00' }, 'createHabit')
    expect(r.errors).toEqual(['默认时间必须是有效的 HH:MM 格式'])
  })

  it('createHabit defaultTime 在窗口外 → 含窗口错误', () => {
    const r = validateHabitFields({ title: 't', defaultTime: '05:00', earliestTime: '06:30', latestStartTime: '08:00' }, 'createHabit')
    expect(r.errors).toEqual(['默认时间必须在最早开始时间和最迟开始时间之间'])
  })

  it('createHabit minDuration > defaultDuration → 含最短时长错误', () => {
    const r = validateHabitFields({ title: 't', defaultTime: '07:00', earliestTime: '06:30', latestStartTime: '08:00', defaultDuration: 15, minDuration: 30 }, 'createHabit')
    expect(r.errors).toEqual(['最短时长不能大于默认时长'])
  })

  it('完整有效 → 无 errors（warnings 仍可能含时长警告，errors 必空）', () => {
    const r = validateHabitFields({ title: '晨跑', defaultTime: '07:00', earliestTime: '06:30', latestStartTime: '08:00', defaultDuration: 30, minDuration: 15 }, 'createHabit')
    expect(r.errors).toEqual([])
  })
})

describe('[golden] habitsPlugin.onValidate 精确输出', () => {
  it('合法 createHabit → Passed', async () => {
    expect(snap(await habitsPlugin.onValidate(makeIntent(), snap_ as any))).toEqual({ kind: 'Passed', errors: [] })
  })

  it('createHabit 缺 title → Rejected 含「标题必填」', async () => {
    const r = await habitsPlugin.onValidate(makeIntent({ fields: { defaultTime: '07:00', earliestTime: '06:30', latestStartTime: '08:00', defaultDuration: 30, minDuration: 15, trackable: true, frequencyType: 'daily' } }), snap_ as any)
    expect(snap(r)).toEqual({ kind: 'Rejected', errors: ['标题必填'] })
  })

  it('createHabit 多错误（缺 title + duration 0 + 频率非法）→ 全部 errors（D 模式逐字保持关键用例）', async () => {
    const r = await habitsPlugin.onValidate(makeIntent({ fields: { title: '', defaultTime: '07:00', earliestTime: '06:30', latestStartTime: '08:00', defaultDuration: 0, minDuration: 15, trackable: true, frequencyType: 'bad' } }), snap_ as any)
    expect(snap(r)).toEqual({ kind: 'Rejected', errors: ['标题必填', '默认时长必须大于 0', '最短时长不能大于默认时长', '频率类型必须是 daily/weekly/custom'] })
  })

  it('logHabit 缺 habitId → Rejected「habitId 必填」', async () => {
    const r = await habitsPlugin.onValidate(makeIntent({ action: 'logHabit', fields: { status: 'completed' } }), snap_ as any)
    expect(snap(r)).toEqual({ kind: 'Rejected', errors: ['habitId 必填'] })
  })
})
