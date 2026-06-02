/**
 * @file config
 * @brief LLM 提供商配置管理
 * 
 * 管理多 LLM 提供商配置、用户偏好和模型解析
 */

import OpenAI from 'openai'

// ─── Types ────────────────────────────────────────────────────

/**
 * 模型角色类型
 */
export type ModelRole = 'default' | 'thinking' | 'quick'

/**
 * 提供商配置
 */
export interface ProviderConfig {
  /** 提供商名称 */
  name: string
  /** API Key 环境变量名 */
  apiKeyEnv: string
  /** Base URL */
  baseURL: string
  /** 各角色对应的模型 */
  models: Record<ModelRole, string>
}

/**
 * 提供商摘要
 */
export interface ProviderSummary {
  /** 提供商 ID */
  id: string
  /** 提供商名称 */
  name: string
  /** Base URL */
  baseURL: string
  /** 各角色对应的模型 */
  models: Record<ModelRole, string>
  /** 是否已配置 */
  configured: boolean
}

/**
 * 提供商用户偏好
 */
export interface ProviderUserPrefs {
  /** 自定义 Base URL */
  baseUrl?: string
  /** 自定义模型配置 */
  models?: Partial<Record<ModelRole, string>>
}

/**
 * 用户 LLM 偏好配置
 */
export interface UserLLMPreferences {
  /** 活跃提供商 ID */
  activeProvider?: string
  /** 各提供商的偏好配置 */
  providers: Record<string, ProviderUserPrefs>
}

// ─── 内置提供商元数据（名称 + apiKey 环境变量 + 默认 baseURL）──────────

/**
 * 内置提供商元数据
 */
const PROVIDER_META: Record<string, { name: string; apiKeyEnv: string; baseURL: string }> = {
  dashscope: {
    name: 'DashScope (通义千问)',
    apiKeyEnv: 'DASHSCOPE_API_KEY',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  },
  deepseek: {
    name: 'DeepSeek',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    baseURL: 'https://api.deepseek.com/v1',
  },
  openai: {
    name: 'OpenAI',
    apiKeyEnv: 'OPENAI_API_KEY',
    baseURL: 'https://api.openai.com/v1',
  },
  zhipu: {
    name: '智谱 GLM',
    apiKeyEnv: 'ZHIPU_API_KEY',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
  },
}

// ─── 从环境变量动态构建提供商配置 ─────────────────────────────────

/**
 * 获取环境变量值
 * @param key - 环境变量名
 * @returns 环境变量值或 undefined
 */
function getEnv(key: string): string | undefined {
  return process.env[key]
}

/**
 * 获取可用的提供商 ID 列表
 * @returns 提供商 ID 列表
 */
function getAvailableProviderIds(): string[] {
  const raw = getEnv('LLM_PROVIDERS')
  if (!raw) return Object.keys(PROVIDER_META)
  return raw.split(',').map(s => s.trim()).filter(Boolean)
}

/**
 * 构建提供商配置
 * @param providerId - 提供商 ID
 * @returns 提供商配置
 */
function buildProviderConfig(providerId: string): ProviderConfig {
  const meta = PROVIDER_META[providerId]
  if (!meta) throw new Error(`Unknown LLM provider meta: "${providerId}"`)

  const roleKey = (role: ModelRole) => {
    const r = role === 'default' ? 'DEFAULT' : role.toUpperCase()
    return `LLM_${providerId.toUpperCase()}_${r}_MODEL`
  }

  return {
    name: meta.name,
    apiKeyEnv: meta.apiKeyEnv,
    baseURL: getEnv(`LLM_${providerId.toUpperCase()}_BASE_URL`) || meta.baseURL,
    models: {
      default: getEnv(roleKey('default')) || 'unknown',
      thinking: getEnv(roleKey('thinking')) || 'unknown',
      quick: getEnv(roleKey('quick')) || 'unknown',
    },
  }
}

/** 带缓存的提供商配置构建 */
const configCache = new Map<string, ProviderConfig>()

/**
 * 获取缓存的提供商配置
 * @param providerId - 提供商 ID
 * @returns 提供商配置
 */
function getCachedConfig(providerId: string): ProviderConfig {
  let config = configCache.get(providerId)
  if (!config) {
    config = buildProviderConfig(providerId)
    configCache.set(providerId, config)
  }
  return config
}

