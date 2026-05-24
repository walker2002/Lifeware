import type { QueryContext, QueryResult } from '@/usom/types/process'

interface ActionConfig {
  response_mode: 'text' | 'cnui'
  cnui_surface?: string
}

/**
 * Shortcut Path 的声明式 CN-UI 组装。
 *
 * 纯格式化函数 — 无条件分支、无数据聚合、无 AI 调用、无状态写入。
 */
export function formatCNUIFromContext(
  queryContext: QueryContext,
  actionConfig: ActionConfig,
): QueryResult {
  const surfaceType = actionConfig.cnui_surface ?? 'generic-list'

  const contextEntries = Object.values(queryContext.contexts)
  const items = Array.isArray(contextEntries[0]) ? contextEntries[0] : [contextEntries[0]]

  return {
    type: 'cnui',
    payload: {
      surfaceType,
      components: [
        {
          type: 'list',
          props: {
            items: items.filter(Boolean).map((item: any) => ({
              id: item.id,
              title: item.title ?? item.name ?? '',
              subtitle: item.status ?? '',
              metadata: item,
            })),
          },
        },
      ],
      actions: [{ type: 'dismiss', label: '关闭' }],
    },
  }
}

/** 降级文本摘要 */
export function formatTextSummary(queryContext: QueryContext): string {
  const entries = Object.entries(queryContext.contexts)
  if (entries.length === 0) return '没有找到相关数据'
  const items = Array.isArray(entries[0][1]) ? entries[0][1] : [entries[0][1]]
  return `找到 ${items.length} 条记录`
}
