// Timebox Domain Plugin — 入口文件
// 遵循 Constitution Principle VI: 纯粹被动组件

import type { DomainPlugin } from '@/usom/types/process'
import { loadDomainManifest } from '@/domains/manifest-loader'
import { createDomainPlugin } from '@/domains/plugin-factory'
import { createTimeboxHooks } from './hooks'

const result = loadDomainManifest(__dirname)

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
