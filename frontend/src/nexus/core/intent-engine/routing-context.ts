/**
 * @file routing-context
 * @brief AI Intent Parser 的路由上下文构建器
 *
 * 从所有 Domain 的 manifest 构建路由上下文和字段 schema，
 * 供 AI Parser 的 system prompt 使用。
 */

import { domainRegistry } from '@/domains/registry'
import { loadDomainManifest } from '@/domains/manifest-loader'
import type { DomainManifest } from '@/domains/manifest-loader/schema'

// TODO: 后续从 manifest field_metadata.synonyms 加载，消除硬编码。
// 当前各 Domain manifest 的 field_metadata 尚未定义 synonyms 字段。
/**
 * 字段同义词映射 — 帮助 LLM 识别自然语言中的字段引用。
 * 在 formatRoutingContextForPrompt 中注入到字段提示中。
 */
const FIELD_SYNONYMS: Record<string, string[]> = {
  dueDate: ['deadline', '截止日期', '结束日期', '到期日'],
  estimatedDuration: ['预计时长', '时长', '用时', '耗时'],
  priority: ['优先级', '紧急程度'],
  threadId: ['主线', '所属主线', '关联主线'],
  title: ['标题', '名称', '任务名'],
  description: ['描述', '说明', '详情'],
  defaultTime: ['默认时间', '执行时间', '开始时间'],
  defaultDuration: ['默认时长', '执行时长'],
  name: ['名称', '主线名'],
}

/**
 * 枚举字段值映射 — 帮助 LLM 将中文表述转换为系统枚举值。
 * 在 formatRoutingContextForPrompt 中注入到字段提示的枚举选项部分。
 */
const ENUM_VALUE_MAP: Record<string, string> = {
  priority: '选项: critical(紧急)/high(高)/medium(中)/low(低)',
  energyRequired: '选项: high(高能量/需要专注)/medium(中)/low(低/轻松)',
  status: '选项: todo(待办)/planned(已计划)/in_progress(进行中)/completed(已完成)/archived(已归档)',
}

/** 动作路由信息 */
interface ActionRoutingInfo {
  /** 域 ID */
  domainId: string
  /** 动作名称 */
  action: string
  /** 路由类型 */
  type: 'contract' | 'generative' | 'query' | 'view_route'
  /** 描述 */
  description: string
  /** 示例 */
  examples: string[]
  /** 关键词 */
  keywords: string[]
  /** 字段 schema（从 manifest required_fields 提取） */
  fields: Array<{ name: string; label: string; type: string; required: boolean }>
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

      // 提取该 action 的字段 schema
      const fieldDefs = manifest.required_fields?.[trigger.action] ?? []

      actions.push({
        domainId,
        action: trigger.action,
        type,
        description: trigger.description,
        examples: trigger.examples ?? [],
        keywords: trigger.keywords ?? [],
        fields: fieldDefs.map(f => ({
          name: f.name,
          label: f.label,
          type: f.type,
          required: f.required,
        })),
      })
    }
  }

  return actions
}

/** 将路由上下文格式化为 AI prompt 文本（含字段 schema）。 */
export function formatRoutingContextForPrompt(actions: ActionRoutingInfo[]): string {
  const typeLabel: Record<string, string> = {
    contract: '变更操作',
    generative: 'AI生成',
    query: '对话内查询',
    view_route: '页面导航',
  }

  const lines = actions.map(a => {
    const label = typeLabel[a.type] ?? a.type

    // 字段 schema 文本：列出字段名、类型、是否必填、同义词、枚举选项
    const fieldHints = a.fields.length > 0
      ? '\n  字段: ' + a.fields.map(f => {
          const synonyms = FIELD_SYNONYMS[f.name]
          const synonymHint = synonyms?.length ? `, 同义词: ${synonyms.join('/')}` : ''
          const enumHint = ENUM_VALUE_MAP[f.name] ? ` (${ENUM_VALUE_MAP[f.name]})` : ''
          return `${f.name}(${f.label}, ${f.type}${f.required ? ', 必填' : ''}${synonymHint})${enumHint}`
        }).join(', ')
      : ''

    return `- ${a.domainId}.${a.action} [${label}]: ${a.description}${fieldHints}
  示例: ${a.examples.join('、')}
  关键词: ${a.keywords.join('、')}`
  })
  return lines.join('\n')
}
