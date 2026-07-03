/**
 * @file manifest-field-metadata
 * @brief habits manifest field_metadata 区块合规测试（[018-G1] G1-M1 结构任务 T1）
 *
 * 验证 habits manifest 的 field_metadata 覆盖 UpdateHabitInput 全集（14 字段），
 * 且每个字段都标注 mutation_mode（FactField|ContentField），frequencyType 为 enum
 * 并使用 options（非 allowed_values）—— 字段执行器据此激活枚举校验。
 *
 * 背景：字段执行器对未在 field_metadata 声明的字段会拒绝写入（F-1）。
 * 此测试守护 G1-H（updateHabit 迁移）前置的 manifest 结构完整性。
 *
 * [023] A3.2：activityArchetypeId 计入 REQUIRED_FIELDS（字段执行器将拒绝未声明字段写入）。
 */
import { describe, it, expect } from 'vitest'
import { loadDomainManifest } from '@/domains/manifest-loader'
import type { CreateHabitInput } from '@/usom/interfaces/irepository'
import type { FieldMetadata } from '@/usom/types/domain-types'

// 直接通过 manifest-loader 解析（habitsPlugin.manifest 为 ProcessManifest，
// 不含 field_metadata；需取完整 DomainManifest 才能校验区块 C）
// [026] T23 per-objectType 嵌套：field_metadata.habit.* 才是字段元数据
const result = loadDomainManifest('habits')
const fieldMetadata = result.success
  ? (result.manifest.field_metadata?.habit ?? {})
  : {}

/** CreateHabitInput 的全部字段名（权威字段集，14 个） */
const REQUIRED_FIELDS: ReadonlyArray<keyof CreateHabitInput> = [
  'title',
  'description',
  'defaultTime',
  'earliestTime',
  'latestStartTime',
  'defaultDuration',
  'minDuration',
  'trackable',
  'frequencyType',
  'daysOfWeek',
  'startDate',
  'endDate',
  'tags',
  'activityArchetypeId',
]

describe('G1-M1: habits manifest field_metadata 覆盖 UpdateHabitInput 全集', () => {
  it('manifest 应成功加载', () => {
    expect(result.success).toBe(true)
  })

  it('field_metadata 应覆盖 CreateHabitInput 的全部 14 个字段（超集）', () => {
    const declared = new Set(Object.keys(fieldMetadata))
    const missing = REQUIRED_FIELDS.filter(f => !declared.has(f as string))
    expect(missing).toEqual([])
  })

  it('每个声明字段的 mutation_mode 必须为 FactField 或 ContentField', () => {
    const allowed: FieldMetadata['mutation_mode'][] = ['FactField', 'ContentField']
    const offenders: string[] = []
    for (const [name, meta] of Object.entries(fieldMetadata)) {
      if (!allowed.includes(meta.mutation_mode)) {
        offenders.push(`${name}=${String(meta.mutation_mode)}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('frequencyType 应为 enum 类型并使用 options（激活字段执行器枚举校验）', () => {
    const freq = fieldMetadata.frequencyType
    expect(freq).toBeDefined()
    expect(freq!.type).toBe('enum')
    expect(freq!.options).toEqual(['daily', 'weekly', 'custom'])
    // allowed_values 是旧格式，字段执行器只识别 options，必须移除以免歧义
    expect((freq as unknown as Record<string, unknown>).allowed_values).toBeUndefined()
  })

  it('已批准分类：ContentField（title/description/startDate/endDate/tags）', () => {
    const contentFields: Array<keyof CreateHabitInput> = [
      'title', 'description', 'startDate', 'endDate', 'tags',
    ]
    for (const f of contentFields) {
      expect(fieldMetadata[f as string]?.mutation_mode).toBe('ContentField')
    }
  })

  it('已批准分类：ContentField（activityArchetypeId，[023] A3.2 archetype 接入）', () => {
    expect(fieldMetadata.activityArchetypeId?.mutation_mode).toBe('ContentField')
  })

  it('已批准分类：FactField（defaultTime/earliestTime/latestStartTime/defaultDuration/minDuration/trackable/frequencyType/daysOfWeek）', () => {
    const factFields: Array<keyof CreateHabitInput> = [
      'defaultTime', 'earliestTime', 'latestStartTime',
      'defaultDuration', 'minDuration', 'trackable', 'frequencyType', 'daysOfWeek',
    ]
    for (const f of factFields) {
      expect(fieldMetadata[f as string]?.mutation_mode).toBe('FactField')
    }
  })
})
