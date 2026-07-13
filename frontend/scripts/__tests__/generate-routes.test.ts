/**
 * @file generate-routes.test
 * @brief codegen 工具单测（组件名/导出形式/page_props 验证与 ESM 入口守卫）
 */
import { describe, it, expect, vi } from 'vitest'
import { generateRouteFileContent, extractComponentName, validateRoutes } from '../generate-routes'
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

  it('默认同步模板（无 page_props）：kebab 文件名正确解析组件名，函数名去重加 Default 避免 import 冲突', () => {
    const out = generateRouteFileContent(
      base({ component: 'domains/timebox/components/timeboxes-workspace' }),
    )
    expect(out).toContain('import { TimeboxesWorkspace } from "@/domains/timebox/components/timeboxes-workspace"')
    // [pre-land-fix] 组件名 ends with Workspace → 复用 import 名 + Default 后缀避免 TS2440
    expect(out).toMatch(/export default function TimeboxesWorkspaceDefault\(\)/)
    expect(out).not.toMatch(/export default function TimeboxesWorkspace\(\)/)
    expect(out).not.toMatch(/export default function TimeboxesWorkspacePage\(\)/)
    expect(out).toContain('<TimeboxesWorkspace />')
  })

  it('export_name 覆盖组件绑定名（OKRWorkspace 缩写，endsWith Workspace → 加 Default）', () => {
    const out = generateRouteFileContent(
      base({
        component: 'domains/okrs/components/okr-workspace',
        exportName: 'OKRWorkspace',
      }),
    )
    expect(out).toContain('import { OKRWorkspace }')
    expect(out).toMatch(/export default function OKRWorkspaceDefault\(\)/)
    expect(out).not.toMatch(/export default function OKRWorkspace\(\)/)
    expect(out).not.toMatch(/export default function OKRWorkspacePage\(\)/)
    expect(out).toContain('<OKRWorkspace />')
  })

  it('page_props 含 searchParams → 生成 async + searchParams 解包（fnName 去重）', () => {
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
    expect(out).toMatch(/export default async function OKRWorkspaceDefault\(/)
    expect(out).not.toMatch(/export default async function OKRWorkspace\(/)
    expect(out).not.toMatch(/export default async function OKRWorkspacePage\(/)
    expect(out).toContain('Promise<Record<string, string | string[] | undefined>>')
    expect(out).toContain('const sp = await searchParams')
    expect(out).toContain('standalone={true}')
    expect(out).toContain('initialDetailId={sp.detail}')
  })

  it('page_props 仅字面值（无 searchParams）→ 同步模板 + 字面 prop（fnName 去重）', () => {
    const out = generateRouteFileContent(
      base({
        component: 'domains/x/components/foo',
        pageProps: { mode: 'create' },
      }),
    )
    // foo 不结尾于 Page/Route/Workspace/Component → 追加 Page
    expect(out).toMatch(/export default function FooPage\(\)/)
    expect(out).toContain('mode={"create"}')
    expect(out).not.toContain('searchParams')
  })

  /**
   * [pre-land-fix] 函数名去重：以 Page/Route/Component 结尾的 componentName 不再
   * 重复追加 Page（避免 `ActivityArchetypesPagePage` / `TaskTreePagePage`）。
   * 为避免 TS2440（同名 import + 本地 function 冲突），本地 function 改用
   * `<Name>Default` 后缀（仅当 fnName 撞上 componentName 时）。
   */
  describe('函数名去重', () => {
    it('componentName endsWith Page → import 复用 + 本地 fnName + Default', () => {
      const out = generateRouteFileContent(
        base({
          component: 'domains/habits/pages/HabitListPage',
          exportName: 'HabitListPage',
        }),
      )
      expect(out).toMatch(/export default function HabitListPageDefault\(\)/)
      expect(out).not.toMatch(/export default function HabitListPagePage\(\)/)
      // import 仍是 HabitListPage（不发生 alias）
      expect(out).toContain('import { HabitListPage }')
    })

    it('componentName endsWith Page（PascalCase 别名 export_name）→ + Default', () => {
      // 等同于 TaskTreePage（export_name 与 file PascalCase 一致），kebab→PascalCase
      // 同样得到 `TaskTreePage`。
      const out = generateRouteFileContent(
        base({
          component: 'domains/tasks/pages/TaskTreePage',
          exportName: 'TaskTreePage',
        }),
      )
      expect(out).toMatch(/export default function TaskTreePageDefault\(\)/)
      expect(out).not.toMatch(/export default function TaskTreePagePage\(\)/)
    })

    it('componentName endsWith Route → 复用 + Default', () => {
      const out = generateRouteFileContent(
        base({
          component: 'domains/timebox/components/appointment-route',
          exportName: 'AppointmentRoute',
        }),
      )
      expect(out).toMatch(/export default function AppointmentRouteDefault\(\)/)
      expect(out).not.toMatch(/export default function AppointmentRoutePage\(\)/)
    })

    it('componentName endsWith Component → 复用 + Default', () => {
      const out = generateRouteFileContent(
        base({
          component: 'domains/x/components/widget-component',
          exportName: 'WidgetComponent',
        }),
      )
      expect(out).toMatch(/export default function WidgetComponentDefault\(\)/)
      expect(out).not.toMatch(/export default function WidgetComponentPage\(\)/)
    })

    it('componentName 不以后缀结尾 → 追加 Page（不冲突）', () => {
      const out = generateRouteFileContent(
        base({
          component: 'domains/x/components/foo',
          exportName: 'Foo',
        }),
      )
      expect(out).toMatch(/export default function FooPage\(\)/)
    })
  })

  /**
   * [page-thin] T7-fix：检测组件文件用 `export default` 时，
   * 应生成无花括号的默认导入。
   * 仓库内真实存在的 default-export 组件：`domains/tasks/pages/TaskTreePage.tsx`（line 47）。
   * generate-routes 读 `PROJECT_ROOT/src/<component>.tsx`，直接把这条
   * 路径喂给 generateRouteFileContent 即可触发 detectDefaultExport 命中。
   */
  describe('default-export 检测', () => {
    it('组件用 export default → 生成默认导入（无花括号）', () => {
      const out = generateRouteFileContent(
        base({
          component: 'domains/tasks/pages/TaskTreePage',
          exportName: 'TaskTreePage',
        }),
      )
      // 默认导入：无花括号
      expect(out).toContain('import TaskTreePage from "@/domains/tasks/pages/TaskTreePage"')
      // 反向断言：确保没有把文件错误地当成命名导出
      expect(out).not.toContain('import { TaskTreePage }')
      // 默认导入的 binding 在 JSX 中用法相同
      expect(out).toContain('<TaskTreePage />')
    })

    it('文件不存在 → 走命名导出 fallback（与历史行为一致）', () => {
      const out = generateRouteFileContent(
        base({
          component: 'domains/widget/components/missing-export',
          exportName: 'MissingExport',
        }),
      )
      expect(out).toContain('import { MissingExport } from "@/domains/widget/components/missing-export"')
      expect(out).not.toContain('import MissingExport ')
    })

    it('组件用命名导出 → 走花括号命名导入', () => {
      // OKRWorkspace 用 `export function OKRWorkspace(...)`，是命名导出。
      const out = generateRouteFileContent(
        base({
          component: 'domains/okrs/components/okr-workspace',
          exportName: 'OKRWorkspace',
        }),
      )
      expect(out).toContain('import { OKRWorkspace } from "@/domains/okrs/components/okr-workspace"')
      expect(out).not.toMatch(/^import OKRWorkspace /m)
    })
  })
})

describe('validateRoutes', () => {
  const base = (pageProps: Record<string, unknown>, url = '/timeboxes'): RouteEntry => ({
    domainId: 'timebox',
    action: 'viewTimeboxes',
    component: 'domains/timebox/components/timeboxes-workspace',
    url,
    pageProps,
  })

  it.each([
    ['缺少 key', { initialId: { from: 'searchParams' } }],
    ['key 为空字符串', { initialId: { from: 'searchParams', key: '' } }],
    ['from 值未知', { initialId: { from: 'query', key: 'id' } }],
  ])('拒绝 page_props searchParams 结构非法：%s', async (_label, pageProps) => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(validateRoutes([base(pageProps)])).rejects.toThrow('Route validation failed')
  })

  /**
   * [pre-land-fix] URL 格式 + 冲突：
   * - url 不以 `/` 开头 → 拒绝
   * - 同 url 出现两次 → 拒绝 + 报错含 `conflicts`
   */
  it('url 不以斜线开头 → 拒绝', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    await expect(
      validateRoutes([base({}, '-timeboxes')]),
    ).rejects.toThrow('Route validation failed')
  })

  it('两条路由同 url → 拒绝且错误信息含 conflicts', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const errorSpy = vi.spyOn(console, 'error')
    await expect(
      validateRoutes([
        base({}, '/x'),
        { ...base({}, '/x'), action: 'otherAction' },
      ]),
    ).rejects.toThrow('Route validation failed')
    // 至少一条 error 行提及 `conflicts`
    expect(
      errorSpy.mock.calls
        .map((c) => String(c[0] ?? ''))
        .join('\n'),
    ).toContain('conflicts')
  })
})

describe('模块入口守卫', () => {
  it('import generate-routes 时不调用 main', async () => {
    const log = vi.spyOn(console, 'log')
    await import('../generate-routes')
    expect(log).not.toHaveBeenCalledWith('🔧 Domain Route Generator')
  })
})
