/**
 * @file mutation-service
 * @brief Timebox 域业务事实写入口组装（[023] A2，参 habits/okrs/tasks 范式）
 *
 * 调公共工厂 createDomainMutationServiceFactory，保留 Timebox 域差异：
 * domainId / repos（timebox+appointment）/ 事件名 TimeboxFieldUpdated。
 *
 * [026] 决议 A：拆双 service。createTimeboxMutationService 发 TimeboxFieldUpdated；
 * createAppointmentMutationService 发 AppointmentFieldUpdated。两 service 共享同一对 repo
 * 实例（共享 generic-repo-adapter），通过 fieldUpdatedEventType 区分。
 *
 * @see src/app/actions/habits/mutation-service.ts 范本
 * @see src/nexus/domain-mutation-service/factory.ts
 */
import { createDomainMutationServiceFactory } from '@/nexus/domain-mutation-service/factory'
import { createTimeboxGenericRepo } from '@/domains/timebox/repository/generic-repo-adapter'
import { TimeboxRepository, AppointmentRepository } from '@/domains/timebox/repository'
import type { DomainMutationService } from '@/nexus/domain-mutation-service'

/**
 * 组装 Timebox 域业务事实写入口服务实例。
 * 每次调用产生独立实例（独立 eventRepo/eventBus），保证事务隔离。
 * @returns 业务事实写入口服务（fieldUpdatedEventType = TimeboxFieldUpdated）
 */
export function createTimeboxMutationService(): DomainMutationService {
  const repos = createTimeboxGenericRepo({
    timeboxRepo: new TimeboxRepository() as any,
    appointmentRepo: new AppointmentRepository() as any,
  })
  return createDomainMutationServiceFactory({
    domainId: 'timebox',
    repos,
    fieldUpdatedEventType: 'TimeboxFieldUpdated',
    repoLabel: 'Timebox',
  })
}

/**
 * 组装 Appointment 域业务事实写入口服务实例（[026] D2 reversal 决议 A）。
 * 共享 timebox+appointment 两个 repo 实例，但 fieldUpdatedEventType 独立为 AppointmentFieldUpdated。
 * 每次调用产生独立实例（独立 eventRepo/eventBus），保证事务隔离。
 * @returns 业务事实写入口服务（fieldUpdatedEventType = AppointmentFieldUpdated）
 */
export function createAppointmentMutationService(): DomainMutationService {
  const repos = createTimeboxGenericRepo({
    timeboxRepo: new TimeboxRepository() as any,
    appointmentRepo: new AppointmentRepository() as any,
  })
  return createDomainMutationServiceFactory({
    domainId: 'timebox',
    repos,
    fieldUpdatedEventType: 'AppointmentFieldUpdated',
    repoLabel: 'Appointment',
  })
}
