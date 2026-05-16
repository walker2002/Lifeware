// Tasks Domain Plugin — 入口文件
// 遵循 Constitution Principle VI: 纯粹被动组件

import type { DomainPlugin, DomainManifest } from '@/usom/types/process'
import { onValidate, onEvent, onActionSurfaceRequest } from './hooks'

const tasksManifest: DomainManifest = {
  domainId: 'tasks',
  version: '1.1.0',
  requiredFields: ['title'],
  subscribedEvents: [
    'TimeboxStarted',
    'TimeboxEnded',
    'ProjectCreated',
    'ProjectActivated',
    'ProjectPaused',
    'ProjectResumed',
    'ProjectCompleted',
    'ProjectArchived',
    'TaskCreated',
    'TaskActivated',
    'TaskCompleted',
    'TaskArchived',
  ],
}

export const tasksPlugin: DomainPlugin = {
  manifest: tasksManifest,
  onValidate,
  onEvent,
  onActionSurfaceRequest,
}

export { onValidate, onEvent, onActionSurfaceRequest } from './hooks'
export { taskTransitions, projectTransitions, findTransition } from './transitions'
