/**
 * @file validate-domain-structure 单测
 * @brief validator 纯函数 + 集成测试
 */
import { describe, it, expect } from 'vitest'
import * as ts from 'typescript'
import * as fs from 'node:fs'
import * as os from 'node:os'
import * as ppath from 'node:path'
import {
  extractEntryFunctions,
  buildImportMap,
  isExportAsyncFunction,
  buildReceiverMap,
  isBusinessFactRepo,
  analyzeSourceFile,
  checkRulesRegistry,
  collectSourceFiles,
  findCnuiFormAdapterUsage,
  checkCnuiFormAdapter,
  findFormRegistryRegisterCall,
  checkFormRegistryResidual,
} from '../validate-domain-structure'

/** 内联 source → SourceFile（setParentNodes=true 供 getText 用） */
function sf(code: string): ts.SourceFile {
  return ts.createSourceFile('test.ts', code, ts.ScriptTarget.Latest, true)
}

describe('isExportAsyncFunction', () => {
  it('export async function → true', () => {
    const source = sf(`export async function createTask() {}`)
    const fn = source.statements[0] as ts.FunctionDeclaration
    expect(isExportAsyncFunction(fn)).toBe(true)
  })
  it('非 async 或非 export → false', () => {
    const source = sf(`export function syncFn() {}; async function helper() {}`)
    expect(isExportAsyncFunction(source.statements[0] as ts.FunctionDeclaration)).toBe(false)
    expect(isExportAsyncFunction(source.statements[1] as ts.FunctionDeclaration)).toBe(false)
  })
})

describe('extractEntryFunctions', () => {
  it('只识别 export async function，跳过 helper/sync', () => {
    const source = sf(`
      export async function createTask() {}
      async function helper() {}
      export function syncFn() {}
      export async function updateTask() {}
    `)
    const fns = extractEntryFunctions(source)
    expect(fns.map(f => f.name)).toEqual(['createTask', 'updateTask'])
  })
})

describe('buildImportMap', () => {
  it('解析命名导入 → 模块路径', () => {
    const source = sf(`
      import { TaskRepository } from '@/domains/tasks/repository/task'
      import { IntentionRepository } from '@/lib/db/repositories/intention.repository'
    `)
    const map = buildImportMap(source)
    expect(map.get('TaskRepository')).toBe('@/domains/tasks/repository/task')
    expect(map.get('IntentionRepository')).toBe('@/lib/db/repositories/intention.repository')
  })
})

describe('buildReceiverMap', () => {
  it('识别 new XxxRepository() → repo', () => {
    const source = sf(`
      export async function f() {
        const repo = new TaskRepository()
      }
    `)
    const fn = source.statements[0] as ts.FunctionDeclaration
    const map = buildReceiverMap(fn)
    expect(map.get('repo')?.kind).toBe('repo')
    expect(map.get('repo')?.className).toBe('TaskRepository')
  })

  it('识别 createXxxMutationService() → mutationService', () => {
    const source = sf(`
      export async function f() {
        const service = createTasksMutationService()
      }
    `)
    const fn = source.statements[0] as ts.FunctionDeclaration
    expect(buildReceiverMap(fn).get('service')?.kind).toBe('mutationService')
  })

  it('识别参数 : TaskRepository → repo', () => {
    const source = sf(`
      export async function f(repo: TaskRepository) {}
    `)
    const fn = source.statements[0] as ts.FunctionDeclaration
    expect(buildReceiverMap(fn).get('repo')?.kind).toBe('repo')
  })

  it('识别 await getXxxMutationService() → mutationService', () => {
    const source = sf(`
      export async function f() {
        const service = await getHabitsMutationService()
      }
    `)
    const fn = source.statements[0] as ts.FunctionDeclaration
    expect(buildReceiverMap(fn).get('service')?.kind).toBe('mutationService')
  })

  it('非 repo/service 变量 → 不入表', () => {
    const source = sf(`
      export async function f() {
        const x = 123
        const name = 'abc'
      }
    `)
    const fn = source.statements[0] as ts.FunctionDeclaration
    expect(buildReceiverMap(fn).has('x')).toBe(false)
    expect(buildReceiverMap(fn).has('name')).toBe(false)
  })
})

const ACTIONS = '/actions'

