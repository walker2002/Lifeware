// Tasks Domain Plugin — 入口文件
// 遵循 Constitution Principle VI: 纯粹被动组件

import type { DomainPlugin } from '@/usom/types/process'
import { loadDomainManifest } from '@/domains/manifest-loader'
import { createDomainPlugin } from '@/domains/plugin-factory'
import { createTasksHooks } from './hooks'

const result = loadDomainManifest('tasks')

if (!result.success) {
  for (const error of result.errors) {
    console.warn(`[manifest-loader] ${error.domainId}: ${error.message}`)
  }
}

const hooks = result.success
  ? createTasksHooks(result.manifest)
  : null as any

export const tasksPlugin: DomainPlugin = result.success
  ? createDomainPlugin(result.manifest, hooks)
  : null!

export { createTasksHooks } from './hooks'
export { taskTransitions, projectTransitions, findTransition } from './transitions'
export { ActiveTasksProvider } from './providers'
