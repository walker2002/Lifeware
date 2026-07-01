import { describe, it, expect } from 'vitest'
import { resolveSlashCommand, suggestShortcut } from '@/lib/slash-command'

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

// [023-01+ v4] suggestShortcut：未识别命令的「did you mean」提示
//   场景：/createTime 拼写错误（注册的是 /createTimebox），不应静默落到习惯解析器
describe('suggestShortcut', () => {
  // 真实注册的快捷方式子集（来自各域 manifest）
  const triggers = [
    '/createHabit', '/createTask', '/createThread', '/createTimebox',
    '/startTimebox', '/logHabit', '/tasks', '/habits',
  ].map((shortcut) => ({ shortcut }))

  it('唯一前缀匹配 → 返回该 shortcut（createTime → createTimebox）', () => {
    expect(suggestShortcut('createTime', triggers)).toBe('/createTimebox')
  })

  it('大小写不敏感', () => {
    expect(suggestShortcut('CreateTime', triggers)).toBe('/createTimebox')
  })

  it('多义前缀 → undefined（create 同时匹配 createHabit/createTask/createThread/createTimebox）', () => {
    expect(suggestShortcut('create', triggers)).toBeUndefined()
  })

  it('完全无匹配 → undefined', () => {
    expect(suggestShortcut('createXYZ', triggers)).toBeUndefined()
  })

  it('空 action → undefined', () => {
    expect(suggestShortcut('', triggers)).toBeUndefined()
  })

  it('接受纯字符串数组形式', () => {
    expect(suggestShortcut('startTime', ['/startTimebox', '/logHabit'])).toBe('/startTimebox')
  })

  it('接受 action 恰好等于某 shortcut 名（完整匹配也算前缀）', () => {
    expect(suggestShortcut('createHabit', triggers)).toBe('/createHabit')
  })
})
