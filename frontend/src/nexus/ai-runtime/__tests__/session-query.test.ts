import { describe, it, expect, beforeEach } from 'vitest'
import { createAISessionManager } from '../session'

describe('AISessionManager query result support', () => {
  let manager: ReturnType<typeof createAISessionManager>

  beforeEach(() => {
    manager = createAISessionManager()
  })

  it('recordQueryResult stores query result on session', async () => {
    const session = await manager.create({ domainId: 'habits', action: 'list', userId: 'u1' })
    await manager.activate(session.id)

    manager.recordQueryResult(session.id, {
      action: 'list_active_habits',
      domain: 'habits',
      resultSummary: { count: 3, objectIds: ['h1'], keyMetrics: {} },
      timestamp: new Date().toISOString(),
    })

    const results = manager.getQueryResults(session.id)
    expect(results).toHaveLength(1)
    expect(results[0].action).toBe('list_active_habits')
  })

  it('replaces query result for same action', async () => {
    const session = await manager.create({ domainId: 'habits', action: 'list', userId: 'u1' })
    await manager.activate(session.id)

    manager.recordQueryResult(session.id, {
      action: 'list_active_habits',
      domain: 'habits',
      resultSummary: { count: 3, objectIds: ['h1'], keyMetrics: {} },
      timestamp: new Date().toISOString(),
    })

    manager.recordQueryResult(session.id, {
      action: 'list_active_habits',
      domain: 'habits',
      resultSummary: { count: 5, objectIds: ['h1', 'h2'], keyMetrics: {} },
      timestamp: new Date().toISOString(),
    })

    const results = manager.getQueryResults(session.id)
    expect(results).toHaveLength(1)
    expect(results[0].resultSummary.count).toBe(5)
  })

  it('getQueryResults returns empty array for no results', () => {
    expect(manager.getQueryResults('nonexistent')).toEqual([])
  })

  it('findActiveSessionByDomain finds active session for user+domain', async () => {
    const s1 = await manager.create({ domainId: 'habits', action: 'list', userId: 'u1' })
    await manager.activate(s1.id)

    const s2 = await manager.create({ domainId: 'timebox', action: 'create', userId: 'u1' })
    await manager.activate(s2.id)

    const found = manager.findActiveSessionByDomain('u1', 'habits')
    expect(found).toBeDefined()
    expect(found!.domainId).toBe('habits')
  })

  it('findActiveSessionByDomain returns undefined for non-active sessions', async () => {
    const session = await manager.create({ domainId: 'habits', action: 'list', userId: 'u1' })
    // 不激活 — status 是 'created'
    const found = manager.findActiveSessionByDomain('u1', 'habits')
    expect(found).toBeUndefined()
  })

  it('findActiveSessionByDomain returns undefined for wrong userId', async () => {
    const session = await manager.create({ domainId: 'habits', action: 'list', userId: 'u1' })
    await manager.activate(session.id)
    const found = manager.findActiveSessionByDomain('u2', 'habits')
    expect(found).toBeUndefined()
  })
})
