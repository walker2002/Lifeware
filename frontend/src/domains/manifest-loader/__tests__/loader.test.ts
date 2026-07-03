// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { loadDomainManifest } from '../loader'

describe('loadDomainManifest', () => {
  let tmpDir: string

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'manifest-test-'))
  })

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true })
  })

  function writeManifest(content: string) {
    fs.writeFileSync(path.join(tmpDir, 'manifest.yaml'), content, 'utf-8')
  }

  it('加载合法的 manifest 返回 success', () => {
    // 使用实际的 timebox manifest 路径
    const realDir = path.resolve(__dirname, '../../timebox')
    const result = loadDomainManifest(realDir)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.manifest.id).toBe('timebox')
      expect(result.manifest.lifecycle.timebox.states.length).toBeGreaterThan(0)
      expect(result.manifest.subscribed_events).toContain('TimeboxCreated')
    }
  })

  it('YAML 语法错误返回结构化错误', () => {
    writeManifest(`
id: test
  bad_indent: oops
    extra_indent: bad
`)
    const result = loadDomainManifest(tmpDir)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errors.length).toBeGreaterThan(0)
      expect(result.errors[0].phase).toBe('syntax')
      expect(result.errors[0].line).toBeDefined()
    }
  })

  it('缺少 lifecycle 区块返回结构错误', () => {
    writeManifest(`
id: test
version: 1.0.0
name: Test
description: test
intent_triggers: []
field_metadata: {}
list_actions: []
required_fields: {}
subscribed_events: []
`)
    const result = loadDomainManifest(tmpDir)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errors.some(e => e.phase === 'structure')).toBe(true)
    }
  })

  it('语义错误（transition.to 不在 states 中）', () => {
    writeManifest(`
id: test
version: 1.0.0
name: Test
description: test
intent_triggers:
  - action: create
    description: create
    examples: []
    keywords: []
lifecycle:
  obj:
    states: [draft, active]
    initial_state: draft
    transitions:
      - from: null
        to: draft
        trigger: intent
        action: create
        event_type: Created
      - from: draft
        to: nonexistent
        trigger: intent
        action: activate
        event_type: Activated
    terminal_states: []
field_metadata: {}
list_actions: []
required_fields: {}
subscribed_events: []
`)
    const result = loadDomainManifest(tmpDir)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errors.some(e => e.phase === 'semantics')).toBe(true)
    }
  })

  it('第二次加载同一目录返回缓存结果', () => {
    const realDir = path.resolve(__dirname, '../../timebox')
    const result1 = loadDomainManifest(realDir)
    const result2 = loadDomainManifest(realDir)
    expect(result1).toBe(result2) // 同一引用（缓存命中）
  })

  it('field_metadata 解析 mutation_mode 字段（[018] T8）', () => {
    writeManifest(`
id: mutation-test
version: 1.0.0
name: Test
description: test
intent_triggers: []
lifecycle:
  obj:
    states: [draft, active]
    initial_state: draft
    transitions:
      - from: null
        to: draft
        trigger: intent
        action: create
        event_type: Created
    terminal_states: []
field_metadata:
  obj:  # [026] T23 per-objectType 嵌套
    priority:
      type: enum
      label: 优先级
      required: false
      options: [high, medium, low]
      mutation_mode: FactField
    title:
      type: string
      label: 标题
      required: true
      mutation_mode: ContentField
list_actions: []
required_fields: {}
subscribed_events: []
`)
    const result = loadDomainManifest(tmpDir)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.manifest.field_metadata['obj']?.['priority'].mutation_mode).toBe('FactField')
      expect(result.manifest.field_metadata['obj']?.['title'].mutation_mode).toBe('ContentField')
    }
  })

  it('field_metadata 缺省 mutation_mode 仍可解析（可选字段，[018] T8）', () => {
    writeManifest(`
id: mutation-default-test
version: 1.0.0
name: Test
description: test
intent_triggers: []
lifecycle:
  obj:
    states: [draft, active]
    initial_state: draft
    transitions:
      - from: null
        to: draft
        trigger: intent
        action: create
        event_type: Created
    terminal_states: []
field_metadata:
  obj:  # [026] T23 per-objectType 嵌套
    title:
      type: string
      label: 标题
      required: true
list_actions: []
required_fields: {}
subscribed_events: []
`)
    const result = loadDomainManifest(tmpDir)
    expect(result.success).toBe(true)
    if (result.success) {
      expect(result.manifest.field_metadata['obj']?.['title'].mutation_mode).toBeUndefined()
    }
  })

  it('[020] okrs 旧 C 残留 label/required 被 strip，load 成功', () => {
    const realDir = path.resolve(__dirname, '../../okrs')
    const loaded = loadDomainManifest(realDir)
    expect(loaded.success).toBe(true)
    // zod 非 strict strip：旧域 field_metadata 中 label/required/default_value/description 被剥离
    // [026] T23: title 在 objective 块下
    if (loaded.success) {
      const titleMeta = loaded.manifest.field_metadata?.objective?.title as Record<string, unknown> | undefined
      expect(titleMeta).toBeDefined()
      expect(titleMeta).not.toHaveProperty('label')
      expect(titleMeta).not.toHaveProperty('required')
    }
  })
})
