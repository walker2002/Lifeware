/**
 * @file mutation-service
 * @brief Timebox 域业务事实写入口组装（[023] A2，参 habits/okrs/tasks 范式）
 *
 * 调公共工厂 createDomainMutationServiceFactory，仅保留 Timebox 域差异：
 * domainId / repos（timebox）/ 事件名 TimeboxFieldUpdated。
 *
 * @see src/app/actions/habits/mutation-service.ts 范本
 * @see src/nexus/domain-mutation-service/factory.ts
 */
import { createDomainMutationServiceFactory } from '@/nexus/domain-mutation-service/factory'
import { createTimeboxGenericRepo } from '@/domains/timebox/repository/generic-repo-adapter'
import { TimeboxRepository } from '@/domains/timebox/repository'
import type { DomainMutationService } from '@/nexus/domain-mutation-service'

/**
 * 组装 Timebox 域业务事实写入口服务实例。
 * 每次调用产生独立实例（独立 eventRepo/eventBus），保证事务隔离。
 * @returns 业务事实写入口服务
 */
export function createTimeboxMutationService(): DomainMutationService {
  const repos = createTimeboxGenericRepo({
    timeboxRepo: new TimeboxRepository() as any,
  })
  return createDomainMutationServiceFactory({
    domainId: 'timebox',
    repos,
    fieldUpdatedEventType: 'TimeboxFieldUpdated',
    repoLabel: 'Timebox',
  })
}
