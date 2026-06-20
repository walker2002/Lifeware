/**
 * @file adapter.test
 * @brief R0 Task2 — fieldIssuesToValidationResult：空→Passed / 非空→Rejected
 */
import { describe, it, expect } from 'vitest'
import { fieldIssuesToValidationResult } from '../adapter'
import type { FieldIssue } from '../types'

describe('fieldIssuesToValidationResult', () => {
  it('空 issues → Passed', () => {
    expect(fieldIssuesToValidationResult([]).kind).toBe('Passed')
  })

  it('非空 issues → Rejected，errors 为各 issue 的 message', () => {
    const issues: FieldIssue[] = [
      { field: 'title', message: '标题必填' },
      { field: 'duration', message: '时长必须>0' },
    ]
    const r = fieldIssuesToValidationResult(issues)
    expect(r.kind).toBe('Rejected')
    if (r.kind === 'Rejected') expect(r.errors).toEqual(['标题必填', '时长必须>0'])
  })
})
