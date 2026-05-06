import OpenAI from 'openai'

// ─── Types ────────────────────────────────────────────────────

export type ModelRole = 'default' | 'thinking' | 'quick'

export interface ProviderConfig {
  name: string
  apiKeyEnv: string
  baseURL: string
  models: Record<ModelRole, string>
}

// ─── Built-in Provider Presets ────────────────────────────────

const PROVIDERS: Record<string, ProviderConfig> = {
  dashscope: {
    name: 'DashScope (通义千问)',
    apiKeyEnv: 'DASHSCOPE_API_KEY',
    baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: {
      default: 'qwen-plus',
      thinking: 'qwen3-235b-a22b',
      quick: 'qwen-turbo',
    },
  },
  deepseek: {
    name: 'DeepSeek',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    baseURL: 'https://api.deepseek.com/v1',
    models: {
      default: 'deepseek-chat',
      thinking: 'deepseek-reasoner',
      quick: 'deepseek-chat',
    },
  },
  openai: {
    name: 'OpenAI',
    apiKeyEnv: 'OPENAI_API_KEY',
    baseURL: 'https://api.openai.com/v1',
    models: {
      default: 'gpt-4o',
      thinking: 'o3-mini',
      quick: 'gpt-4o-mini',
    },
  },
  zhipu: {
    name: '智谱 GLM',
    apiKeyEnv: 'ZHIPU_API_KEY',
    baseURL: 'https://open.bigmodel.cn/api/paas/v4',
    models: {
      default: 'glm-4-plus',
      thinking: 'glm-4-thinking',
      quick: 'glm-4-flash',
    },
  },
}

// ─── Env Override Resolution ──────────────────────────────────

function getEnv(key: string): string | undefined {
  return process.env[key]
}

function envOverrideKey(providerId: string, role: ModelRole): string {
  const roleKey = role === 'default' ? 'DEFAULT' : role.toUpperCase()
  return `LLM_${providerId.toUpperCase()}_${roleKey}_MODEL`
}

// ─── Public API ───────────────────────────────────────────────

export function getActiveProviderId(): string {
  return getEnv('LLM_PROVIDER') || 'dashscope'
}

export function getActiveProvider(): { id: string } & ProviderConfig {
  const id = getActiveProviderId()
  const config = PROVIDERS[id]
  if (!config) {
    throw new Error(`Unknown LLM provider: "${id}". Available: ${Object.keys(PROVIDERS).join(', ')}`)
  }
  return { id, ...config }
}

export function resolveModel(role: ModelRole = 'default', providerId?: string): string {
  const pid = providerId || getActiveProviderId()
  const config = PROVIDERS[pid]
  if (!config) throw new Error(`Unknown provider: "${pid}"`)

  return getEnv(envOverrideKey(pid, role)) || config.models[role]
}

export function createClient(providerId?: string): OpenAI {
  const pid = providerId || getActiveProviderId()
  const config = PROVIDERS[pid]
  if (!config) throw new Error(`Unknown provider: "${pid}"`)

  const apiKey = getEnv(config.apiKeyEnv)
  if (!apiKey) throw new Error(`Missing API key: set ${config.apiKeyEnv} for provider "${pid}"`)

  const baseURL = getEnv(`LLM_${pid.toUpperCase()}_BASE_URL`) || config.baseURL

  return new OpenAI({ apiKey, baseURL })
}

export function listProviders(): { id: string; name: string; configured: boolean }[] {
  return Object.entries(PROVIDERS).map(([id, config]) => ({
    id,
    name: config.name,
    configured: !!getEnv(config.apiKeyEnv),
  }))
}
