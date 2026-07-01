/**
 * @file slash-command
 * @brief Slash 命令解析工具
 * 
 * 解析用户输入中的 slash 命令格式，支持短格式和长格式
 */

/**
 * Slash 命令解析成功结果
 */
export interface SlashCommandResult {
  /** 是否为 slash 命令 */
  isSlashCommand: true
  /** 是否有 payload */
  hasPayload: boolean
  /** 域 ID */
  domainId: string
  /** 动作名称 */
  action: string
  /** 附加内容 */
  payload?: string
}

/**
 * Slash 命令解析失败结果（非 slash 命令）
 */
export interface NoSlashCommandResult {
  /** 是否为 slash 命令 */
  isSlashCommand: false
}

/**
 * Slash 命令解析结果类型
 */
export type SlashResolveResult = SlashCommandResult | NoSlashCommandResult

/**
 * Slash 命令正则表达式
 * 匹配格式：/actionName 或 /actionName 内容 或 /domain:action
 */
const SLASH_RE = /^\/([\w-]+)(?::([\w-]+))?(?:\s+(.+))?$/

/**
 * 解析用户输入中的 slash 命令
 * 
 * 返回格式示例：
 * - "/createHabit"          → { isSlashCommand: true, hasPayload: false, domainId: "", action: "createHabit" }
 * - "/createHabit 每天跑步"  → { isSlashCommand: true, hasPayload: true, domainId: "", action: "createHabit", payload: "每天跑步" }
 * - "/habits:createHabit"   → { isSlashCommand: true, hasPayload: false, domainId: "habits", action: "createHabit" }
 * - "帮我创建习惯"          → { isSlashCommand: false }
 * 
 * @remarks
 * 短格式（/actionName）的 domainId 为空字符串，由调用方通过 shortcut 查找填充
 * 长格式（/domain:action）的 domainId 已填入
 * 
 * @param rawInput - 用户原始输入
 * @returns 解析结果
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

/**
 * 未识别 slash 命令的「did you mean」提示。
 *
 * 给定用户输入的 action（不含前导 `/`，如 "createTime"）和已注册快捷方式列表，
 * 找出**唯一**以该 action 为前缀的快捷方式（如 "/createTimebox"）。
 * - 唯一前缀匹配 → 返回该 shortcut（用于提示「你是否想输入 /createTimebox？」）
 * - 多义（如 "create" 同时匹配 createHabit/createTask/createTimebox）或无匹配 → 返回 undefined
 *
 * @remarks
 * 仅用于**提示**，不自动路由（产品决策：未注册命令一律提示，不猜测意图）。
 * 大小写不敏感。shortcut 形如 "/createTimebox"，比较时去掉前导 `/`。
 *
 * @param action - 用户输入的 action 名（resolveSlashCommand 返回的 action 字段）
 * @param shortcuts - 已注册的快捷方式字符串列表（含前导 `/`）
 * @returns 唯一前缀匹配的 shortcut，或 undefined
 */
export function suggestShortcut(
  action: string,
  shortcuts: Array<{ shortcut: string } | string>,
): string | undefined {
  const lower = action.toLowerCase()
  if (!lower) return undefined
  const matches = new Set<string>()
  for (const item of shortcuts) {
    const shortcut = typeof item === 'string' ? item : item.shortcut
    if (!shortcut) continue
    // shortcut 形如 "/createTimebox"，去掉 `/` 后判断是否以 action 开头
    if (shortcut.replace(/^\//, '').toLowerCase().startsWith(lower)) {
      matches.add(shortcut)
    }
  }
  // 唯一匹配 → 返回；多义/无匹配 → undefined（调用方给通用提示）
  if (matches.size === 1) return Array.from(matches)[0]
  return undefined
}
