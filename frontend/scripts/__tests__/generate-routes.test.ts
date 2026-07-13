/**
 * @file generate-routes.test
 * @brief codegen 工具单测（kebab→PascalCase / export_name / page_props async 生成）
 */
import { describe, it, expect } from 'vitest'
import { generateRouteFileContent, extractComponentName } from '../generate-routes'
import type { RouteEntry } from '../generate-routes'

describe('extractComponentName', () => {
  it('kebab-case 转 PascalCase', () => {
    expect(extractComponentName('domains/timebox/components/timeboxes-workspace')).toBe('TimeboxesWorkspace')
    expect(extractComponentName('domains/timebox/components/appointment-page')).toBe('AppointmentPage')
  })
  it('已 PascalCase 名字（无连字符）不受影响', () => {
    expect(extractComponentName('domains/habits/pages/HabitListPage')).toBe('HabitListPage')
  })
})

describe('generateRouteFileContent', () => {
  const base = (over: Partial<RouteEntry>): RouteEntry => ({
    domainId: 'timebox',
    action: 'view',
    component: 'domains/timebox/components/c',
    url: '/u',
    ...over,
  })

  it('默认同步模板（无 page_props）：kebab 文件名正确解析组件名', () => {
    const out = generateRouteFileContent(
      base({ component: 'domains/timebox/components/timeboxes-workspace' }),
    )
    expect(out).toContain('import { TimeboxesWorkspace } from "@/domains/timebox/components/timeboxes-workspace"')
    expect(out).toMatch(/export default function TimeboxesWorkspacePage\(\)/)
    expect(out).toContain('<TimeboxesWorkspace />')
  })

  it('export_name 覆盖组件绑定名（OKRWorkspace 缩写）', () => {
    const out = generateRouteFileContent(
      base({
        component: 'domains/okrs/components/okr-workspace',
        exportName: 'OKRWorkspace',
      }),
    )
    expect(out).toContain('import { OKRWorkspace }')
    expect(out).toMatch(/export default function OKRWorkspacePage\(\)/)
    expect(out).toContain('<OKRWorkspace />')
  })

  it('page_props 含 searchParams → 生成 async + searchParams 解包', () => {
    const out = generateRouteFileContent(
      base({
        component: 'domains/okrs/components/okr-workspace',
        exportName: 'OKRWorkspace',
        pageProps: {
          standalone: true,
          initialDetailId: { from: 'searchParams', key: 'detail' },
        },
      }),
    )
    expect(out).toMatch(/export default async function OKRWorkspacePage\(/)
    expect(out).toContain('Promise<Record<string, string | string[] | undefined>>')
    expect(out).toContain('const sp = await searchParams')
    expect(out).toContain('standalone={true}')
    expect(out).toContain('initialDetailId={sp.detail}')
  })

  it('page_props 仅字面值（无 searchParams）→ 同步模板 + 字面 prop', () => {
    const out = generateRouteFileContent(
      base({
        component: 'domains/x/components/foo',
        pageProps: { mode: 'create' },
      }),
    )
    expect(out).toMatch(/export default function FooPage\(\)/)
    expect(out).toContain('mode={"create"}')
    expect(out).not.toContain('searchParams')
  })
})
