import { describe, it, expect } from 'vitest'
import { mergeSessionState } from '../session-merge'
import type { AISession, ChatMessage } from '@/usom/types/objects'

function makeSession(overrides: Partial<AISession> = {}): AISession {
  return {
    id: 'session-1',
    userId: 'user-1',
    title: '测试对话',
    status: 'active',
    messages: [],
    stateSnapshot: {},
    referencedObjectIds: [],
    createdAt: '2026-05-16T10:00:00Z',
    updatedAt: '2026-05-16T10:00:00Z',
    ...overrides,
  }
}

describe('mergeSessionState', () => {
  it('should return empty diff when no objects referenced', async () => {
    const session = makeSession()
    const result = await mergeSessionState(session, async () => [])
    expect(result.systemMessages).toHaveLength(0)
    expect(result.updatedSnapshot).toEqual({})
  })

  it('should detect status change between snapshot and current state', async () => {
    const session = makeSession({
      stateSnapshot: {
        'obj-1': { status: 'draft', title: '目标X' },
      },
      referencedObjectIds: ['obj-1'],
    })

    const fetchCurrentState = async () => [
      { id: 'obj-1', status: 'active', title: '目标X' },
    ]

    const result = await mergeSessionState(session, fetchCurrentState)
    expect(result.systemMessages).toHaveLength(1)
    expect(result.systemMessages[0].content).toContain('obj-1')
    expect(result.systemMessages[0].content).toContain('draft')
    expect(result.systemMessages[0].content).toContain('active')
  })

  it('should detect title change', async () => {
    const session = makeSession({
      stateSnapshot: {
        'obj-1': { status: 'active', title: '旧标题' },
      },
      referencedObjectIds: ['obj-1'],
    })

    const fetchCurrentState = async () => [
      { id: 'obj-1', status: 'active', title: '新标题' },
    ]

    const result = await mergeSessionState(session, fetchCurrentState)
    expect(result.systemMessages).toHaveLength(1)
    expect(result.systemMessages[0].content).toContain('旧标题')
    expect(result.systemMessages[0].content).toContain('新标题')
  })

  it('should produce no messages when nothing changed', async () => {
    const session = makeSession({
      stateSnapshot: {
        'obj-1': { status: 'active', title: '不变' },
      },
      referencedObjectIds: ['obj-1'],
    })

    const fetchCurrentState = async () => [
      { id: 'obj-1', status: 'active', title: '不变' },
    ]

    const result = await mergeSessionState(session, fetchCurrentState)
    expect(result.systemMessages).toHaveLength(0)
  })

  it('should detect deleted objects', async () => {
    const session = makeSession({
      stateSnapshot: {
        'obj-1': { status: 'active', title: '已删除对象' },
      },
      referencedObjectIds: ['obj-1'],
    })

    const fetchCurrentState = async () => []

    const result = await mergeSessionState(session, fetchCurrentState)
    expect(result.systemMessages).toHaveLength(1)
    expect(result.systemMessages[0].content).toContain('已删除或无法访问')
  })

  it('should update snapshot with current state', async () => {
    const session = makeSession({
      stateSnapshot: {
        'obj-1': { status: 'draft', title: '目标X' },
      },
      referencedObjectIds: ['obj-1'],
    })

    const fetchCurrentState = async () => [
      { id: 'obj-1', status: 'active', title: '目标X' },
    ]

    const result = await mergeSessionState(session, fetchCurrentState)
    expect(result.updatedSnapshot['obj-1'].status).toBe('active')
    expect(result.updatedSnapshot['obj-1'].title).toBe('目标X')
  })
})
