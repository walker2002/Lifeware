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
  // SAFETY: HabitFormFields 是 Record<string, unknown> 的子类型，
  // 但 TypeScript 函数参数逆变导致类型不兼容。运行时安全。
  component: HabitForm as any,
  fieldMapping: {
    name: 'title',
    description: 'description',
    defaultTime: 'defaultTime',
    earliestTime: 'earliestTime',
    latestStartTime: 'latestStartTime',
    defaultDuration: 'defaultDuration',
    minDuration: 'minDuration',
    trackable: 'trackable',
    frequencyType: 'frequencyType',
    daysOfWeek: 'daysOfWeek',
    startDate: 'startDate',
    endDate: 'endDate',
  },
  defaults: {
    defaultTime: '07:00',
    earliestTime: '06:30',
    latestStartTime: '08:00',
    defaultDuration: 30,
    minDuration: 15,
    trackable: true,
    frequencyType: 'daily',
    daysOfWeek: [1, 2, 3, 4, 5],
  },
})
