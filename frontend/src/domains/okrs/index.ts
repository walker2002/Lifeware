// OKR Domain Plugin — 入口文件
// 遵循 Constitution Principle VI: 纯粹被动组件

import type { DomainPlugin } from '@/usom/types/process'
import { loadDomainManifest } from '@/domains/manifest-loader'
import { createDomainPlugin } from '@/domains/plugin-factory'
import { createOkrsHooks } from './hooks'

const result = loadDomainManifest('okrs')

if (!result.success) {
  for (const error of result.errors) {
    console.warn(`[manifest-loader] ${error.domainId}: ${error.message}`)
  }
}

const hooks = result.success
  ? createOkrsHooks(result.manifest)
  : null as any

export const okrsPlugin: DomainPlugin = result.success
  ? createDomainPlugin(result.manifest, hooks)
  : null!

export { createOkrsHooks } from './hooks'
export { objectiveTransitions, keyResultTransitions, findTransition } from './transitions'
