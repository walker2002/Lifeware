/**
 * @file mutation-service
 * @brief Habits 域业务事实写入口组装（G2：调公共工厂）
 *
 * G2 切片起改调 src/nexus/domain-mutation-service/factory.ts 的公共工厂，
 * 仅保留 Habits 域差异：domainId / repos（habit + habit_log）/ 事件名
 * HabitFieldUpdated（F-6 修正，原 G1 硬编码 TaskFieldUpdated 为语义错误）。
 * 六项组装（getRepository/getFieldMetadata/smExecute/eventBus/transaction/
 * getExecutor）已下沉到公共工厂。
 *
 * @see docs/superpowers/specs/2026-06-19-domain-mutation-service-factory-design.md
 * @see src/nexus/domain-mutation-service/factory.ts
 */
import { createDomainMutationServiceFactory } from '@/nexus/domain-mutation-service/factory'
import { createHabitsGenericRepo } from '@/domains/habits/repository/generic-repo-adapter'
import { HabitRepository } from '@/domains/habits/repository/habit'
import { HabitLogRepository } from '@/domains/habits/repository/habit-log'
import type { DomainMutationService } from '@/nexus/domain-mutation-service'

/**
 * 组装 Habits 域业务事实写入口服务实例。
 *
 * 每次调用产生独立服务实例（含独立 eventRepo / eventBus），保证事务隔离与可测试性。
 * @returns 业务事实写入口服务
 */
export function createHabitsMutationService(): DomainMutationService {
  const repos = createHabitsGenericRepo({
    habitRepo: new HabitRepository() as any,
    habitLogRepo: new HabitLogRepository() as any,
  })
  return createDomainMutationServiceFactory({
    domainId: 'habits',
    repos,
    fieldUpdatedEventType: 'HabitFieldUpdated',
    repoLabel: 'Habits',
  })
}
