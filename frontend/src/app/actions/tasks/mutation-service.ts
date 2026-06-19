/**
 * @file mutation-service
 * @brief Tasks 域业务事实写入口组装（G2：调公共工厂）
 *
 * G2 切片起改调 src/nexus/domain-mutation-service/factory.ts 的公共工厂，
 * 仅保留 Tasks 域差异：domainId / repos（task + thread）/ 事件名
 * TaskFieldUpdated（F-6 per-domain 显式配置，与 G1 硬编码值一致——零行为变更）。
 * 六项组装已下沉到公共工厂。
 *
 * @see docs/superpowers/specs/2026-06-19-domain-mutation-service-factory-design.md
 * @see src/nexus/domain-mutation-service/factory.ts
 */
import { createDomainMutationServiceFactory } from '@/nexus/domain-mutation-service/factory'
import { createTasksGenericRepo } from '@/domains/tasks/repository/generic-repo-adapter'
import { TaskRepository } from '@/domains/tasks/repository/task'
import { ThreadRepository } from '@/domains/tasks/repository/thread'
import type { DomainMutationService } from '@/nexus/domain-mutation-service'

/**
 * 组装 Tasks 域业务事实写入口服务实例。
 *
 * 每次调用产生独立服务实例（含独立 eventRepo / eventBus），保证事务隔离与可测试性。
 * @returns 业务事实写入口服务
 */
export function createTasksMutationService(): DomainMutationService {
  const repos = createTasksGenericRepo({
    taskRepo: new TaskRepository() as any,
    threadRepo: new ThreadRepository() as any,
  })
  return createDomainMutationServiceFactory({
    domainId: 'tasks',
    repos,
    fieldUpdatedEventType: 'TaskFieldUpdated',
    repoLabel: 'Tasks',
  })
}
