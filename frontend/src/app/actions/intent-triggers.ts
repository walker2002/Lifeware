/**
 * @file intent-triggers
 * @brief 意图触发器 Server Action 模块
 * 
 * 提供意图触发器查询功能，从所有 Domain 的 manifest 中动态读取有快捷键的意图
 */

'use server'

/**
 * 意图触发器接口
 */
export interface IntentTrigger {
  /** 显示标签 */
  label: string
  /** 快捷键 */
  shortcut: string
  /** 域 ID */
  domainId: string
  /** 动作名称 */
  action: string
}

/**
 * 从所有 Domain manifest 的 intent_triggers 动态读取有 shortcut 的意图
 * 
 * @returns 意图触发器列表
 */
export async function fetchIntentTriggers(): Promise<IntentTrigger[]> {
  const { domainRegistry } = await import("@/domains/registry")
  const triggers: IntentTrigger[] = []
  for (const plugin of domainRegistry) {
    const items = plugin.manifest.intentTriggers
    if (!items) continue
    for (const t of items) {
      if (t.shortcut && !t.view_route) {
        triggers.push({
          label: t.description || t.action,
          shortcut: t.shortcut,
          domainId: plugin.manifest.domainId,
          action: t.action,
        })
      }
    }
  }
  return triggers
}
