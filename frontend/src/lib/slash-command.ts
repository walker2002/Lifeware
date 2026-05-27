export interface SlashCommandResult {
  isSlashCommand: true
  hasPayload: boolean
  domainId: string
  action: string
  payload?: string
}

export interface NoSlashCommandResult {
  isSlashCommand: false
}

export type SlashResolveResult = SlashCommandResult | NoSlashCommandResult

// 匹配 /actionName 或 /actionName 内容 或 /domain:action
const SLASH_RE = /^\/([\w-]+)(?::([\w-]+))?(?:\s+(.+))?$/

/**
 * 解析用户输入中的 slash 命令。
 *
 * 返回格式：
 * - "/createHabit"          → { isSlashCommand: true, hasPayload: false, domainId: "", action: "createHabit" }
 * - "/createHabit 每天跑步"  → { isSlashCommand: true, hasPayload: true, domainId: "", action: "createHabit", payload: "每天跑步" }
 * - "/habits:createHabit"   → { isSlashCommand: true, hasPayload: false, domainId: "habits", action: "createHabit" }
 * - "帮我创建习惯"          → { isSlashCommand: false }
 *
 * 短格式（/actionName）的 domainId 为空字符串，由调用方通过 shortcut 查找填充。
 * 长格式（/domain:action）的 domainId 已填入。
 */
export function resolveSlashCommand(
  rawInput: string,
): SlashResolveResult {
  const trimmed = rawInput.trim()
  const match = trimmed.match(SLASH_RE)

  if (!match) {
    return { isSlashCommand: false }
  }

  const [, first, second, rest] = match

  if (second) {
    // 长格式: /domain:action [payload]
    return {
      isSlashCommand: true,
      hasPayload: !!rest?.trim(),
      domainId: first,
      action: second,
      payload: rest?.trim() || undefined,
    }
  }

  // 短格式: /actionName [payload] — domainId 由调用方通过 shortcut 查找
  return {
    isSlashCommand: true,
    hasPayload: !!rest?.trim(),
    domainId: '',
    action: first,
    payload: rest?.trim() || undefined,
  }
}
