/**
 * @file manifest-view-routes.test
 * @brief [page-thin] D8/6A：view_route.component 不变量（禁 app/ 前缀，防回归循环 import）
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { parse as yamlParse } from 'yaml'

const DOMAINS = join(__dirname, '..')

describe('view_route.component 不变量', () => {
  for (const d of readdirSync(DOMAINS, { withFileTypes: true })
    .filter(e => e.isDirectory() && !e.name.startsWith('_') && !e.name.startsWith('__'))) {
    const mp = join(DOMAINS, d.name, 'manifest.yaml')
    let manifest: any
    try { manifest = yamlParse(readFileSync(mp, 'utf-8')) } catch { continue }
    if (!manifest.view_routes) continue

    for (const [action, r] of Object.entries(manifest.view_routes as Record<string, any>)) {
      it(`${d.name}.${action}.component 不得指向 app/（循环 import）`, () => {
        expect(r.component).not.toMatch(/^app\//)
      })
      it(`${d.name}.${action}.component 指向 domain`, () => {
        expect(r.component).toMatch(/^domains\//)
      })
    }
  }
})
