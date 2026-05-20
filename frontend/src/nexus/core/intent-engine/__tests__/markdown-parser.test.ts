import { describe, it, expect } from 'vitest'
import { parseMarkdownToIntent } from '../markdown-parser'

describe('parseMarkdownToIntent', () => {
  it('should parse single object from markdown', () => {
    const content = `title: 晨跑
description: 每天跑步
defaultTime: 07:00
defaultDuration: 30
trackable: true
frequencyType: daily`

    const result = parseMarkdownToIntent(content, 'habits', 'createHabit')
    expect(result.status).toBe('success')
    expect(result.fields).toHaveLength(1)
    expect(result.fields[0].title).toBe('晨跑')
    expect(result.fields[0].defaultDuration).toBe(30)
  })

  it('should parse multiple objects separated by ---', () => {
    const content = `title: 晨跑
defaultTime: 07:00
defaultDuration: 30
---
title: 阅读
defaultTime: 21:00
defaultDuration: 30`

    const result = parseMarkdownToIntent(content, 'habits', 'createHabit')
    expect(result.status).toBe('success')
    expect(result.fields).toHaveLength(2)
    expect(result.fields[0].title).toBe('晨跑')
    expect(result.fields[1].title).toBe('阅读')
  })

  it('should handle headers and ignore them', () => {
    const content = `# 习惯创建模板

## 习惯

title: 晨跑
defaultTime: 07:00`

    const result = parseMarkdownToIntent(content, 'habits', 'createHabit')
    expect(result.status).toBe('success')
    expect(result.fields).toHaveLength(1)
    expect(result.fields[0].title).toBe('晨跑')
  })

  it('should skip empty and comment lines', () => {
    const content = `title: 晨跑

# 这是注释
defaultTime: 07:00`

    const result = parseMarkdownToIntent(content, 'habits', 'createHabit')
    expect(result.status).toBe('success')
    expect(result.fields).toHaveLength(1)
  })

  it('should return partial for incomplete data', () => {
    const content = `title: 测试
defaultTime: 07:00
---
invalid line without colon`

    const result = parseMarkdownToIntent(content, 'habits', 'createHabit')
    expect(result.status).toBe('partial')
    expect(result.fields.length).toBeGreaterThanOrEqual(1)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('should return failed for empty content', () => {
    const result = parseMarkdownToIntent('', 'habits', 'createHabit')
    expect(result.status).toBe('failed')
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('should parse boolean and number values', () => {
    const content = `title: 测试
defaultDuration: 30
trackable: true`

    const result = parseMarkdownToIntent(content, 'habits', 'createHabit')
    expect(result.status).toBe('success')
    expect(result.fields[0].defaultDuration).toBe(30)
    expect(result.fields[0].trackable).toBe(true)
  })
})
