/**
 * @file register-client-surfaces.test
 * @brief [026.02] §1 IRON RULE 守护 — appointment CNUI surface 必须在 client 注册表
 *
 * 防止 [026.01] 回归（server 注册了，client 没注册 → /createAppointment 报"未知的卡片类型"）。
 * 每次 [026.02] 之外的 release 前都必须保持通过。
 */

import { cnuiRegistry } from '../registry'
import '@/nexus/ai-runtime/cnui/register-client-surfaces'  // 触发副作用

describe('[026.02] §1 IRON RULE — appointment CNUI surface client 注册', () => {
  const REQUIRED = ['create-appointment', 'edit-appointment', 'delete-appointment']

  it.each(REQUIRED)('client 注册表必须包含 %s', (surfaceType) => {
    const reg = cnuiRegistry.get(surfaceType)
    expect(reg).toBeDefined()
    expect(reg?.domainId).toBe('timebox')
  })

  it('每个 appointment surface 必须挂一个 React component', () => {
    for (const t of REQUIRED) {
      const reg = cnuiRegistry.get(t)
      expect(reg?.component).toBeDefined()
      expect(typeof reg?.component).toBe('function')  // React.ComponentType
    }
  })
})