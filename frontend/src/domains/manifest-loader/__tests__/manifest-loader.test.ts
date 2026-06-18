import { describe, it, expect } from 'vitest'
import { formatManifestError, type ManifestLoadError } from '../errors'
import { ManifestSchema, type DomainManifest } from '../schema'
import { validateSemantics } from '../validator'
import { createDomainPlugin } from '../../plugin-factory'

// 合法的最小 manifest 数据（与 timebox manifest 结构匹配）
const validManifest = {
  id: 'timebox',
  version: '1.0.0',
  name: 'Timebox',
  description: '时间盒管理',
  intent_triggers: [
    { action: 'createTimebox', description: '创建', examples: ['创建'], keywords: ['创建'] },
  ],
  lifecycle: {
    timebox: {
      states: ['planned', 'running', 'ended'],
      initial_state: 'planned',
      transitions: [
        { from: null, to: 'planned', trigger: 'intent', action: 'create', event_type: 'TimeboxCreated' },
      ],
      terminal_states: ['ended'],
    },
  },
  field_metadata: {
    title: { type: 'string', label: '标题', required: true },
  },
  list_actions: [
    { action: 'start', label: '开始', confirm_required: false },
  ],
  required_fields: {
    createTimebox: [
      { name: 'title', label: '标题', type: 'text' as const, required: true },
    ],
  },
  subscribed_events: ['TimeboxCreated', 'TimeboxStarted'],
}

describe('ManifestLoadError', () => {
  describe('formatManifestError', () => {
    it('格式化语法错误（含行号）', () => {
      const error: ManifestLoadError = {
        domainId: 'timebox',
        filePath: '/src/domains/timebox/manifest.yaml',
        phase: 'syntax',
        message: 'bad indentation',
        line: 15,
      }
      const result = formatManifestError(error)
      expect(result).toContain('timebox')
      expect(result).toContain('line 15')
      expect(result).toContain('bad indentation')
      expect(result).toContain('manifest.yaml')
    })

    it('格式化结构错误（含 fieldPath）', () => {
      const error: ManifestLoadError = {
        domainId: 'habits',
        filePath: '/src/domains/habits/manifest.yaml',
        phase: 'structure',
        message: 'Required',
        fieldPath: ['lifecycle', 'states'],
      }
      const result = formatManifestError(error)
      expect(result).toContain('habits')
      expect(result).toContain('lifecycle.states')
      expect(result).toContain('structure')
    })

    it('格式化语义错误（无行号）', () => {
      const error: ManifestLoadError = {
        domainId: 'okrs',
        filePath: '/src/domains/okrs/manifest.yaml',
        phase: 'semantics',
        message: 'initial_state "foo" 不在 states 列表中',
      }
      const result = formatManifestError(error)
      expect(result).toContain('okrs')
      expect(result).toContain('semantics')
      expect(result).toContain('foo')
    })
  })
})

describe('ManifestSchema', () => {
  it('解析合法的 manifest 数据', () => {
    const result = ManifestSchema.parse(validManifest)
    expect(result.id).toBe('timebox')
    expect(result.version).toBe('1.0.0')
    expect(result.lifecycle.timebox.states).toEqual(['planned', 'running', 'ended'])
    expect(result.subscribed_events).toContain('TimeboxCreated')
  })

  it('缺少 lifecycle 区块时抛出 ZodError', () => {
    const { lifecycle: _, ...withoutLifecycle } = validManifest
    expect(() => ManifestSchema.parse(withoutLifecycle)).toThrow()
    try {
      ManifestSchema.parse(withoutLifecycle)
    } catch (e: unknown) {
      const zodError = e as { issues: Array<{ path: (string | number)[] }> }
      expect(zodError.issues[0].path).toContain('lifecycle')
    }
  })

  it('缺少 id 时抛出 ZodError', () => {
    const { id: _, ...withoutId } = validManifest
    expect(() => ManifestSchema.parse(withoutId)).toThrow()
  })

  it('transition.from 接受 null', () => {
    const result = ManifestSchema.parse(validManifest)
    expect(result.lifecycle.timebox.transitions[0].from).toBeNull()
  })

  it('field_metadata 中 lifecycle_timestamp 类型合法', () => {
    const data = {
      ...validManifest,
      field_metadata: {
        ...validManifest.field_metadata,
        startedAt: { type: 'lifecycle_timestamp', label: '开始时间', required: false },
      },
    }
    const result = ManifestSchema.parse(data)
    expect(result.field_metadata.startedAt.type).toBe('lifecycle_timestamp')
  })
})

