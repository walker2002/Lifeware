/**
 * @file action-view.test
 * @brief ActionView 路由表 SSOT 守护（[026] T14 后 review 暴露 viewItineraries 缺失）
 *
 * 任何 manifest.yaml 中声明 response_type=page + view_route 的 action 都必须在
 * ActionView.VIEW_PAGE_COMPONENTS 路由表里注册对应 Component；否则 GrowthMenu /
 * slash 命令 / 快捷键点击会落到「页面未找到」占位文本。
 *
 * 本测试通过 manifest-loader 反射 SSOT 一次：列出当前所有 page-type action
 * 必须出现在 VIEW_PAGE_COMPONENTS 中。防止后续新加 page-type action 时
 * 忘更新 ActionView 路由表（manifest ↔ 路由表的双向漂移）。
 */

import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { loadDomainManifest } from '@/domains/manifest-loader'

/** 反射 src/domains 下所有域 manifest，收集 page-type action 期望集合 */
function collectPageActions(): Set<string> {
  const domainsDir = path.join(process.cwd(), 'src/domains')
  const out = new Set<string>()
  for (const entry of readdirSync(domainsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const manifestPath = path.join(domainsDir, entry.name, 'manifest.yaml')
    try {
      const r = loadDomainManifest(entry.name)
      if (!r.success) continue
      for (const t of r.manifest.intent_triggers ?? []) {
        if (t.response_type === 'page' && t.view_route) {
          out.add(`${r.manifest.id}.${t.action}`)
        }
      }
    } catch { /* skip dirs without manifest */ }
  }
  return out
}

/** 从 ActionView 源码反射路由表（避免 import 时触发 side effect） */
function extractRouteTableKeys(source: string): Set<string> {
  const re = /VIEW_PAGE_COMPONENTS\s*:\s*Record<string,\s*Record<string,\s*React\.ComponentType<any>>>\s*=\s*\{([\s\S]*?)\n\}/m
  const m = source.match(re)
  if (!m) throw new Error('VIEW_PAGE_COMPONENTS 块未在 ActionView 源码中找到')
  const body = m[1]
  const reDomain = /(\w+):\s*\{([\s\S]*?)\n\s*\},?\s*(?=\n\s*\w+:|$)/g
  const out = new Set<string>()
  let d: RegExpExecArray | null
  while ((d = reDomain.exec(body)) !== null) {
    const domain = d[1]
    const inner = d[2]
    const reKey = /(\w+):\s*\w+/g
    let k: RegExpExecArray | null
    while ((k = reKey.exec(inner)) !== null) out.add(`${domain}.${k[1]}`)
  }
  return out
}

describe('ActionView — manifest page-type action 路由守护（[026] T14 修复后）', () => {
  it('manifest.yaml 全部 response_type=page 的 action 在 VIEW_PAGE_COMPONENTS 路由表里', () => {
    // 反射 manifest SSOT
    const expected = collectPageActions()
    // 反射 ActionView 源码路由表
    const src = readFileSync(
      path.join(process.cwd(), 'src/components/views/action-view.tsx'),
      'utf-8',
    )
    const actual = extractRouteTableKeys(src)

    // 至少要覆盖 viewItineraries（[026] 核心修复点）
    expect(actual.has('timebox.viewItineraries')).toBe(true)

    // 全部 manifest page-type action 都覆盖（防御未来漂移）。
    // 排除 ActionView 内联特判的 action（viewSchedule 走特判分支而非路由表，
    // 与 VIEW_PAGE_COMPONENTS 路由表正交 — 参 action-view.tsx line ~41）。
    const INLINE_DISPATCH = new Set(['timebox.viewSchedule', 'timebox.view_schedule'])
    const missing: string[] = []
    for (const e of expected) {
      if (INLINE_DISPATCH.has(e)) continue
      if (!actual.has(e)) missing.push(e)
    }
    expect(missing, `以下 manifest page-type action 未在 ActionView 路由表注册：${missing.join(', ')}`).toEqual([])
  })
})
