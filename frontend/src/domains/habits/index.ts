// Habits Domain Plugin — 入口文件
// 遵循 Constitution Principle VI: 纯粹被动组件

import type { DomainPlugin } from '@/usom/types/process'
import { loadDomainManifest } from '@/domains/manifest-loader'
import { createDomainPlugin } from '@/domains/plugin-factory'
import { createHabitsHooks } from './hooks'

const result = loadDomainManifest(__dirname)

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
