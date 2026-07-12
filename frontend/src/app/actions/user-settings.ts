/**
 * @file user-settings
 * @brief [TZ-1] User Settings Server Actions（时区等 user-level 配置）
 *
 * 'use server' 文件 — 只能 export async function（[feedback_server-action-async-required]）。
 *   直接调 UserSettingsRepository（OQ-7：配置变更不走 SM）。
 *
 * MVP 单租户：MVP_USER_ID 硬编码常量（与其它 action 一致）。
 */

"use server";

import { UserSettingsRepository } from "@/lib/db/repositories/user-settings.repository";
import type { USOM_ID } from "@/usom/types/primitives";

const MVP_USER_ID = "00000000-0000-0000-0000-000000000001" as USOM_ID;

/**
 * [TZ-1] Step 1: 保存用户的 timezone 配置（持久化到 user_settings.timezone）
 *
 * 由 client `TimezonePicker` 调用；先前实现只写 localStorage，
 *   本 server action 把变更持久化到 DB，让 `getEffectiveTimezone(userId)` 生效。
 *
 * 异常处理：DB 错误 → 返回 `{ success: false, error }`，client 显示给用户。
 */
export async function saveUserTimezone(timezone: string): Promise<{ success: boolean; error?: string }> {
  try {
    const trimmed = timezone.trim()
    if (!trimmed) {
      return { success: false, error: '时区不能为空' }
    }
    const repo = new UserSettingsRepository()
    await repo.upsert(
      {
        userId: MVP_USER_ID,
        timezone: trimmed,
        llmConfig: undefined,
        uiPrefs: undefined,
      },
      MVP_USER_ID,
    )
    return { success: true }
  } catch (e) {
    const msg = e instanceof Error ? e.message : '保存时区失败'
    return { success: false, error: msg }
  }
}

/**
 * [TZ-1] Step 1: 读取用户当前 timezone（client-side init 用）
 *
 * 注意：本函数由 server component / 'use server' boundary 调用，client 不应直接调用，
 *   应通过 server-rendered props 透传，或由专门 client-fetch helper 调用。
 */
export async function getUserTimezone(): Promise<string | null> {
  try {
    const repo = new UserSettingsRepository()
    const settings = await repo.findByUserId(MVP_USER_ID)
    return settings?.timezone ?? null
  } catch {
    return null
  }
}