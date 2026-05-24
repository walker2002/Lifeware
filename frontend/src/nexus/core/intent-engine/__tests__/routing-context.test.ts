import { describe, it, expect, vi } from 'vitest'

// Mock domain registry
vi.mock('@/domains/registry', () => ({
  domainRegistry: [
    {
      manifest: {
        domainId: 'habits',
        intentTriggers: [
          {
            action: 'list_active_habits',
            description: '查看习惯列表',
            keywords: ['习惯', '列表'],
            examples: ['看看我的习惯'],
          },
          {
            action: 'view_list',
            description: '打开习惯页面',
            view_route: '/habits',
            keywords: ['打开', '管理'],
            examples: ['打开习惯管理'],
          },
          {
            action: 'createHabit',
            description: '创建新习惯',
            keywords: ['创建', '新增'],
            examples: ['创建一个习惯'],
          },
        ],
      },
    },
  ],
}))

vi.mock('@/domains/manifest-loader', () => ({
  loadDomainManifest: (domainId: string) => {
    if (domainId === 'habits') {
      return {
        success: true,
        manifest: {
          id: 'habits',
          version: '1.0.0',
          name: 'Habits',
          intent_triggers: [
            {
              action: 'list_active_habits',
              description: '查看习惯列表',
              keywords: ['习惯', '列表'],
              examples: ['看看我的习惯'],
            },
            {
              action: 'view_list',
              description: '打开习惯页面',
              view_route: '/habits',
              keywords: ['打开', '管理'],
              examples: ['打开习惯管理'],
            },
            {
              action: 'createHabit',
              description: '创建新习惯',
              keywords: ['创建', '新增'],
              examples: ['创建一个习惯'],
            },
          ],
          query_actions: {
            list_active_habits: {
              description: 'list',
              response_mode: 'cnui',
              context_capabilities: [],
            },
          },
          generation_actions: {
            createHabit: {
              description: 'create',
              contexts: [],
            },
          },
        },
      }
    }
    return { success: false, errors: [{ domainId, message: 'not found' }] }
  },
}))

import { buildRoutingContext, formatRoutingContextForPrompt } from '../routing-context'

describe('buildRoutingContext', () => {
  it('builds routing info from domain registrations', () => {
    const actions = buildRoutingContext()
    expect(actions.length).toBeGreaterThan(0)
  })

  it('classifies query_actions as "query" type', () => {
    const actions = buildRoutingContext()
    const listAction = actions.find(a => a.action === 'list_active_habits')
    expect(listAction).toBeDefined()
    expect(listAction!.type).toBe('query')
  })

  it('classifies view_routes as "view_route" type', () => {
    const actions = buildRoutingContext()
    const viewAction = actions.find(a => a.action === 'view_list')
    expect(viewAction).toBeDefined()
    expect(viewAction!.type).toBe('view_route')
  })

  it('classifies generation_actions as "generative" type', () => {
    const actions = buildRoutingContext()
    const genAction = actions.find(a => a.action === 'createHabit')
    expect(genAction).toBeDefined()
    expect(genAction!.type).toBe('generative')
  })
})

describe('formatRoutingContextForPrompt', () => {
  it('formats actions into prompt-ready text', () => {
    const actions = [{
      domainId: 'habits',
      action: 'list_active_habits',
      type: 'query' as const,
      description: '查看习惯列表',
      examples: ['看看我的习惯'],
      keywords: ['习惯'],
    }]
    const text = formatRoutingContextForPrompt(actions)
    expect(text).toContain('habits.list_active_habits')
    expect(text).toContain('对话内查询')
    expect(text).toContain('看看我的习惯')
  })
})
