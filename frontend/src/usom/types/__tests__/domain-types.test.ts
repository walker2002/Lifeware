import { describe, it, expect } from 'vitest'
import type {
  DomainManifest,
  LifecycleDefinition,
  LifecycleTransition,
  IntentTrigger,
  FieldMetadata,
  ListAction,
  FieldPrompt,
  FormField,
} from '../domain-types'

describe('domain-types', () => {
  it('DomainManifest 应接受完整六区块结构', () => {
    const manifest: DomainManifest = {
      id: 'timebox',
      version: '1.0.0',
      name: 'Timebox',
      description: '时间盒管理',
      intent_triggers: [],
      lifecycle: {},
      field_metadata: {},
      list_actions: [],
      required_fields: {},
      subscribed_events: [],
    }

    expect(manifest.id).toBe('timebox')
    expect(manifest.intent_triggers).toEqual([])
    expect(manifest.lifecycle).toEqual({})
    expect(manifest.field_metadata).toEqual({})
    expect(manifest.list_actions).toEqual([])
    expect(manifest.required_fields).toEqual({})
    expect(manifest.subscribed_events).toEqual([])
  })

  it('LifecycleDefinition 应定义完整状态机', () => {
    const lifecycle: LifecycleDefinition = {
      states: ['draft', 'active', 'completed'],
      initial_state: 'draft',
      transitions: [
        { from: null, to: 'draft', trigger: 'intent', action: 'create', event_type: 'Created' },
        { from: 'draft', to: 'active', trigger: 'intent', action: 'activate', event_type: 'Activated' },
      ],
      terminal_states: ['completed'],
    }

    expect(lifecycle.states).toHaveLength(3)
    expect(lifecycle.initial_state).toBe('draft')
    expect(lifecycle.transitions).toHaveLength(2)
    expect(lifecycle.terminal_states).toContain('completed')
  })

  it('LifecycleTransition 应支持 from 为 null（创建）', () => {
    const transition: LifecycleTransition = {
      from: null,
      to: 'draft',
      trigger: 'intent',
      action: 'create',
      event_type: 'Created',
    }

    expect(transition.from).toBeNull()
  })

  it('LifecycleTransition 应支持 from 为字符串数组（多状态汇聚）', () => {
    const transition: LifecycleTransition = {
      from: ['active', 'paused'],
      to: 'archived',
      trigger: 'intent',
      action: 'archive',
      event_type: 'Archived',
    }

    expect(transition.from).toEqual(['active', 'paused'])
  })

  it('IntentTrigger 应包含路由所需字段', () => {
    const trigger: IntentTrigger = {
      action: 'createTimebox',
      description: '创建时间盒',
      examples: ['帮我创建一个时间盒'],
      keywords: ['时间盒', 'timebox'],
    }

    expect(trigger.action).toBe('createTimebox')
    expect(trigger.keywords).toContain('时间盒')
  })

  it('FieldMetadata 应描述字段属性', () => {
    const meta: FieldMetadata = {
      type: 'string',
      label: '标题',
      required: true,
    }

    expect(meta.type).toBe('string')
    expect(meta.required).toBe(true)
  })

  it('FieldMetadata 应支持 lifecycle_timestamp 类型', () => {
    const meta: FieldMetadata = {
      type: 'lifecycle_timestamp',
      label: '开始时间',
      required: false,
    }

    expect(meta.type).toBe('lifecycle_timestamp')
  })

  it('ListAction 应定义列表操作', () => {
    const action: ListAction = {
      action: 'archive',
      label: '归档',
      confirm_required: true,
    }

    expect(action.action).toBe('archive')
    expect(action.confirm_required).toBe(true)
  })

  it('FieldPrompt 应定义表单字段提示', () => {
    const prompt: FieldPrompt = {
      name: 'title',
      label: '标题',
      type: 'text',
      required: true,
    }

    expect(prompt.name).toBe('title')
    expect(prompt.required).toBe(true)
  })

  it('FormField 应定义表单字段', () => {
    const field: FormField = {
      name: 'title',
      label: '标题',
      type: 'text',
      required: true,
    }

    expect(field.type).toBe('text')
  })

  it('DomainManifest 应支持 templates 可选字段', () => {
    const manifest: DomainManifest = {
      id: 'timebox',
      version: '1.0.0',
      name: 'Timebox',
      description: '',
      intent_triggers: [],
      lifecycle: {},
      field_metadata: {},
      list_actions: [],
      required_fields: {},
      templates: {
        form: {
          create: [{ name: 'title', label: '标题', type: 'text', required: true }],
        },
      },
      subscribed_events: [],
    }

    expect(manifest.templates?.form.create).toHaveLength(1)
  })

  it('IntentTrigger 应支持 view_route 可选字段', () => {
    const trigger: IntentTrigger = {
      action: 'viewTimeboxes',
      description: '查看时间盒',
      examples: ['查看今天的时间盒'],
      keywords: ['时间盒', 'timebox'],
      view_route: '/timeboxes',
    }

    expect(trigger.view_route).toBe('/timeboxes')
  })
})
