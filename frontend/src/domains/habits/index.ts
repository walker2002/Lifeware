// Habits Domain Plugin — 入口文件
// 遵循 Constitution Principle VI: 纯粹被动组件

import type { DomainPlugin } from '@/usom/types/process'
import { loadDomainManifest } from '@/domains/manifest-loader'
import { createDomainPlugin } from '@/domains/plugin-factory'
import { createHabitsHooks } from './hooks'
import './register-form'

// ── CNUI Surface 注册 ────────────────────────────────────────
import { cnuiRegistry } from '@/nexus/ai-runtime/cnui/registry'
import { habitCnuiHandler } from './cnui/handlers'

cnuiRegistry.register('habits', 'habit-action-panel', {
  component: require('./cnui/surfaces/HabitActionPanel').HabitActionPanel,
  handler: habitCnuiHandler,
})
cnuiRegistry.register('habits', 'habit-checkin-panel', {
  component: require('./cnui/surfaces/HabitCheckinPanel').HabitCheckinPanel,
  handler: habitCnuiHandler,
})
cnuiRegistry.register('habits', 'habit-creation-card', {
  component: require('./cnui/surfaces/HabitCreationCard').HabitCreationCard,
  handler: habitCnuiHandler,
})
cnuiRegistry.register('habits', 'habit-list-card', {
  component: require('./cnui/surfaces/HabitListCard').HabitListCard,
  handler: habitCnuiHandler,
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
