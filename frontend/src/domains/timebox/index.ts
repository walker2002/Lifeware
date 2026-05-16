// Timebox Domain Plugin — 入口文件
// 遵循 Constitution Principle VI: 纯粹被动组件

import type { DomainPlugin, DomainManifest } from '@/usom/types/process'
import { onValidate, onEvent, onActionSurfaceRequest } from './hooks'

const timeboxManifest: DomainManifest = {
  domainId: 'timebox',
  version: '1.0.0',
  requiredFields: ['title', 'startTime', 'duration'],
  subscribedEvents: [
    'TimeboxCreated',
    'TimeboxStarted',
    'TimeboxOvertime',
    'TimeboxEnded',
    'TimeboxCancelled',
    'TimeboxLogged',
  ],
}

export const timeboxPlugin: DomainPlugin = {
  manifest: timeboxManifest,
  onValidate,
  onEvent,
  onActionSurfaceRequest,
}

export { onValidate, onEvent, onActionSurfaceRequest } from './hooks'
export { timeboxTransitions, findTransition } from './transitions'
