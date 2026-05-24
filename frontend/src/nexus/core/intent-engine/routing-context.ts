import { domainRegistry } from '@/domains/registry'
import { loadDomainManifest } from '@/domains/manifest-loader'

interface ActionRoutingInfo {
  domainId: string
  action: string
  type: 'contract' | 'generative' | 'query' | 'view_route'
  description: string
  examples: string[]
  keywords: string[]
}

/**
 * 从所有 Domain 的 manifest 构建路由上下文。
 * 供 AI Parser 的 system prompt 使用。
 */
export function buildRoutingContext(): ActionRoutingInfo[] {
  const actions: ActionRoutingInfo[] = []

  for (const plugin of domainRegistry) {
    const domainId = plugin.manifest.domainId
    const manifestResult = loadDomainManifest(domainId)
    if (!manifestResult.success) continue
    const manifest = manifestResult.manifest

    for (const trigger of manifest.intent_triggers ?? []) {
      let type: ActionRoutingInfo['type'] = 'contract'
      if (trigger.view_route) {
        type = 'view_route'
      } else if (manifest.query_actions?.[trigger.action]) {
        type = 'query'
      } else if (manifest.generation_actions?.[trigger.action]) {
        type = 'generative'
      }

      actions.push({
        domainId,
        action: trigger.action,
        type,
        description: trigger.description,
        examples: trigger.examples ?? [],
        keywords: trigger.keywords ?? [],
      })
    }
  }

  return actions
}

/** 将路由上下文格式化为 AI prompt 文本。 */
export function formatRoutingContextForPrompt(actions: ActionRoutingInfo[]): string {
  const typeLabel: Record<string, string> = {
    contract: '变更操作',
    generative: 'AI生成',
    query: '对话内查询',
    view_route: '页面导航',
  }

  const lines = actions.map(a => {
    const label = typeLabel[a.type] ?? a.type
    return `- ${a.domainId}.${a.action} [${label}]: ${a.description}
  示例: ${a.examples.join('、')}
  关键词: ${a.keywords.join('、')}`
  })
  return lines.join('\n')
}