describe('isBusinessFactRepo（目录判据）', () => {
  it('domains/ import → 业务事实（true）', () => {
    expect(isBusinessFactRepo('TaskRepository', '@/domains/tasks/repository/task')).toBe(true)
  })
  it('lib/db import → 系统记录（false）', () => {
    expect(isBusinessFactRepo('IntentionRepository', '@/lib/db/repositories/intention.repository')).toBe(false)
    expect(isBusinessFactRepo('AISessionRepository', '@/lib/db/repositories/session.repository')).toBe(false)
  })
  it('无 import 信息 → 保守 true', () => {
    expect(isBusinessFactRepo('TaskRepository', undefined)).toBe(true)
  })
})

describe('analyzeSourceFile', () => {
  it('业务事实 repo 裸写 → 报 write-entry-bypass', () => {
    const code = `
      import { TaskRepository } from '@/domains/tasks/repository/task'
      export async function createTask() {
        const repo = new TaskRepository()
        await repo.save({ title: 'x' } as any)
      }
    `
    const diags = analyzeSourceFile('/actions/tasks.ts', code, new Set(), ACTIONS)
    expect(diags).toHaveLength(1)
    expect(diags[0].rule).toBe('write-entry-bypass')
    expect(diags[0].message).toContain('repo.save')
  })

  it('系统记录 repo（lib/db）裸写 → 不报', () => {
    const code = `
      import { IntentionRepository } from '@/lib/db/repositories/intention.repository'
      export async function saveIntention() {
        const repo = new IntentionRepository()
        await repo.save({} as any)
      }
    `
    expect(analyzeSourceFile('/actions/intent.ts', code, new Set(), ACTIONS)).toHaveLength(0)
  })

  it('经 mutationService.execute → 不报', () => {
    const code = `
      import { createTasksMutationService } from './tasks/mutation-service'
      export async function promoteToThread() {
        const service = createTasksMutationService()
        await service.execute({ steps: [] } as any)
      }
    `
    expect(analyzeSourceFile('/actions/tasks.ts', code, new Set(), ACTIONS)).toHaveLength(0)
  })

  it('经 mutationService.update → 不报（update 歧义消解）', () => {
    const code = `
      import { createTasksMutationService } from './tasks/mutation-service'
      export async function updateField() {
        const service = createTasksMutationService()
        await service.update({} as any)
      }
    `
    expect(analyzeSourceFile('/actions/tasks.ts', code, new Set(), ACTIONS)).toHaveLength(0)
  })

  it('经 orchestrator.executeIntent → 不报', () => {
    const code = `
      import { getOrchestrator } from '@/nexus/orchestrator'
      export async function changeStatus() {
        const orchestrator = getOrchestrator()
        await orchestrator.executeIntent({} as any, 'user1')
      }
    `
    expect(analyzeSourceFile('/actions/okr.ts', code, new Set(), ACTIONS)).toHaveLength(0)
  })

  it('update 歧义：同函数 mutationService.update(合规) + repo.update(违规) → 只报后者', () => {
    const code = `
      import { TaskRepository } from '@/domains/tasks/repository/task'
      import { createTasksMutationService } from './tasks/mutation-service'
      export async function mixed() {
        const service = createTasksMutationService()
        await service.update({} as any)
        const repo = new TaskRepository()
        await repo.update('id', {} as any)
      }
    `
    const diags = analyzeSourceFile('/actions/tasks.ts', code, new Set(), ACTIONS)
    expect(diags).toHaveLength(1)
    expect(diags[0].message).toContain('repo.update')
  })

  it('豁免文件（okr.ts）→ 不报', () => {
    const code = `
      import { ObjectiveRepository } from '@/domains/okrs/repository/objective'
      export async function updateObjective() {
        const repo = new ObjectiveRepository()
        await repo.save({} as any)
      }
    `
    expect(analyzeSourceFile('/actions/okr.ts', code, new Set(['okr.ts']), ACTIONS)).toHaveLength(0)
  })

  it('读方法（findById）不触发（不在 WRITE_METHODS）', () => {
    const code = `
      import { TaskRepository } from '@/domains/tasks/repository/task'
      export async function getTask() {
        const repo = new TaskRepository()
        await repo.findById('id')
      }
    `
    expect(analyzeSourceFile('/actions/tasks.ts', code, new Set(), ACTIONS)).toHaveLength(0)
  })
})

