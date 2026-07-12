/**
 * @file timezone-config
 * @brief [TZ-1] 用户配置时区 helper（per-user DB + 系统时区 + Asia/Shanghai 三级 fallback）
 *
 * 调用方：
 *   - cnui/handlers.ts submit 阶段：传 hhmmToIso 决定 user_tz
 *   - 后续 [TZ-2] 计划接入 React Context 透传到显示端
 *
 * 设计依据：
 *   - DB schema `user_settings.timezone` 已就位（schema.ts:659，default 'Asia/Shanghai'）
 *   - 既有 `TimezonePicker` 组件只写 localStorage，没接 DB（待 [TZ-1] Step 2 wire-up）
 *   - MVP 单用户 MVP_USER_ID 实际行为 = DB timezone 默认 'Asia/Shanghai'（已正确）
 *
 * Fallback 链（per [TZ-1] 设计）：
 *   1. DB user_settings.timezone（user 配置，per-user 持久化）
 *   2. `Intl.DateTimeFormat().resolvedOptions().timeZone`（运行时系统时区）
 *   3. 'Asia/Shanghai'（兜底，覆盖 SSR / 老 Node 不支持 Intl 的环境）
 */

import type { USOM_ID } from '@/usom/types/primitives'
import { getSystemTimezone } from './tz'

/**
 * 获取用户的有效时区（per-user DB → 系统时区 → 'Asia/Shanghai' 三级 fallback）
 *
 * 每次调用都查 DB — 在 MVP 单用户 + 写路径提交场景下可接受；
 * 未来如成为热点可加 in-memory cache（[TZ-1] defer / [TZ-2] 考虑）
 */
export async function getEffectiveTimezone(userId: USOM_ID): Promise<string> {
  try {
    // 动态 import 避免 client bundle 引入 DB（cnui handlers 是 server-side，
    //   此 helper 不会被打到 client bundle）
    const { UserSettingsRepository } = await import('@/lib/db/repositories/user-settings.repository')
    const settings = await new UserSettingsRepository().findByUserId(userId)
    if (settings?.timezone) {
      return settings.timezone
    }
  } catch {
    // DB 不可用 / user_settings 表未初始化 → 走系统时区兜底
  }
  return getSystemTimezone()
}