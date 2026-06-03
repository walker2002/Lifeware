/**
 * @file index
 * @brief Tasks 域插件入口文件（重构后）
 *
 * 遵循 Constitution Principle VI: 纯粹被动组件
 * 负责注册 CNUI Surface 组件、加载域 manifest 并创建域插件
 */

import type { DomainPlugin } from '@/usom/types/process'
import { loadDomainManifest } from '@/domains/manifest-loader'
import { createDomainPlugin } from '@/domains/plugin-factory'
import { createTasksHooks } from './hooks'

// ── CNUI Surface 组件导入 ─────────────────────────────────────────
import { ThreadCreationCard } from './cnui/surfaces/ThreadCreationCard'
import { ThreadPromoteCard } from './cnui/surfaces/ThreadPromoteCard'
import { TaskCreationCard } from './cnui/surfaces/TaskCreationCard'
import { TaskEditCard } from './cnui/surfaces/TaskEditCard'
import { TaskActionPanel } from './cnui/surfaces/TaskActionPanel'
import { TaskSplitCard } from './cnui/surfaces/TaskSplitCard'

// ── CNUI Surface 注册 ────────────────────────────────────────
import { cnuiRegistry } from '@/nexus/ai-runtime/cnui/registry'

const handlerModulePath = './domains/tasks/cnui/handlers'

cnuiRegistry.register('tasks', 'thread-creation-card', {
  component: ThreadCreationCard,
  handlerModulePath,
})
cnuiRegistry.register('tasks', 'thread-promote-card', {
  component: ThreadPromoteCard,
  handlerModulePath,
})
cnuiRegistry.register('tasks', 'task-creation-card', {
  component: TaskCreationCard,
  handlerModulePath,
})
cnuiRegistry.register('tasks', 'task-edit-card', {
  component: TaskEditCard,
  handlerModulePath,
})
cnuiRegistry.register('tasks', 'task-action-panel', {
  component: TaskActionPanel,
  handlerModulePath,
})
cnuiRegistry.register('tasks', 'task-split-card', {
  component: TaskSplitCard,
  handlerModulePath,
})

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
export { taskTransitions, threadTransitions, findTransition } from './transitions'
export { ThreadRepository, TaskRepository } from './repository'
export { calculateClarity, calculateComplexity, calculateDecomposition, recalculateAITags } from './tag-calculator'
