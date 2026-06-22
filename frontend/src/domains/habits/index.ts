/**
 * @file index
 * @brief Habits 域插件入口文件
 * 
 * 遵循 Constitution Principle VI: 纯粹被动组件
 * 负责注册 CNUI Surface 组件、加载域 manifest 并创建域插件
 */

import type { DomainPlugin } from '@/usom/types/process'
import { loadDomainManifest } from '@/domains/manifest-loader'
import { createDomainPlugin } from '@/domains/plugin-factory'
import { createHabitsHooks } from './hooks'

// ── CNUI Surface 组件导入 ─────────────────────────────────────────
import { HabitActionPanel } from './cnui/surfaces/HabitActionPanel'
import { HabitCheckinPanel } from './cnui/surfaces/HabitCheckinPanel'
import { HabitCreationCard } from './cnui/surfaces/HabitCreationCard'

// ── CNUI Surface 注册 ────────────────────────────────────────
import { cnuiRegistry } from '@/nexus/ai-runtime/cnui/registry'

// Handler 模块相对路径（运行时动态加载）
const handlerModulePath = './domains/habits/cnui/handlers'

cnuiRegistry.register('habits', 'habit-action-panel', {
  component: HabitActionPanel,
  handlerModulePath,
})
cnuiRegistry.register('habits', 'habit-checkin-panel', {
  component: HabitCheckinPanel,
  handlerModulePath,
})
cnuiRegistry.register('habits', 'habit-creation-card', {
  component: HabitCreationCard,
  handlerModulePath,
})

const result = loadDomainManifest('habits')

if (!result.success) {
  for (const error of result.errors) {
    console.warn(`[manifest-loader] ${error.domainId}: ${error.message}`)
  }
}

const hooks = result.success
  ? createHabitsHooks(result.manifest)
  : null as any

export const habitsPlugin: DomainPlugin = result.success
  ? createDomainPlugin(result.manifest, hooks)
  : null!

export { createHabitsHooks } from './hooks'
export { habitTransitions, findTransition } from './transitions'
export { PendingHabitsProvider, HabitTemplatesProvider } from './providers'
