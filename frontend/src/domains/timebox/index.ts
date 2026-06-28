/**
 * @file index
 * @brief Timebox 域插件入口文件
 * 
 * 遵循 Constitution Principle VI: 纯粹被动组件
 * 负责注册 CNUI Surface 组件、加载域 manifest 并创建域插件
 */

import type { DomainPlugin } from '@/usom/types/process'
import { loadDomainManifest } from '@/domains/manifest-loader'
import { createDomainPlugin } from '@/domains/plugin-factory'
import { createTimeboxHooks } from './hooks'

// ── CNUI Surface 注册 ────────────────────────────────────────
import { cnuiRegistry } from '@/nexus/ai-runtime/cnui/registry'
import { TimeboxList } from './cnui/surfaces/TimeboxList'

// Handler 模块相对路径（运行时动态加载）
const handlerModulePath = './domains/timebox/cnui/handlers'

cnuiRegistry.register('timebox', 'timebox-list', {
  component: TimeboxList,
  handlerModulePath,
})

const result = loadDomainManifest('timebox')

if (!result.success) {
  for (const error of result.errors) {
    console.warn(`[manifest-loader] ${error.domainId}: ${error.message}`)
  }
}

const hooks = result.success
  ? createTimeboxHooks(result.manifest)
  : null as any

export const timeboxPlugin: DomainPlugin = result.success
  ? createDomainPlugin(result.manifest, hooks)
  : null!

export { createTimeboxHooks } from './hooks'
export { timeboxTransitions, findTransition } from './transitions'
export { TimeboxProvider, EnergyCurveProvider } from './providers'
export { timeboxHandlers } from './handlers'
