import { describe, it, expect } from 'vitest'
import { formatCNUIFromContext, formatTextSummary } from '../query-cnui-formatter'
import type { QueryContext } from '@/usom/types/process'

function makeQueryContext(contexts: Record<string, unknown>): QueryContext {
  return {
    intent: {
      id: 'i1',
      intentionId: 'ii1',
      targetDomain: 'habits',
      action: 'list_active_habits',
      fields: {},
      confidence: 1.0,
      resolvedBy: 'ai',
      pathType: 'query',
      createdAt: '2026-05-24T00:00:00Z',
    },
    contexts,
    sessionId: 's1',
  }
}

describe('formatCNUIFromContext', () => {
  it('formats array context into cnui list', () => {
    const qc = makeQueryContext({
      activeHabits: [
        { id: 'h1', title: '晨跑', status: 'active' },
        { id: 'h2', title: '冥想', status: 'active' },
      ],
    })

    const result = formatCNUIFromContext(qc, {
      response_mode: 'cnui',
      cnui_surface: 'habit-list-card',
    })

    expect(result.type).toBe('cnui')
    if (result.type === 'cnui') {
      expect(result.payload.surfaceType).toBe('habit-list-card')
      expect(result.payload.components[0].type).toBe('list')
      expect(result.payload.components[0].props.items).toHaveLength(2)
      expect(result.payload.actions).toEqual([{ type: 'dismiss', label: '关闭' }])
    }
  })

  it('wraps scalar context into single-item list', () => {
    const qc = makeQueryContext({
      stats: { total: 10, completed: 7 },
    })

    const result = formatCNUIFromContext(qc, {
      response_mode: 'cnui',
      cnui_surface: 'generic-list',
    })

    expect(result.type).toBe('cnui')
    if (result.type === 'cnui') {
      expect(result.payload.components[0].props.items).toHaveLength(1)
    }
  })

  it('handles empty contexts', () => {
    const qc = makeQueryContext({})

    const result = formatCNUIFromContext(qc, {
      response_mode: 'cnui',
    })

    expect(result.type).toBe('cnui')
    if (result.type === 'cnui') {
      expect(result.payload.components[0].props.items).toHaveLength(0)
    }
  })

  it('uses item.name as fallback title', () => {
    const qc = makeQueryContext({
      items: [{ id: 'x', name: '项目A' }],
    })

    const result = formatCNUIFromContext(qc, {
      response_mode: 'cnui',
      cnui_surface: 'generic-list',
    })

    if (result.type === 'cnui') {
      expect(result.payload.components[0].props.items[0].title).toBe('项目A')
    }
  })
})

describe('formatTextSummary', () => {
  it('returns count summary for array context', () => {
    const qc = makeQueryContext({
      habits: [{ id: 'h1' }, { id: 'h2' }, { id: 'h3' }],
    })
    expect(formatTextSummary(qc)).toBe('找到 3 条记录')
  })

  it('returns fallback for empty contexts', () => {
    const qc = makeQueryContext({})
    expect(formatTextSummary(qc)).toBe('没有找到相关数据')
  })
})
