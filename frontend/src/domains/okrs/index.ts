/**
 * @file index
 * @brief OKR 域插件入口文件
 *
 * 遵循 Constitution Principle VI: 纯粹被动组件
 * 负责加载域 manifest 并创建域插件
 */

import type { DomainPlugin } from '@/usom/types/process'
import { loadDomainManifest } from '@/domains/manifest-loader'
import { createDomainPlugin } from '@/domains/plugin-factory'
import { createOkrsHooks } from './hooks'
import type { IContributionRepository } from '@/usom/interfaces/irepository'

const result = loadDomainManifest('okrs')

if (!result.success) {
  for (const error of result.errors) {
    console.warn(`[manifest-loader] ${error.domainId}: ${error.message}`)
  }
}

// [022-A4] 跨域事件驱动 KR 进度重算：通过 lazy proxy 注入 ContributionRepository。
// 延迟实例化避免在模块加载期 import DB 模块（SSR 时无 DB 连接，会抛错）。
// hooks.ts 仅在 onEvent('TaskCompleted' | 'HabitLogged') 时才会触达这些 getter。
let _contributionRepo: IContributionRepository | undefined
const contributionRepoProxy: IContributionRepository = {
  findByContributor: ((...args: unknown[]) => {
    if (!_contributionRepo) {
      // 动态 import：仅首次访问时加载，避免 SSR 循环依赖
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { ContributionRepository } = require('./repository/contribution') as typeof import('./repository/contribution')
      _contributionRepo = new ContributionRepository()
    }
    return (_contributionRepo.findByContributor as (...a: unknown[]) => unknown)(...args)
  }) as IContributionRepository['findByContributor'],
  recomputeProgress: ((...args: unknown[]) => {
    if (!_contributionRepo) {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { ContributionRepository } = require('./repository/contribution') as typeof import('./repository/contribution')
      _contributionRepo = new ContributionRepository()
    }
    return (_contributionRepo.recomputeProgress as (...a: unknown[]) => unknown)(...args)
  }) as IContributionRepository['recomputeProgress'],
  // 其他 IContributionRepository 方法（T6 不需调用）走兜底抛错
  findByKeyResult: (() => { throw new Error('[okrs] findByKeyResult not supported in hook proxy') }) as IContributionRepository['findByKeyResult'],
  add: (() => { throw new Error('[okrs] add not supported in hook proxy') }) as IContributionRepository['add'],
  remove: (() => { throw new Error('[okrs] remove not supported in hook proxy') }) as IContributionRepository['remove'],
  removeByContributor: (() => { throw new Error('[okrs] removeByContributor not supported in hook proxy') }) as IContributionRepository['removeByContributor'],
} as unknown as IContributionRepository

const hooks = result.success
  ? createOkrsHooks(result.manifest, {
      objectiveRepo: undefined,
      keyResultRepo: undefined,
      contributionRepo: contributionRepoProxy,
    })
  : null as any

export const okrsPlugin: DomainPlugin = result.success
  ? createDomainPlugin(result.manifest, hooks)
  : null!

export { createOkrsHooks } from './hooks'
export { objectiveTransitions, keyResultTransitions, findTransition } from './transitions'