// ─── checkRulesRegistry 测试 ───────────────────────────────────

/** 创建临时 domains 目录 */
function tmpDomains(): string {
  return fs.mkdtempSync(ppath.join(os.tmpdir(), 'domains-'))
}

/** 在临时目录创建一个域（可选 manifest.yaml + rules-registry.ts） */
function writeDomain(dir: string, name: string, withRegistry: boolean) {
  fs.mkdirSync(ppath.join(dir, name))
  fs.writeFileSync(ppath.join(dir, name, 'manifest.yaml'), `id: ${name}`)
  if (withRegistry) {
    fs.writeFileSync(ppath.join(dir, name, 'rules-registry.ts'), 'export {}')
  }
}

describe('checkRulesRegistry', () => {
  it('有 manifest 无 registry 且未豁免 → 报 rules-registry-missing', () => {
    const dir = tmpDomains()
    writeDomain(dir, 'mydomain', false)
    const diags = checkRulesRegistry(dir, new Set())
    expect(diags).toHaveLength(1)
    expect(diags[0].rule).toBe('rules-registry-missing')
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('有 registry → 不报', () => {
    const dir = tmpDomains()
    writeDomain(dir, 'tasks', true)
    expect(checkRulesRegistry(dir, new Set())).toHaveLength(0)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('豁免域 → 不报', () => {
    const dir = tmpDomains()
    writeDomain(dir, 'okrs', false)
    expect(checkRulesRegistry(dir, new Set(['okrs']))).toHaveLength(0)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('跳过 _ 前缀目录（fixture）', () => {
    const dir = tmpDomains()
    writeDomain(dir, '_fixture', false)
    expect(checkRulesRegistry(dir, new Set())).toHaveLength(0)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('跳过无 manifest 的目录', () => {
    const dir = tmpDomains()
    fs.mkdirSync(ppath.join(dir, 'notadomain'))
    expect(checkRulesRegistry(dir, new Set())).toHaveLength(0)
    fs.rmSync(dir, { recursive: true, force: true })
  })
})

// ─── 集成测试：真实 src/app/actions/ ─────────────────────────────

import { collectActionFiles, WRITE_ENTRY_EXEMPTIONS } from '../validate-domain-structure'

const FRONTEND = ppath.resolve(__dirname, '..', '..')
const REAL_ACTIONS = ppath.join(FRONTEND, 'src', 'app', 'actions')

describe('integration: 真实 src/app/actions/', () => {
  const files = collectActionFiles(REAL_ACTIONS)

  it('收集到关键入口文件', () => {
    const names = files.map(f => ppath.relative(REAL_ACTIONS, f))
    expect(names).toContain('tasks.ts')
    expect(names).toContain('okr.ts')
    expect(names).toContain('intent.ts')
    expect(names).toContain('session.ts')
    expect(names).toContain('tasks/mutation-service.ts')
  })

  it('排除 __tests__ 与 .test.ts', () => {
    const names = files.map(f => ppath.relative(REAL_ACTIONS, f))
    expect(names.some(n => n.includes('__tests__'))).toBe(false)
    expect(names.some(n => n.endsWith('.test.ts'))).toBe(false)
  })

  it('SC-1: 默认豁免下零 error（tasks/habits 合规、intention/session 系统记录不报）', () => {
    const exemptSet = new Set(WRITE_ENTRY_EXEMPTIONS.map(e => e.file))
    const diags = files.flatMap(f =>
      analyzeSourceFile(f, fs.readFileSync(f, 'utf-8'), exemptSet, REAL_ACTIONS),
    )
    const errors = diags.filter(d => d.level === 'error')
    expect(errors).toEqual([])
  })

  it('SC-2: 取消 okr 豁免 → 抓 okr.ts 的 write-entry-bypass', () => {
    const diags = files.flatMap(f =>
      analyzeSourceFile(f, fs.readFileSync(f, 'utf-8'), new Set(), REAL_ACTIONS),
    )
    const okrBypass = diags.filter(d => d.file === 'okr.ts' && d.rule === 'write-entry-bypass')
    expect(okrBypass.length).toBeGreaterThan(0)
  })
})

// ─── L4-1: checkCnuiFormAdapter 测试 ────────────────────────────

describe('findCnuiFormAdapterUsage（L4-1 纯函数）', () => {
  it('import cnui-form-adapter → 命中', () => {
    const source = sf(`import { CnuiFormAdapter } from '@/components/cnui/cnui-form-adapter'`)
    expect(findCnuiFormAdapterUsage(source)).not.toBeNull()
  })
  it('JSX 标识符 CnuiFormAdapter → 命中', () => {
    const source = sf(`const x = <CnuiFormAdapter domainId="habits" />`)
    expect(findCnuiFormAdapterUsage(source)).not.toBeNull()
  })
  it('无引用 → null', () => {
    const source = sf(`import { HabitForm } from '@/domains/habits/components/habit-form'`)
    expect(findCnuiFormAdapterUsage(source)).toBeNull()
  })
})

// ─── L7-2: checkFormRegistryResidual 测试 ──────────────────────

describe('findFormRegistryRegisterCall（L7-2 纯函数）', () => {
  it('FormRegistry.register( 调用 → 命中', () => {
    const source = sf(`FormRegistry.register('habits', 'createHabit', {} as any)`)
    expect(findFormRegistryRegisterCall(source)).not.toBeNull()
  })
  it('FormRegistry.get( 不命中（仅禁 register）', () => {
    const source = sf(`const c = FormRegistry.get('habits', 'createHabit')`)
    expect(findFormRegistryRegisterCall(source)).toBeNull()
  })
  it('无 FormRegistry → null', () => {
    const source = sf(`const x = otherRegistry.register('a')`)
    expect(findFormRegistryRegisterCall(source)).toBeNull()
  })
})

describe('checkFormRegistryResidual（L7-2 文件系统）', () => {
  it('存在 register-form.ts 文件 → 报 form-registry-residual', () => {
    const dir = fs.mkdtempSync(ppath.join(os.tmpdir(), 'src-'))
    fs.mkdirSync(ppath.join(dir, 'domains', 'habits'), { recursive: true })
    fs.writeFileSync(ppath.join(dir, 'domains', 'habits', 'register-form.ts'), 'export {}')
    const diags = checkFormRegistryResidual(dir)
    expect(diags).toHaveLength(1)
    expect(diags[0].rule).toBe('form-registry-residual')
    expect(diags[0].file).toContain('register-form.ts')
    fs.rmSync(dir, { recursive: true, force: true })
  })
  it('含 FormRegistry.register 调用的域文件 → 报', () => {
    const dir = fs.mkdtempSync(ppath.join(os.tmpdir(), 'src-'))
    fs.mkdirSync(ppath.join(dir, 'domains', 'habits'), { recursive: true })
    fs.writeFileSync(
      ppath.join(dir, 'domains', 'habits', 'foo.ts'),
      `FormRegistry.register('habits', 'createHabit', {} as any)`,
    )
    const diags = checkFormRegistryResidual(dir)
    expect(diags).toHaveLength(1)
    expect(diags[0].rule).toBe('form-registry-residual')
    fs.rmSync(dir, { recursive: true, force: true })
  })
  it('干净域 → 零诊断', () => {
    const dir = fs.mkdtempSync(ppath.join(os.tmpdir(), 'src-'))
    fs.mkdirSync(ppath.join(dir, 'domains', 'tasks'), { recursive: true })
    fs.writeFileSync(ppath.join(dir, 'domains', 'tasks', 'surface.ts'), 'export const x = 1')
    expect(checkFormRegistryResidual(dir)).toEqual([])
    fs.rmSync(dir, { recursive: true, force: true })
  })
})

// ─── 集成测试：[019.1] L4-1/L7-2 真实 src 扫描 ────────────────────

const REAL_SRC = ppath.join(FRONTEND, 'src')

describe('integration: [019.1] L4-1/L7-2 真实 src 零残留', () => {
  it('L4-1: src/** 无 CnuiFormAdapter 残留', () => {
    expect(checkCnuiFormAdapter(REAL_SRC)).toEqual([])
  })
  it('L7-2: src/domains/** 无 FormRegistry.register / register-form.ts 残留', () => {
    expect(checkFormRegistryResidual(REAL_SRC)).toEqual([])
  })
})
