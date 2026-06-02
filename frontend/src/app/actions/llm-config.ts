/**
 * @file llm-config
 * @brief LLM 配置管理 Server Action 模块
 * 
 * 提供 LLM 配置的读取、保存和验证功能
 */

'use server'

import {
  getProviderSummaries,
  setCachedUserPrefs,
  getActiveProviderId,
  getMergedConfig,
  type ProviderSummary,
  type UserLLMPreferences,
} from '@/lib/llm/config'
import { UserSettingsRepository } from '@/lib/db/repositories/user-settings.repository'

/** MVP 用户 ID（临时使用） */
const MVP_USER_ID = '00000000-0000-0000-0000-000000000001'

/**
 * LLM 设置数据接口
 */
export interface LLMSettingsData {
  /** 用户偏好设置 */
  prefs: UserLLMPreferences
  /** 提供商摘要列表 */
  providers: ProviderSummary[]
}

/**
 * 加载用户 LLM 偏好 + 提供商摘要（供设置页面使用）
 * 
 * @returns LLM 设置数据
 */
export async function getLLMSettings(): Promise<LLMSettingsData> {
  const repo = new UserSettingsRepository()
  const settings = await repo.findByUserId(MVP_USER_ID)
  const prefs: UserLLMPreferences =
    (settings?.llmConfig as unknown as UserLLMPreferences) ?? { providers: {} }

  setCachedUserPrefs(prefs)

  return { prefs, providers: getProviderSummaries() }
}

/**
 * 保存用户 LLM 偏好到 DB 并更新内存缓存
 * 
 * @param prefs - 用户 LLM 偏好设置
 */
export async function saveLLMSettings(prefs: UserLLMPreferences): Promise<void> {
  const repo = new UserSettingsRepository()
  await repo.upsert({
    userId: MVP_USER_ID,
    timezone: 'Asia/Shanghai',
    llmConfig: prefs as unknown as Record<string, unknown>,
  }, MVP_USER_ID)

  setCachedUserPrefs(prefs)
}

/**
 * 检查默认供应商是否已配置 API Key 和默认模型
 * 
 * @returns 是否已配置
 */
export async function checkLLMConfigured(): Promise<boolean> {
  const providerId = getActiveProviderId()
  const config = getMergedConfig(providerId)
  const apiKey = process.env[config.apiKeyEnv]
  const hasApiKey = !!apiKey
  const hasModel = !!config.models.default && config.models.default !== 'unknown'
  return hasApiKey && hasModel
}

/**
 * 向后兼容别名：获取 LLM 提供商列表
 */
export { getProviderSummaries as getLLMProviders }
