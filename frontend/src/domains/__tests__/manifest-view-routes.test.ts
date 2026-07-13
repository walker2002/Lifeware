/**
 * @file manifest-view-routes.test
 * @brief [page-thin] D8/6A：view_route.component 不变量（禁 app/ 前缀，防回归循环 import）
 */
import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, existsSync } from 'fs'
import { join } from 'path'
import { parse as yamlParse } from 'yaml'

const DOMAINS = join(__dirname, '..')

const EXPECTED_BINDINGS = {
  habits: {
    view_list: 'domains/habits/pages/HabitListPage',
    view_statistics: 'domains/habits/pages/HabitStatisticsPage',
  },
  okrs: { okrs: 'domains/okrs/components/okr-workspace' },
  tasks: { tasks: 'domains/tasks/pages/TaskTreePage' },
  timebox: {
    configTimeboxTemplates: 'domains/timebox/components/timebox-templates-route',
    config_activity_archetypes: 'domains/timebox/config/activity-archetypes-page',
    viewAppointments: 'domains/timebox/components/appointment-route',
    viewTimeboxes: 'domains/timebox/components/timeboxes-workspace',
  },
}

const actualBindings: Record<string, Record<string, string>> = {}

describe('view_route.component 不变量', () => {
  for (const d of readdirSync(DOMAINS, { withFileTypes: true })
    .filter(e => e.isDirectory() && !e.name.startsWith('_') && !e.name.startsWith('__'))) {
    const mp = join(DOMAINS, d.name, 'manifest.yaml')
    if (!existsSync(mp)) continue
    const manifest: any = yamlParse(readFileSync(mp, 'utf-8'))
    if (!manifest.view_routes) continue

    const routes = manifest.view_routes as Record<string, { component: string }>
    actualBindings[d.name] = Object.fromEntries(
      Object.entries(routes).map(([action, route]) => [action, route.component]),
    )

    for (const [action, r] of Object.entries(routes)) {
      it(`${d.name}.${action}.component 不得指向 app/（循环 import）`, () => {
        expect(r.component).not.toMatch(/^app\//)
      })
      it(`${d.name}.${action}.component 指向 domain`, () => {
        expect(r.component).toMatch(/^domains\//)
      })
    }
  }

  it('manifest view_routes 绑定集合与预期完全一致', () => {
    expect(actualBindings).toEqual(EXPECTED_BINDINGS)
  })
})
