/**
 * @file habits-compliance
 * @brief Habits 域 compliance 套件 — 守护 manifest 六区块、hooks 纯函数、
 *        transitions 一致性、插件入口，以及写入口治理（mutation_mode）完整性。
 *
 * T007-T010 验证既有合规要求；T011（写入口 mutation_mode 完整性）补 compliance 层
 * 对 [018-G1] 写入口治理的覆盖 —— 字段执行器对未标 mutation_mode 的字段会拒绝写入，
 * 故 compliance 套件须独立断言每个字段都已标注合法 mode，且 Fact/Content 两类非空。
 */
import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { habitsPlugin } from '../index'
import { createHabitsHooks } from '../hooks'
import { habitTransitions } from '../transitions'
import { loadDomainManifest } from '@/domains/manifest-loader'
import type { FieldMetadata } from '@/usom/types/domain-types'

const MANIFEST_PATH = resolve(__dirname, '../manifest.yaml')

describe('T007: Habits manifest.yaml 六区块完整性', () => {
  let manifestContent: string

  beforeAll(() => {
    manifestContent = readFileSync(MANIFEST_PATH, 'utf-8')
  })

  it('应包含 intent_triggers 区块 (A)', () => {
    expect(manifestContent).toContain('intent_triggers:')
  })

  it('intent_triggers 应包含 createHabit/activateHabit/suspendHabit/archiveHabit/reactivateHabit', () => {
    expect(manifestContent).toMatch(/action:\s*createHabit/)
    expect(manifestContent).toMatch(/action:\s*activateHabit/)
    expect(manifestContent).toMatch(/action:\s*suspendHabit/)
    expect(manifestContent).toMatch(/action:\s*archiveHabit/)
    expect(manifestContent).toMatch(/action:\s*reactivateHabit/)
  })

  it('intent_triggers 应包含 view_list 和 view_statistics 含 view_route', () => {
    expect(manifestContent).toMatch(/action:\s*view_list/)
    expect(manifestContent).toMatch(/action:\s*view_statistics/)
    expect(manifestContent).toMatch(/view_route:/)
  })

  it('应包含 lifecycle 区块 (B)', () => {
    expect(manifestContent).toContain('lifecycle:')
  })

  it('lifecycle 应包含 habit 对象的状态定义', () => {
    expect(manifestContent).toContain('habit:')
  })

  it('lifecycle.states 应包含 draft/active/suspended/archived', () => {
    const statesMatch = manifestContent.match(/states:\s*\[([^\]]+)\]/)
    expect(statesMatch).not.toBeNull()
    const states = statesMatch![1]
    expect(states).toContain('draft')
    expect(states).toContain('active')
    expect(states).toContain('suspended')
    expect(states).toContain('archived')
  })

  it('lifecycle.transitions 应包含 5 个转换', () => {
    expect(manifestContent).toMatch(/action:\s*create/)
    expect(manifestContent).toMatch(/action:\s*activate/)
    expect(manifestContent).toMatch(/action:\s*suspend/)
    expect(manifestContent).toMatch(/action:\s*reactivate/)
    expect(manifestContent).toMatch(/action:\s*archive/)
  })

  it('应包含 field_metadata 区块 (C)', () => {
    expect(manifestContent).toContain('field_metadata:')
  })

  it('field_metadata 应包含 title/defaultTime/defaultDuration/frequencyType/daysOfWeek/trackable/minDuration', () => {
    expect(manifestContent).toContain('title:')
    expect(manifestContent).toContain('defaultTime:')
    expect(manifestContent).toContain('defaultDuration:')
    expect(manifestContent).toContain('frequencyType:')
    expect(manifestContent).toContain('daysOfWeek:')
    expect(manifestContent).toContain('trackable:')
    expect(manifestContent).toContain('minDuration:')
  })

  it('应包含 list_actions 区块 (D)', () => {
    expect(manifestContent).toContain('list_actions:')
  })

  it('应包含 required_fields 区块 (E)', () => {
    expect(manifestContent).toContain('required_fields:')
  })

  it('应包含 subscribed_events 区块 (F)', () => {
    expect(manifestContent).toContain('subscribed_events:')
  })
})

/**
 * T011：写入口治理完整性（[018-G1] compliance 层覆盖）
 *
 * 与 manifest-field-metadata.test.ts（G1-M1 结构层）互补：
 * - G1-M1 精确断言「14 字段各自 mode 值对不对」（值正确性）。
 * - T011（本块）从 compliance 视角断言「写入口治理契约不被破坏」——
 *   (a) 每个字段都标了 mutation_mode（缺标 = 字段执行器拒绝写入 = 治理漏洞）；
 *   (b) FactField 与 ContentField 两类都非空（防止全部错标为同一类导致分类失效）；
 *   (c) 不出现 PresentationField（写入口只认 Fact/Content 两类）。
 */
