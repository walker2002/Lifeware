/**
 * @file index
 * @brief Context Engine 入口
 *
 * 提供跨域上下文组装能力
 */

export { registerContextCapability, resolveContext, getRegisteredCapabilities } from './registry'
export { assembleContext } from './assembler'
export { registerAllProviders } from './register-providers'
export type { ProviderDeps } from './register-providers'
export { createEnergyStateManager } from './energy-state-manager'
export type { EnergyStateManager } from './energy-state-manager'
