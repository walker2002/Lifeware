// Template Parser 单元测试
// T024: 验证表单字段 → StructuredIntent 的转换

import { describe, it, expect, vi } from 'vitest'
import { parseTemplateForm } from '../template-parser'
import type { TemplateFormFields } from '../template-parser'
import type { StructuredIntent } from '@/usom'

describe('parseTemplateForm', () => {
  const intentionId = 'intention-uuid-001'

  // 固定 crypto.randomUUID 的返回值以便断言
  vi.stubGlobal('crypto', {
    randomUUID: () => 'test-uuid-001',
  })

  it('有效字段：正确构造 StructuredIntent', () => {
    const fields: TemplateFormFields = {
      title: '市场调研报告',
      startTime: '2026-05-03T10:00',
      duration: 120,
    }

    const result = parseTemplateForm(fields, intentionId)

    // 基本属性
    expect(result.id).toBe('test-uuid-001')
    expect(result.intentionId).toBe(intentionId)
    expect(result.targetDomain).toBe('timebox')
    expect(result.action).toBe('create_timebox')
    expect(result.confidence).toBe(1.0)
    expect(result.resolvedBy).toBe('template_form')
    expect(result.createdAt).toBeTruthy()

    // fields 内容
    expect(result.fields.title).toBe('市场调研报告')
    expect(result.fields.startTime).toBe('2026-05-03T10:00:00+08:00')
    expect(result.fields.duration).toBe(120)
  })

  it('正确计算 endTime（startTime + duration）', () => {
    const fields: TemplateFormFields = {
      title: '读书',
      startTime: '2026-05-03T14:00',
      duration: 60,
    }

    const result = parseTemplateForm(fields, intentionId)

    expect(result.fields.endTime).toBe('2026-05-03T15:00:00+08:00')
  })

  it('跨午夜计算 endTime', () => {
    const fields: TemplateFormFields = {
      title: '深夜加班',
      startTime: '2026-05-03T23:00',
      duration: 180, // 3小时
    }

    const result = parseTemplateForm(fields, intentionId)

    expect(result.fields.endTime).toBe('2026-05-04T02:00:00+08:00')
  })

  it('最短时长 5 分钟', () => {
    const fields: TemplateFormFields = {
      title: '短休息',
      startTime: '2026-05-03T09:00',
      duration: 5,
    }

    const result = parseTemplateForm(fields, intentionId)

    expect(result.fields.duration).toBe(5)
    expect(result.fields.endTime).toBe('2026-05-03T09:05:00+08:00')
  })

  it('最长时长 480 分钟（8小时）', () => {
    const fields: TemplateFormFields = {
      title: '全天冲刺',
      startTime: '2026-05-03T09:00',
      duration: 480,
    }

    const result = parseTemplateForm(fields, intentionId)

    expect(result.fields.duration).toBe(480)
    expect(result.fields.endTime).toBe('2026-05-03T17:00:00+08:00')
  })

  it('startTime 格式转换：datetime-local → ISO 8601', () => {
    const fields: TemplateFormFields = {
      title: '测试',
      startTime: '2026-12-31T23:59',
      duration: 1,
    }

    const result = parseTemplateForm(fields, intentionId)

    expect(result.fields.startTime).toBe('2026-12-31T23:59:00+08:00')
  })

  it('返回完整的 StructuredIntent 类型', () => {
    const fields: TemplateFormFields = {
      title: '类型检查',
      startTime: '2026-05-03T10:00',
      duration: 30,
    }

    const result: StructuredIntent = parseTemplateForm(fields, intentionId)

    // 验证所有 StructuredIntent 必需字段都存在
    expect(result).toHaveProperty('id')
    expect(result).toHaveProperty('intentionId')
    expect(result).toHaveProperty('targetDomain')
    expect(result).toHaveProperty('action')
    expect(result).toHaveProperty('fields')
    expect(result).toHaveProperty('confidence')
    expect(result).toHaveProperty('resolvedBy')
    expect(result).toHaveProperty('createdAt')
  })
})
