// Habits Domain Plugin — 入口文件
// 遵循 Constitution Principle VI: 纯粹被动组件

import type { DomainPlugin, DomainManifest } from '@/usom/types/process'
import { onValidate, onEvent, onActionSurfaceRequest } from './hooks'

const habitsManifest: DomainManifest = {
  domainId: 'habits',
  version: '1.0.0',
  requiredFields: ['title', 'defaultTime', 'defaultDuration', 'trackable'],
  subscribedEvents: [
    'HabitCreated',
    'HabitActivated',
    'HabitSuspended',
    'HabitArchived',
    'HabitLogged',
    'HabitSkipped',
    'HabitStreakMilestone',
  ],
}

export const habitsPlugin: DomainPlugin = {
  manifest: habitsManifest,
  onValidate,
  onEvent,
  onActionSurfaceRequest,
}

export { onValidate, onEvent, onActionSurfaceRequest } from './hooks'
export { habitTransitions, findTransition } from './transitions'