// ─── 用户偏好缓存（从 DB 加载，覆盖 env 默认值）──────────────

/** 缓存的用户偏好 */
let cachedUserPrefs: UserLLMPreferences = { providers: {} }

/**
 * 设置缓存的用户偏好
 * @param prefs - 用户偏好配置
 */
export function setCachedUserPrefs(prefs: UserLLMPreferences): void {
  cachedUserPrefs = prefs
  configCache.clear()
}

/**
 * 获取缓存的用户偏好
 * @returns 用户偏好配置
 */
export function getCachedUserPrefs(): UserLLMPreferences {
  return cachedUserPrefs
}

/** 合并 env 基础配置与用户 DB 偏好 */
/**
 * 获取合并后的提供商配置（环境变量 + 用户偏好）
 * @param providerId - 提供商 ID
 * @returns 合并后的配置
 */
export function getMergedConfig(providerId: string): ProviderConfig {
  const base = getCachedConfig(providerId)
  const prefs = cachedUserPrefs.providers[providerId]
  if (!prefs) return base

  return {
    ...base,
    baseURL: prefs.baseUrl || base.baseURL,
    models: {
      default: prefs.models?.default || base.models.default,
      thinking: prefs.models?.thinking || base.models.thinking,
      quick: prefs.models?.quick || base.models.quick,
    },
  }
}

// ─── Env Override Resolution ──────────────────────────────────

/**
 * 获取环境变量覆盖的键名
 * @param providerId - 提供商 ID
 * @param role - 模型角色
 * @returns 环境变量键名
 */
function envOverrideKey(providerId: string, role: ModelRole): string {
  const roleKey = role === 'default' ? 'DEFAULT' : role.toUpperCase()
  return `LLM_${providerId.toUpperCase()}_${roleKey}_MODEL`
}

// ─── Public API ───────────────────────────────────────────────

/**
 * 获取活跃的提供商 ID
 * @returns 提供商 ID
 */
export function getActiveProviderId(): string {
  return cachedUserPrefs.activeProvider || getEnv('LLM_PROVIDER') || 'dashscope'
}

/**
 * 获取活跃的提供商配置
 * @returns 提供商 ID 和配置
 */
export function getActiveProvider(): { id: string } & ProviderConfig {
  const id = getActiveProviderId()
  const available = getAvailableProviderIds()
  if (!available.includes(id)) {
    throw new Error(`Unknown LLM provider: "${id}". Available: ${available.join(', ')}`)
  }
  return { id, ...getMergedConfig(id) }
}

/**
 * 解析模型名称
 * @param role - 模型角色
 * @param providerId - 提供商 ID（可选）
 * @returns 模型名称
 */
export function resolveModel(role: ModelRole = 'default', providerId?: string): string {
  const pid = providerId || getActiveProviderId()
  const merged = getMergedConfig(pid)
  return getEnv(envOverrideKey(pid, role)) || merged.models[role]
}

/**
 * 创建 OpenAI 客户端
 * @param providerId - 提供商 ID（可选）
 * @returns OpenAI 客户端实例
 */
export function createClient(providerId?: string): OpenAI {
  const pid = providerId || getActiveProviderId()
  const config = getCachedConfig(pid) // env-only, for apiKeyEnv

  const apiKey = getEnv(config.apiKeyEnv)
  if (!apiKey) throw new Error(`Missing API key: set ${config.apiKeyEnv} for provider "${pid}"`)

  const merged = getMergedConfig(pid)
  return new OpenAI({ apiKey, baseURL: merged.baseURL })
}

/**
 * 列出可用的提供商
 * @returns 提供商列表
 */
export function listProviders(): { id: string; name: string; configured: boolean }[] {
  return getAvailableProviderIds().map(id => {
    const config = getCachedConfig(id)
    return {
      id,
      name: config.name,
      configured: !!getEnv(config.apiKeyEnv),
    }
  })
}

/**
 * 返回提供商摘要列表（供前端 LLM 设置页面使用，不含密钥）
 * @returns 提供商摘要列表
 */
export function getProviderSummaries(): ProviderSummary[] {
  return getAvailableProviderIds().map(id => {
    const config = getCachedConfig(id)
    return { id, name: config.name, baseURL: config.baseURL, models: config.models, configured: !!getEnv(config.apiKeyEnv) }
  })
}
