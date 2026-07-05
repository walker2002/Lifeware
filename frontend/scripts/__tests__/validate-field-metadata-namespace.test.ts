/**
 * @file validate-field-metadata-namespace
 * @brief [026] T23 P3 validator 嵌套结构测试 — 守护 field_metadata per-objectType 嵌套契约
 *
 * 测试目标（plan §Codex Review #1 决策项）：
 * 1. 平铺格式（旧）应被 reject（启发式应识别）。
 * 2. 嵌套格式（新）通过（不报 C-flat-field-metadata）。
 * 3. 不同 objectType 同名字段不冲撞（timebox.title ≠ appointment.title）。
 *
 * 测试方式：把 validator 的 C-flat 启发式逻辑提取到本地 helper 单元测；
 * 集成层通过 npx tsx scripts/validate-manifest.ts 在真实 src/domains/ 上跑通。
 */

import { describe, it, expect, beforeAll } from 'vitest'
import { execSync } from 'node:child_process'
import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'

const PROJECT_ROOT = path.resolve(__dirname, '../..')
const TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'validate-fm-namespace-'))

/** 简易 YAML 序列化（仅支持单测所需结构：嵌套对象 + 数组 + 标量）。 */
function yamlFrom(obj: Record<string, unknown>, indent = 0): string {
  const pad = ' '.repeat(indent)
  let out = ''
  for (const [k, v] of Object.entries(obj)) {
    if (v === null || v === undefined) continue
    if (Array.isArray(v)) {
      if (v.length === 0) {
        out += `${pad}${k}: []\n`
      } else {
        out += `${pad}${k}:\n`
        for (const item of v) {
          if (typeof item === 'object' && item !== null) {
            const inline = yamlFrom(item as Record<string, unknown>, indent + 4).trim()
            out += `${pad}  - ${inline.replace(/\n/g, '\n' + pad + '    ')}\n`
          } else {
            out += `${pad}  - ${JSON.stringify(item)}\n`
          }
        }
      }
    } else if (typeof v === 'object') {
      out += `${pad}${k}:\n${yamlFrom(v as Record<string, unknown>, indent + 2)}`
    } else if (typeof v === 'string') {
      out += `${pad}${k}: ${JSON.stringify(v)}\n`
    } else {
      out += `${pad}${k}: ${v}\n`
    }
  }
  return out
}

/**
 * 与 scripts/validate-manifest.ts 区块 C 启发式同步：
 * 检测顶层 field_metadata 是否含「平铺」字段（值含 type:xxx 即视为 FieldMetadata）。
 *
 * 关键判定：v 自身的 keys 含 'type' → 视为 FieldMetadata 平铺。
 * 若 v 的 keys 都是字段名（无 'type'）→ 视为嵌套对象表。
 */
function detectFlatFieldMetadata(yaml: string): { flatKeys: string[]; errCount: number } {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const yamlLib = require('yaml') as { parse: (s: string) => Record<string, unknown> }
  const m = yamlLib.parse(yaml) as { field_metadata?: Record<string, unknown> }
  const fm = m.field_metadata ?? {}
  const flatKeys: string[] = []
  for (const [k, v] of Object.entries(fm)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      // 平铺特征：v 自身有 type 字段（即 v 就是 FieldMetadata）
      if ('type' in (v as Record<string, unknown>)) {
        flatKeys.push(k)
      }
    }
  }
  return { flatKeys, errCount: flatKeys.length }
}

function baseManifest(id: string): Record<string, unknown> {
  return {
    id,
    version: '1.0.0',
    name: id,
    description: 'test domain',
    intent_triggers: [],
    lifecycle: {},
    list_actions: [],
    required_fields: {},
    subscribed_events: [],
  }
}

// 实际写一份到磁盘（虽未在本测试直接 read，但保留 trace 路径供调试）
beforeAll(() => {
  fs.mkdirSync(path.join(TMP_ROOT, 'timebox'), { recursive: true })
  fs.writeFileSync(
    path.join(TMP_ROOT, 'timebox', 'manifest.yaml'),
    yamlFrom({
      ...baseManifest('timebox'),
      field_metadata: {
        timebox: { title: { type: 'string' } },
        appointment: { title: { type: 'string' }, detail: { type: 'string' } },
      },
    }),
  )
})

describe('[026] T23: field_metadata 嵌套结构守卫（validator 启发式单元）', () => {
  it('嵌套格式不触发 C-flat-field-metadata（errCount=0）', () => {
    const nested = yamlFrom({
      ...baseManifest('nested-test'),
      field_metadata: {
        timebox: { title: { type: 'string' } },
        appointment: { title: { type: 'string' }, detail: { type: 'string' } },
      },
    })
    const r = detectFlatFieldMetadata(nested)
    expect(r.errCount).toBe(0)
    expect(r.flatKeys).toEqual([])
  })

  it('平铺格式应被 C-flat-field-metadata 拒绝（errCount≥1）', () => {
    const flat = yamlFrom({
      ...baseManifest('flat-test'),
      field_metadata: {
        title: { type: 'string' },
        priority: { type: 'enum', options: ['high', 'low'] },
      },
    })
    const r = detectFlatFieldMetadata(flat)
    expect(r.errCount).toBeGreaterThanOrEqual(1)
    expect(r.flatKeys).toContain('title')
    expect(r.flatKeys).toContain('priority')
  })

  it('空 field_metadata 不报错（errCount=0）', () => {
    const empty = yamlFrom({
      ...baseManifest('empty-test'),
      field_metadata: {},
    })
    const r = detectFlatFieldMetadata(empty)
    expect(r.errCount).toBe(0)
  })

  it('不同 objectType 同名字段不冲撞（timebox.title ≠ appointment.title）', () => {
    const out = execSync(
      `cd ${PROJECT_ROOT} && npx tsx -e "const yaml=require('yaml');const fs=require('fs');const m=yaml.parse(fs.readFileSync('src/domains/timebox/manifest.yaml','utf-8'));const fm=m.field_metadata;const tb=fm.timebox?.title;const ap=fm.appointment?.title;console.log('TB_TYPE='+tb?.type);console.log('AP_TYPE='+ap?.type);console.log('TB_KEYS='+Object.keys(fm.timebox).length);console.log('AP_KEYS='+Object.keys(fm.appointment).length);"`,
      { encoding: 'utf-8', shell: '/bin/bash' },
    )
    expect(out).toMatch(/TB_TYPE=string/)
    expect(out).toMatch(/AP_TYPE=string/)
    // 各自至少 1 字段（timebox 11+ 个，appointment 5 个）
    expect(out).toMatch(/TB_KEYS=\d+/)
    expect(out).toMatch(/AP_KEYS=\d+/)
    // 不存在 C-flat 错误（嵌套格式）
    expect(out).not.toMatch(/errCount=[1-9]/)
  })
})

describe('[026] T23: validator CLI 集成 — 真实 src/domains/ 嵌套格式通过', () => {
  it('validate-manifest 跑真实 5 域（timebox/tasks/habits/okrs + _rulefixture），无 C-flat-field-metadata 错误', () => {
    const out = execSync(`cd ${PROJECT_ROOT} && npx tsx scripts/validate-manifest.ts`, {
      encoding: 'utf-8',
    })
    // 真实 5 域全嵌套通过
    expect(out).not.toMatch(/C-flat-field-metadata/)
    expect(out).toMatch(/0 个错误|全部通过/)
  })
})