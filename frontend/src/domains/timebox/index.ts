/**
 * @file index
 * @brief Timebox 域插件入口文件
 * 
 * 遵循 Constitution Principle VI: 纯粹被动组件
 * 负责注册 CNUI Surface 组件、加载域 manifest 并创建域插件
 */

import type { DomainPlugin } from '@/usom/types/process'
import { loadDomainManifest } from '@/domains/manifest-loader'
import { createDomainPlugin } from '@/domains/plugin-factory'
import { createTimeboxHooks } from './hooks'

// ── CNUI Surface 注册 ────────────────────────────────────────
import { cnuiRegistry } from '@/nexus/ai-runtime/cnui/registry'
import { TimeboxList } from './cnui/surfaces/TimeboxList'
import { CreateTimebox } from './cnui/surfaces/CreateTimebox'
import { AdjustTimeboxes } from './cnui/surfaces/AdjustTimeboxes'
import { LogTimebox } from './cnui/surfaces/LogTimebox'
// [023.04] T6 — editTimeboxes CNUI surface（按 K-block 集中编辑多个 timebox）
import { EditTimeboxes } from './cnui/surfaces/EditTimeboxes'
// [026] A2.5 — 行程 3 surface 注册（handler 共用 timebox 模块，按 action 分支）
import { CreateItinerary } from './cnui/surfaces/CreateItinerary'
import { EditItinerary } from './cnui/surfaces/EditItinerary'
import { DeleteItinerary } from './cnui/surfaces/DeleteItinerary'
// [023.08] T5 — CreateSmartTimebox CNUI surface（AI 智能推荐 proposals + 接受/拒绝 + 撤销 batch）
import { CreateSmartTimebox } from './cnui/surfaces/CreateSmartTimebox'

// Handler 模块相对路径（运行时动态加载）
const handlerModulePath = './domains/timebox/cnui/handlers'

cnuiRegistry.register('timebox', 'timebox-list', {
  component: TimeboxList,
  handlerModulePath,
})

cnuiRegistry.register('timebox', 'create-timebox', {
  component: CreateTimebox,
  handlerModulePath,
})

// [023] A2.6 — adjustSchedule CNUI surface（按时间序列左右翻页，diff 提交）
cnuiRegistry.register('timebox', 'adjust-timeboxes', {
  component: AdjustTimeboxes,
  handlerModulePath,
})

// [023] A2.7 — logTimebox CNUI surface（批量打卡三态 + 备注）
cnuiRegistry.register('timebox', 'log-timebox', {
  component: LogTimebox,
  handlerModulePath,
})

// [023.04] T6 — editTimeboxes CNUI surface（集中编辑多 timebox，handler 已注册）
cnuiRegistry.register('timebox', 'edit-timeboxes', {
  component: EditTimeboxes,
  handlerModulePath,
})

// [023.08] T5 — CreateSmartTimebox CNUI surface 服务端注册（[cnui-surface-dual-registration] memory: server + client 双注册）
cnuiRegistry.register('timebox', 'create-smart-timebox', {
  component: CreateSmartTimebox,
  handlerModulePath,
})

// [026] A2.5 — 行程 3 surface（K-block manifest 已声明，handler 共用 timebox 模块）
cnuiRegistry.register('timebox', 'create-itinerary', {
  component: CreateItinerary,
  handlerModulePath,
})

cnuiRegistry.register('timebox', 'edit-itinerary', {
  component: EditItinerary,
  handlerModulePath,
})

cnuiRegistry.register('timebox', 'delete-itinerary', {
  component: DeleteItinerary,
  handlerModulePath,
})

const result = loadDomainManifest('timebox')

if (!result.success) {
  for (const error of result.errors) {
    console.warn(`[manifest-loader] ${error.domainId}: ${error.message}`)
  }
}

const hooks = result.success
  ? createTimeboxHooks(result.manifest)
  : null as any

export const timeboxPlugin: DomainPlugin = result.success
  ? createDomainPlugin(result.manifest, hooks)
  : null!

export { createTimeboxHooks } from './hooks'
export { timeboxTransitions, findTransition } from './transitions'
export { TimeboxProvider, EnergyCurveProvider } from './providers'
export { timeboxHandlers } from './handlers'
