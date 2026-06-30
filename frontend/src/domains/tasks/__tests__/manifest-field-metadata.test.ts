/**
 * @file tasks manifest field_metadata
 * @brief [023] A3.2 tasks 域 manifest field_metadata 守护（对齐 habits，H3）
 *
 * 验证 tasks manifest 的 field_metadata.activityArchetypeId 声明为 ContentField。
 * 与 habits/__tests__/manifest-field-metadata.test.ts 的 activityArchetypeId 断言结构对齐。
 */
import { describe, it, expect } from 'vitest'
import { loadDomainManifest } from '@/domains/manifest-loader'

const result = loadDomainManifest('tasks')
const fieldMetadata = result.success ? result.manifest.field_metadata : {}

describe('[023] A3.2 tasks manifest archetype 接入', () => {
  it('manifest 应成功加载', () => { expect(result.success).toBe(true) })
  it('activityArchetypeId 声明为 ContentField（D3，不发业务事件——C3 已知现实偏差见 spec）', () => {
    expect(fieldMetadata.activityArchetypeId?.mutation_mode).toBe('ContentField')
  })
})