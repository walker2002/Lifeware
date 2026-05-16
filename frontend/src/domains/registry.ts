import type { DomainId } from '@/usom/types/primitives'
import type { DomainPlugin } from '@/usom/types/process'
import { timeboxPlugin } from './timebox'
import { habitsPlugin } from './habits'
import { okrsPlugin } from './okrs'
import { tasksPlugin } from './tasks'

export const domainRegistry: DomainPlugin[] = [
  timeboxPlugin,
  habitsPlugin,
  okrsPlugin,
  tasksPlugin,
]

export function findDomain(id: DomainId | string): DomainPlugin | undefined {
  return domainRegistry.find(p => p.manifest.domainId === id)
}
