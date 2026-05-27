// Habits Domain Plugin — 入口文件
// 遵循 Constitution Principle VI: 纯粹被动组件

import type { DomainPlugin } from '@/usom/types/process'
import { loadDomainManifest } from '@/domains/manifest-loader'
import { createDomainPlugin } from '@/domains/plugin-factory'
import { createHabitsHooks } from './hooks'
import { HabitForm } from './components/habit-form'
import { FormRegistry } from '@/lib/form-registry'

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

// ─── CN-UI Form 适配器注册 ──────────────────────────────────────
FormRegistry.register('habits', 'createHabit', {
  component: HabitForm as any,
  fieldMapping: {
    name: 'title',
    defaultTime: 'defaultTime',
    defaultDuration: 'defaultDuration',
    frequencyType: 'frequencyType',
    trackable: 'trackable',
  },
  defaults: {
    defaultDuration: 30,
    trackable: true,
    frequencyType: 'daily',
  },
})
