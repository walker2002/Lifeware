'use server'

import {
  getProviderSummaries,
  setCachedUserPrefs,
  type ProviderSummary,
  type UserLLMPreferences,
} from '@/lib/llm/config'
import { UserSettingsRepository } from '@/lib/db/repositories/user-settings.repository'

const MVP_USER_ID = '00000000-0000-0000-0000-000000000001'

export interface LLMSettingsData {
  prefs: UserLLMPreferences
  providers: ProviderSummary[]
}

/** 加载用户 LLM 偏好 + 提供商摘要（供设置页面使用） */
export async function getLLMSettings(): Promise<LLMSettingsData> {
  const repo = new UserSettingsRepository()
  const settings = await repo.findByUserId(MVP_USER_ID)
  const prefs: UserLLMPreferences =
    (settings?.llmConfig as unknown as UserLLMPreferences) ?? { providers: {} }

  setCachedUserPrefs(prefs)

  return { prefs, providers: getProviderSummaries() }
}

/** 保存用户 LLM 偏好到 DB 并更新内存缓存 */
export async function saveLLMSettings(prefs: UserLLMPreferences): Promise<void> {
  const repo = new UserSettingsRepository()
  await repo.upsert({
    userId: MVP_USER_ID,
    timezone: 'Asia/Shanghai',
    llmConfig: prefs as unknown as Record<string, unknown>,
  }, MVP_USER_ID)

  setCachedUserPrefs(prefs)
}

// 向后兼容别名
export { getProviderSummaries as getLLMProviders }
