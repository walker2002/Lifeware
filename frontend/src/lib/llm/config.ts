import OpenAI from 'openai'

// ─── Types ────────────────────────────────────────────────────

export type ModelRole = 'default' | 'thinking' | 'quick'

export interface ProviderConfig {
  name: string
  apiKeyEnv: string
  baseURL: string
  models: Record<ModelRole, string>
}

export interface ProviderSummary {
  id: string
  name: string
  baseURL: string
  models: Record<ModelRole, string>
  configured: boolean
}

export interface ProviderUserPrefs {
  baseUrl?: string
  models?: Partial<Record<ModelRole, string>>
}

export interface UserLLMPreferences {
  activeProvider?: string
  providers: Record<string, ProviderUserPrefs>
}

// ─── 内置提供商元数据（名称 + apiKey 环境变量 + 默认 baseURL）──────────

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

function getEnv(key: string): string | undefined {
  return process.env[key]
}

function getAvailableProviderIds(): string[] {
  const raw = getEnv('LLM_PROVIDERS')
  if (!raw) return Object.keys(PROVIDER_META)
  return raw.split(',').map(s => s.trim()).filter(Boolean)
}

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

// 带缓存的提供商配置构建
const configCache = new Map<string, ProviderConfig>()

function getCachedConfig(providerId: string): ProviderConfig {
  let config = configCache.get(providerId)
  if (!config) {
    config = buildProviderConfig(providerId)
    configCache.set(providerId, config)
  }
  return config
}

// ─── 用户偏好缓存（从 DB 加载，覆盖 env 默认值）──────────────

let cachedUserPrefs: UserLLMPreferences = { providers: {} }

export function setCachedUserPrefs(prefs: UserLLMPreferences): void {
  cachedUserPrefs = prefs
  configCache.clear()
}

export function getCachedUserPrefs(): UserLLMPreferences {
  return cachedUserPrefs
}

/** 合并 env 基础配置与用户 DB 偏好 */
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

function envOverrideKey(providerId: string, role: ModelRole): string {
  const roleKey = role === 'default' ? 'DEFAULT' : role.toUpperCase()
  return `LLM_${providerId.toUpperCase()}_${roleKey}_MODEL`
}

// ─── Public API ───────────────────────────────────────────────

export function getActiveProviderId(): string {
  return cachedUserPrefs.activeProvider || getEnv('LLM_PROVIDER') || 'dashscope'
}

export function getActiveProvider(): { id: string } & ProviderConfig {
  const id = getActiveProviderId()
  const available = getAvailableProviderIds()
  if (!available.includes(id)) {
    throw new Error(`Unknown LLM provider: "${id}". Available: ${available.join(', ')}`)
  }
  return { id, ...getMergedConfig(id) }
}

export function resolveModel(role: ModelRole = 'default', providerId?: string): string {
  const pid = providerId || getActiveProviderId()
  const merged = getMergedConfig(pid)
  return getEnv(envOverrideKey(pid, role)) || merged.models[role]
}

export function createClient(providerId?: string): OpenAI {
  const pid = providerId || getActiveProviderId()
  const config = getCachedConfig(pid) // env-only, for apiKeyEnv

  const apiKey = getEnv(config.apiKeyEnv)
  if (!apiKey) throw new Error(`Missing API key: set ${config.apiKeyEnv} for provider "${pid}"`)

  const merged = getMergedConfig(pid)
  return new OpenAI({ apiKey, baseURL: merged.baseURL })
}

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

/** 返回提供商摘要列表（供前端 LLM 设置页面使用，不含密钥） */
export function getProviderSummaries(): ProviderSummary[] {
  return getAvailableProviderIds().map(id => {
    const config = getCachedConfig(id)
    return { id, name: config.name, baseURL: config.baseURL, models: config.models, configured: !!getEnv(config.apiKeyEnv) }
  })
}
