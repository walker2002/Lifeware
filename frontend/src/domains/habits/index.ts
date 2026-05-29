// Habits Domain Plugin — 入口文件
// 遵循 Constitution Principle VI: 纯粹被动组件

import type { DomainPlugin } from '@/usom/types/process'
import { loadDomainManifest } from '@/domains/manifest-loader'
import { createDomainPlugin } from '@/domains/plugin-factory'
import { createHabitsHooks } from './hooks'
import './register-form'

// ── CNUI Surface 组件导入 ─────────────────────────────────────────
import { HabitActionPanel } from './cnui/surfaces/HabitActionPanel'
import { HabitCheckinPanel } from './cnui/surfaces/HabitCheckinPanel'
import { HabitCreationCard } from './cnui/surfaces/HabitCreationCard'
import { HabitListCard } from './cnui/surfaces/HabitListCard'

// ── CNUI Surface 注册 ────────────────────────────────────────
import { cnuiRegistry } from '@/nexus/ai-runtime/cnui/registry'
import { habitCnuiHandler } from './cnui/handlers'

cnuiRegistry.register('habits', 'habit-action-panel', {
  component: HabitActionPanel,
  handler: habitCnuiHandler,
})
cnuiRegistry.register('habits', 'habit-checkin-panel', {
  component: HabitCheckinPanel,
  handler: habitCnuiHandler,
})
cnuiRegistry.register('habits', 'habit-creation-card', {
  component: HabitCreationCard,
  handler: habitCnuiHandler,
})
cnuiRegistry.register('habits', 'habit-list-card', {
  component: HabitListCard,
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
