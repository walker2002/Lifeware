import { TimeboxOrchestrationHandler } from './orchestration-handler'
import type { DomainHandler } from '@/usom/types/process'

export const timeboxHandlers: Record<string, DomainHandler> = {
  createSmartTimeboxes: new TimeboxOrchestrationHandler(),
  adjustRemainingTimeboxes: new TimeboxOrchestrationHandler(),
}
