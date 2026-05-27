import { describe, it, expect } from 'vitest'
import { resolveSlashCommand } from '@/lib/slash-command'

describe('resolveSlashCommand', () => {
  describe('非 slash 命令', () => {
    it('普通文本', () => {
      expect(resolveSlashCommand('帮我创建习惯')).toEqual({ isSlashCommand: false })
    })

    it('空字符串', () => {
      expect(resolveSlashCommand('')).toEqual({ isSlashCommand: false })
    })

    it('仅斜杠无命令', () => {
      expect(resolveSlashCommand('/')).toEqual({ isSlashCommand: false })
    })

    it('中间有斜杠的普通文本', () => {
      expect(resolveSlashCommand('查看 /path 路径')).toEqual({ isSlashCommand: false })
    })
  })

  describe('短格式 /actionName', () => {
    it('无 payload', () => {
      const result = resolveSlashCommand('/createHabit')
      expect(result).toEqual({
        isSlashCommand: true,
        hasPayload: false,
        domainId: '',
        action: 'createHabit',
        payload: undefined,
      })
    })

    it('带 payload', () => {
      const result = resolveSlashCommand('/createHabit 每天跑步半小时')
      expect(result).toEqual({
        isSlashCommand: true,
        hasPayload: true,
        domainId: '',
        action: 'createHabit',
        payload: '每天跑步半小时',
      })
    })

    it('带下划线的 actionName', () => {
      const result = resolveSlashCommand('/view_list')
      expect(result).toEqual({
        isSlashCommand: true,
        hasPayload: false,
        domainId: '',
        action: 'view_list',
      })
    })

    it('带连字符的 actionName', () => {
      const result = resolveSlashCommand('/my-action')
      expect(result).toEqual({
        isSlashCommand: true,
        hasPayload: false,
        domainId: '',
        action: 'my-action',
      })
    })
  })

  describe('长格式 /domain:action', () => {
    it('无 payload', () => {
      const result = resolveSlashCommand('/habits:createHabit')
      expect(result).toEqual({
        isSlashCommand: true,
        hasPayload: false,
        domainId: 'habits',
        action: 'createHabit',
        payload: undefined,
      })
    })

    it('带 payload', () => {
      const result = resolveSlashCommand('/habits:createHabit 每天跑步')
      expect(result).toEqual({
        isSlashCommand: true,
        hasPayload: true,
        domainId: 'habits',
        action: 'createHabit',
        payload: '每天跑步',
      })
    })

    it('带连字符的 domain', () => {
      const result = resolveSlashCommand('/my-domain:someAction')
      expect(result).toEqual({
        isSlashCommand: true,
        hasPayload: false,
        domainId: 'my-domain',
        action: 'someAction',
      })
    })
  })

  describe('边界情况', () => {
    it('payload 含多余空格被 trim', () => {
      const result = resolveSlashCommand('/createHabit   每天跑步  ')
      expect(result).toEqual({
        isSlashCommand: true,
        hasPayload: true,
        domainId: '',
        action: 'createHabit',
        payload: '每天跑步',
      })
    })

    it('action 后仅有空格视为无 payload', () => {
      const result = resolveSlashCommand('/createHabit   ')
      expect(result).toEqual({
        isSlashCommand: true,
        hasPayload: false,
        domainId: '',
        action: 'createHabit',
        payload: undefined,
      })
    })

    it('domain:action 后仅有空格视为无 payload', () => {
      const result = resolveSlashCommand('/habits:createHabit   ')
      expect(result).toEqual({
        isSlashCommand: true,
        hasPayload: false,
        domainId: 'habits',
        action: 'createHabit',
        payload: undefined,
      })
    })

    it('payload 含特殊字符', () => {
      const result = resolveSlashCommand('/createHabit 每天 @晚上 22:00，跑步 30min!')
      expect(result).toEqual({
        isSlashCommand: true,
        hasPayload: true,
        domainId: '',
        action: 'createHabit',
        payload: '每天 @晚上 22:00，跑步 30min!',
      })
    })
  })
})
