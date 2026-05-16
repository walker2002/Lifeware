// OKR Domain Plugin — 入口文件
// 遵循 Constitution Principle VI: 纯粹被动组件

import type { DomainPlugin, DomainManifest } from '@/usom/types/process'
import { onValidate, onEvent, onActionSurfaceRequest } from './hooks'

const okrsManifest: DomainManifest = {
  domainId: 'okrs',
  version: '1.0.0',
  requiredFields: ['title'],
  subscribedEvents: [
    'ObjectiveCreated',
    'ObjectiveActivated',
    'ObjectivePaused',
    'ObjectiveResumed',
    'ObjectiveCompleted',
    'ObjectiveDiscarded',
    'ObjectiveArchived',
    'KeyResultUpdated',
    'KeyResultCompleted',
    'KeyResultProgressUpdated',
    'TaskCompleted',
    'HabitLogged',
  ],
}

export const okrsPlugin: DomainPlugin = {
  manifest: okrsManifest,
  onValidate,
  onEvent,
  onActionSurfaceRequest,
}

export { onValidate, onEvent, onActionSurfaceRequest } from './hooks'
export { objectiveTransitions, keyResultTransitions, findTransition } from './transitions'
