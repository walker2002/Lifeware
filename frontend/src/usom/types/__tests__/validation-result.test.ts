/**
 * @file validation-result.test.ts
 * @brief ValidationResult 三变体判别联合与构造器的单元测试（[018] T2）
 */

import { describe, it, expect } from 'vitest'
import type { ValidationResult } from '../process'
import {
  validationPassed,
  validationRejected,
  validationNeedConfirm,
} from '../process'

describe('ValidationResult 三变体', () => {
  it('validationPassed 产出 Passed 变体（kind 判别字段正确）', () => {
    const result = validationPassed()
    expect(result.kind).toBe('Passed')
  })

  it('validationRejected 产出 Rejected 变体并携带 errors', () => {
    const result = validationRejected(['priority 越界', 'dueDate 格式错'])
    expect(result.kind).toBe('Rejected')
    // 用判别字段窄化，验证 errors 字段存在且内容正确
    if (result.kind === 'Rejected') {
      expect(result.errors).toEqual(['priority 越界', 'dueDate 格式错'])
    }
  })

  it('validationNeedConfirm 产出 NeedConfirm 变体并透传结构化 data', () => {
    const data = { field: 'priority', from: 'Medium', to: 'High' }
    const result = validationNeedConfirm(data)
    expect(result.kind).toBe('NeedConfirm')
    if (result.kind === 'NeedConfirm') {
      // data 按引用透传，承载未来级联预览/CNUI 确认等结构化数据
      expect(result.data).toBe(data)
    }
  })

  it('kind 判别字段可用于 switch 窄化（Orchestrator 聚合路由前提）', () => {
    // 模拟 Orchestrator 按 kind 分流路由
    function route(result: ValidationResult): string {
      switch (result.kind) {
        case 'Passed':
          return '进入写入口'
        case 'Rejected':
          return '终止'
        case 'NeedConfirm':
          return 'Suspend 确认'
      }
    }

    expect(route(validationPassed())).toBe('进入写入口')
    expect(route(validationRejected(['x']))).toBe('终止')
    expect(route(validationNeedConfirm({}))).toBe('Suspend 确认')
  })

  it('三个变体 kind 互斥（判别联合的判别字段唯一）', () => {
    const passed = validationPassed()
    const rejected = validationRejected(['e'])
    const needConfirm = validationNeedConfirm(null)

    const kinds = new Set([passed.kind, rejected.kind, needConfirm.kind])
    expect(kinds.size).toBe(3)
  })
})
