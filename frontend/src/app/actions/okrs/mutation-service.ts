/**
 * @file mutation-service
 * @brief OKRs 域业务事实写入口组装（调公共工厂）
 *
 * 仿 createHabitsMutationService：仅保留 OKRs 域差异（domainId / repos /
 * 事件名 OkrFieldUpdated）。@see src/nexus/domain-mutation-service/factory.ts
 */
import { createDomainMutationServiceFactory } from '@/nexus/domain-mutation-service/factory'
import { createOkrsGenericRepo } from '@/domains/okrs/repository/generic-repo-adapter'
import { ObjectiveRepository } from '@/domains/okrs/repository/objective'
import { KeyResultRepository } from '@/domains/okrs/repository/key-result'
import { CycleRepository } from '@/domains/okrs/repository/cycle'
import type { DomainMutationService } from '@/nexus/domain-mutation-service'

/**
 * 组装 OKRs 域业务事实写入口服务实例。
 *
 * 每次调用产生独立服务实例（含独立 eventRepo / eventBus），保证事务隔离与可测试性。
 * @returns 业务事实写入口服务
 */
export function createOkrsMutationService(): DomainMutationService {
  const repos = createOkrsGenericRepo({
    objectiveRepo: new ObjectiveRepository() as any,
    keyResultRepo: new KeyResultRepository() as any,
    cycleRepo: new CycleRepository() as any,
  })
  return createDomainMutationServiceFactory({
    domainId: 'okrs',
    repos,
    fieldUpdatedEventType: 'OkrFieldUpdated',
    repoLabel: 'OKRs',
  })
}
