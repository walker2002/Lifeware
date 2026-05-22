import { SchedulingHandler } from './scheduling-handler'
import type { DomainHandler } from '@/usom/types/process'

export const timeboxHandlers: Record<string, DomainHandler> = {
  createSmartSchedule: new SchedulingHandler(),
  adjustRemainingSchedule: new SchedulingHandler(),
}
