import { describe, it, expect, vi } from 'vitest'

describe('matchShortcut', () => {
  it('should match long format /domain:action', async () => {
    const { matchShortcut } = await import('../shortcut-matcher')
    const result = matchShortcut('/habits:createHabit')
    expect(result).toEqual({ domainId: 'habits', action: 'createHabit', confidence: 1.0 })
  })

  it('should match short format /action via shortcut lookup', async () => {
    const { matchShortcut } = await import('../shortcut-matcher')
    const result = matchShortcut('/createHabit')
    expect(result).toEqual({ domainId: 'habits', action: 'createHabit', confidence: 1.0 })
  })

  it('should return undefined for non-matching input', async () => {
    const { matchShortcut } = await import('../shortcut-matcher')
    const result = matchShortcut('/nonexistent')
    expect(result).toBeUndefined()
  })

  it('should return undefined for input not starting with /', async () => {
    const { matchShortcut } = await import('../shortcut-matcher')
    const result = matchShortcut('createHabit')
    expect(result).toBeUndefined()
  })

  it('should prioritize long format over short', async () => {
    const { matchShortcut } = await import('../shortcut-matcher')
    const result = matchShortcut('/habits:createHabit')
    expect(result?.domainId).toBe('habits')
    expect(result?.action).toBe('createHabit')
  })

  it('should return undefined for empty string', async () => {
    const { matchShortcut } = await import('../shortcut-matcher')
    const result = matchShortcut('')
    expect(result).toBeUndefined()
  })
})