describe('T011: habits field_metadata 写入口治理完整性', () => {
  let fieldMetadata: Record<string, FieldMetadata>

  beforeAll(() => {
    const result = loadDomainManifest('habits')
    expect(result.success).toBe(true)
    fieldMetadata = (result.success ? result.manifest.field_metadata : {}) as Record<string, FieldMetadata>
  })

  it('manifest 应成功加载且 field_metadata 非空', () => {
    expect(Object.keys(fieldMetadata).length).toBeGreaterThan(0)
  })

  it('每个字段都应标注 mutation_mode（缺标即写入口治理漏洞）', () => {
    const missing: string[] = []
    for (const [name, meta] of Object.entries(fieldMetadata)) {
      if (meta.mutation_mode === undefined || meta.mutation_mode === null) {
        missing.push(name)
      }
    }
    expect(missing).toEqual([])
  })

  it('每个字段的 mutation_mode 必须是 FactField 或 ContentField（拒绝 PresentationField）', () => {
    const allowed: FieldMetadata['mutation_mode'][] = ['FactField', 'ContentField']
    const offenders: string[] = []
    for (const [name, meta] of Object.entries(fieldMetadata)) {
      if (!allowed.includes(meta.mutation_mode)) {
        offenders.push(`${name}=${String(meta.mutation_mode)}`)
      }
    }
    expect(offenders).toEqual([])
  })

  it('FactField 与 ContentField 两类都应非空（分类不能整体退化）', () => {
    const modes = Object.values(fieldMetadata).map(m => m.mutation_mode)
    const factCount = modes.filter(m => m === 'FactField').length
    const contentCount = modes.filter(m => m === 'ContentField').length
    expect(factCount).toBeGreaterThan(0)
    expect(contentCount).toBeGreaterThan(0)
  })
})

describe('T008: Habits hooks.ts 纯函数验证', () => {
  it('hooks.ts 不应包含数据库相关导入', () => {
    const hooksContent = readFileSync(resolve(__dirname, '../hooks.ts'), 'utf-8')
    expect(hooksContent).not.toMatch(/from.*['"]@?\.?\.?\/?(lib\/db|drizzle|repository)/)
    expect(hooksContent).not.toMatch(/import.*[Rr]epository/)
  })

  it('createHabitsHooks 工厂函数应从 hooks.ts 导出', () => {
    expect(typeof createHabitsHooks).toBe('function')
  })

  it('createHabitsHooks 应返回三个钩子函数', () => {
    const mockManifest = {
      id: 'habits',
      version: '1.0.0',
      name: '习惯管理',
      description: '',
      intent_triggers: [],
      lifecycle: {},
      field_metadata: {
        frequencyType: { type: 'enum', label: '频率类型', required: true, options: ['daily', 'weekly', 'custom'] },
      },
      list_actions: [],
      required_fields: {},
      subscribed_events: ['HabitCreated', 'HabitActivated', 'HabitSuspended', 'HabitArchived', 'HabitLogged', 'HabitSkipped', 'HabitStreakMilestone'],
    }
    const hooks = createHabitsHooks(mockManifest as any)
    expect(typeof hooks.onValidate).toBe('function')
    expect(typeof hooks.onEvent).toBe('function')
    expect(typeof hooks.onActionSurfaceRequest).toBe('function')
  })
})

describe('T009: Habits transitions 一致性', () => {
  it('transitions.ts 应导出 habitTransitions 数组', () => {
    expect(Array.isArray(habitTransitions)).toBe(true)
    expect(habitTransitions.length).toBe(5)
  })

  it('应包含 create 转换 (null → draft)', () => {
    const create = habitTransitions.find(t => t.action === 'create')
    expect(create).toBeDefined()
    expect(create!.from).toBeNull()
    expect(create!.to).toBe('draft')
    expect(create!.eventType).toBe('HabitCreated')
  })

  it('应包含 activate 转换 (draft → active)', () => {
    const activate = habitTransitions.find(t => t.action === 'activate')
    expect(activate).toBeDefined()
    expect(activate!.from).toBe('draft')
    expect(activate!.to).toBe('active')
    expect(activate!.eventType).toBe('HabitActivated')
  })

  it('应包含 suspend 转换 (active → suspended)', () => {
    const suspend = habitTransitions.find(t => t.action === 'suspend')
    expect(suspend).toBeDefined()
    expect(suspend!.from).toBe('active')
    expect(suspend!.to).toBe('suspended')
    expect(suspend!.eventType).toBe('HabitSuspended')
  })

  it('应包含 reactivate 转换 (suspended → active)', () => {
    const reactivate = habitTransitions.find(t => t.action === 'reactivate')
    expect(reactivate).toBeDefined()
    expect(reactivate!.from).toBe('suspended')
    expect(reactivate!.to).toBe('active')
    expect(reactivate!.eventType).toBe('HabitActivated')
  })

  it('应包含 archive 转换 (suspended → archived)', () => {
    const archive = habitTransitions.find(t => t.action === 'archive')
    expect(archive).toBeDefined()
    expect(archive!.from).toBe('suspended')
    expect(archive!.to).toBe('archived')
    expect(archive!.eventType).toBe('HabitArchived')
  })
})

describe('T010: Habits index.ts 插件入口', () => {
  it('habitsPlugin.manifest 应存在', () => {
    expect(habitsPlugin.manifest).toBeDefined()
  })

  it('habitsPlugin 应暴露 onValidate/onEvent/onActionSurfaceRequest', () => {
    expect(typeof habitsPlugin.onValidate).toBe('function')
    expect(typeof habitsPlugin.onEvent).toBe('function')
    expect(typeof habitsPlugin.onActionSurfaceRequest).toBe('function')
  })

  it('manifest.domainId 应为 habits', () => {
    expect(habitsPlugin.manifest.domainId).toBe('habits')
  })
})