describe('validateSemantics', () => {
  it('合法 manifest 返回空数组', () => {
    const manifest = ManifestSchema.parse(validManifest)
    const errors = validateSemantics(manifest)
    expect(errors).toEqual([])
  })

  it('transition.to 不在 states 列表中时报错', () => {
    const data = {
      ...validManifest,
      lifecycle: {
        timebox: {
          states: ['planned', 'running'],
          initial_state: 'planned',
          transitions: [
            { from: null, to: 'planned', trigger: 'intent' as const, action: 'create', event_type: 'Created' },
            { from: 'planned', to: 'invalid_state', trigger: 'intent' as const, action: 'start', event_type: 'Started' },
          ],
          terminal_states: [],
        },
      },
    }
    const manifest = ManifestSchema.parse(data)
    const errors = validateSemantics(manifest)
    expect(errors).toHaveLength(1)
    expect(errors[0].fieldPath).toEqual(['lifecycle', 'timebox', 'transitions', '1', 'to'])
    expect(errors[0].message).toContain('invalid_state')
  })

  it('initial_state 不在 states 列表中时报错', () => {
    const data = {
      ...validManifest,
      lifecycle: {
        timebox: {
          states: ['planned'],
          initial_state: 'missing',
          transitions: [],
          terminal_states: [],
        },
      },
    }
    const manifest = ManifestSchema.parse(data)
    const errors = validateSemantics(manifest)
    expect(errors.some(e => e.fieldPath?.join('.').includes('initial_state'))).toBe(true)
  })

  it('terminal_states 不是 states 子集时报错', () => {
    const data = {
      ...validManifest,
      lifecycle: {
        timebox: {
          states: ['planned', 'running'],
          initial_state: 'planned',
          transitions: [],
          terminal_states: ['ended'],
        },
      },
    }
    const manifest = ManifestSchema.parse(data)
    const errors = validateSemantics(manifest)
    expect(errors.some(e => e.message.includes('terminal_states'))).toBe(true)
  })

  it('transition.from 引用了不在 states 中的状态时报错', () => {
    const data = {
      ...validManifest,
      lifecycle: {
        timebox: {
          states: ['planned', 'running'],
          initial_state: 'planned',
          transitions: [
            { from: 'nonexistent', to: 'running', trigger: 'intent' as const, action: 'start', event_type: 'Started' },
          ],
          terminal_states: [],
        },
      },
    }
    const manifest = ManifestSchema.parse(data)
    const errors = validateSemantics(manifest)
    expect(errors.some(e => e.fieldPath?.join('.').includes('from'))).toBe(true)
  })
})

describe('createDomainPlugin', () => {
  const stubHooks = {
    onValidate: () => ({ kind: 'Passed' as const }),
    onEvent: () => ({ metrics: [], suggestions: [] }),
    onActionSurfaceRequest: () => ({ actions: [], category: 'guide' as const, weight: 0 }),
  }

  it('从完整 manifest 构建 process 层 DomainPlugin', () => {
    const manifest = ManifestSchema.parse(validManifest)
    const plugin = createDomainPlugin(manifest, stubHooks)

    expect(plugin.manifest.domainId).toBe('timebox')
    expect(plugin.manifest.version).toBe('1.0.0')
    expect(plugin.manifest.subscribedEvents).toContain('TimeboxCreated')
  })

  it('requiredFields 从 required_fields 区块提取唯一字段名', () => {
    const manifest = ManifestSchema.parse(validManifest)
    const plugin = createDomainPlugin(manifest, stubHooks)

    // validManifest 的 required_fields.createTimebox 含 title
    expect(plugin.manifest.requiredFields).toContain('title')
    expect(plugin.manifest.requiredFields.length).toBeGreaterThanOrEqual(1)
  })

  it('hooks 被正确传递', () => {
    const manifest = ManifestSchema.parse(validManifest)
    const plugin = createDomainPlugin(manifest, stubHooks)

    expect(typeof plugin.onValidate).toBe('function')
    expect(typeof plugin.onEvent).toBe('function')
    expect(typeof plugin.onActionSurfaceRequest).toBe('function')
  })
})
