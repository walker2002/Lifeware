import type { DomainId } from '@/usom/types/primitives'
import type { DomainPlugin } from '@/usom/types/process'
import { timeboxPlugin } from './timebox'
import { habitsPlugin } from './habits'
import { okrsPlugin } from './okrs'
import { tasksPlugin } from './tasks'

const allPlugins = [timeboxPlugin, habitsPlugin, okrsPlugin, tasksPlugin]

// 跳过加载失败的域（manifest 加载失败时 plugin 为 null）
export const domainRegistry: DomainPlugin[] = allPlugins.filter(Boolean) as DomainPlugin[]

export function findDomain(id: DomainId | string): DomainPlugin | undefined {
  return domainRegistry.find(p => p.manifest.domainId === id)
}
