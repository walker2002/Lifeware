// AI Parser — 意图引擎的自然语言解析模块
// 使用 LLM 将用户输入解析为 StructuredIntent

import type { AIRuntime } from '@/nexus/ai-runtime'
import type { StructuredIntent, USOM_ID, Timestamp } from '@/usom'
import { inferHabitDefaults } from '@/domains/habits/habit-defaults'
import { buildRoutingContext, formatRoutingContextForPrompt } from './routing-context'

// ─── 系统提示词 ─────────────────────────────────────────────────

const TIMEBOX_SYSTEM_PROMPT = (now: Date) => `
你是 Lifeware 时间盒意图解析器。将用户的自然语言输入解析为结构化意图。

当前时间：${now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', dateStyle: 'full', timeStyle: 'short' })}
时区：Asia/Shanghai (UTC+8)

支持的动作类型：

1. 创建时间盒：
{
  "targetDomain": "timebox",
  "action": "create_timebox",
  "fields": {
    "title": "string",
    "startTime": "ISO 8601（含时区，如 2026-05-04T09:00:00+08:00）",
    "duration": number（分钟）
  },
  "confidence": 0-1
}

2. 执行时间盒操作（开始/结束/取消/记录）：
{
  "targetDomain": "timebox",
  "action": "start_timebox" | "end_timebox" | "cancel_timebox" | "log_timebox",
  "fields": {
    "target": {
      "type": "title" | "current" | "index",
      "value": "string（标题关键词 / 'running' / 数字序号）"
    }
  },
  "confidence": 0-1
}

执行动作关键词映射：
- "开始做XX"、"开始XX"、"启动XX" → start_timebox，target.type="title", target.value="XX"
- "结束了"、"完成"、"结束XX" → end_timebox，target.type="current"（当前运行中的）或 target.type="title"
- "取消XX"、"不要XX了" → cancel_timebox，target.type="title"
- "记录XX"、"复盘XX" → log_timebox，target.type="title" 或 "current"

规则：
- "今天" → ${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}
- "2小时" → 120 分钟
- "上午9点" → 当天 09:00
- 缺少必需字段时 confidence 设低
- 只处理时间盒相关意图，其他意图返回 confidence < 0.5
- 执行动作必须有 target 字段
`

// ─── 习惯解析系统提示词 ─────────────────────────────────────────

const HABIT_SYSTEM_PROMPT = (now: Date) => `
你是 Lifeware 习惯意图解析器。将用户的自然语言输入解析为习惯相关结构化意图。

当前时间：${now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', dateStyle: 'full', timeStyle: 'short' })}
时区：Asia/Shanghai (UTC+8)

支持的动作类型：

1. 创建习惯：
{
  "targetDomain": "habits",
  "action": "createHabit",
  "fields": {
    "title": "string",
    "defaultTime": "HH:MM（24小时制，如 22:00、07:30）",
    "defaultDuration": "整数分钟数（如 30、60、90）",
    "trackable": "boolean",
    "frequencyType": "daily | weekly | custom",
    "daysOfWeek": "number[]（0=日，6=六，可选，weekly/custom 时必填）"
  },
  "confidence": 0-1
}

格式规则（严格遵守）：
- defaultTime 必须是 "HH:MM" 格式的24小时制字符串
- defaultDuration 必须是整数分钟数
- 时长转换：半小时/30分钟 → 30，1小时 → 60，1个半小时/90分钟 → 90，2小时 → 120
- 时间转换：晚上10点 → "22:00"，下午3点半 → "15:30"，上午9点 → "09:00"，中午12点 → "12:00"，凌晨2点 → "02:00"

推断规则：
- "添加一个晚上读书的习惯，晚上22:00开始，半小时" → createHabit, title="读书", defaultTime="22:00", defaultDuration=30, trackable=true, frequencyType="daily"
- "每天早上7点运动1小时" → createHabit, title="运动", defaultTime="07:00", defaultDuration=60, trackable=true, frequencyType="daily"
- "午餐12点，1小时" → createHabit, title="午餐", defaultTime="12:00", defaultDuration=60, trackable=false（用餐关键词）, frequencyType="daily"
- "工作日晚上10点复盘15分钟" → createHabit, title="复盘", defaultTime="22:00", defaultDuration=15, trackable=true, frequencyType="weekly", daysOfWeek=[1,2,3,4,5]
- 用餐/睡眠/午休类习惯 → trackable=false
- 运动冥想阅读学习类 → trackable=true
- "工作日" → daysOfWeek=[1,2,3,4,5]
- "周末" → daysOfWeek=[0,6]
- 只处理习惯相关意图，其他意图返回 confidence < 0.5
`

// ─── 多任务系统提示词 ──────────────────────────────────────────

const MULTI_TASK_PROMPT = (now: Date) => `
你是 Lifeware 时间盒意图解析器。将用户的自然语言输入解析为结构化意图。

当前时间：${now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', dateStyle: 'full', timeStyle: 'short' })}
时区：Asia/Shanghai (UTC+8)

用户可能一次性输入多个时间盒任务。请识别并拆分为独立的任务列表。

输出 JSON 格式：
{
  "tasks": [
    {
      "title": "string",
      "startTime": "ISO 8601（含时区，如 2026-05-04T09:00:00+08:00）",
      "duration": number（分钟）,
      "confidence": 0-1,
      "incomplete": false
    }
  ]
}

识别规则：
- 时间关键词（上午/下午/晚上/明天/今天/X点）通常标志新任务的开始
- 常见分隔符（分号、逗号、句号、换行）为辅助线索，但不作为唯一依据
- 语义分段优于分隔符：通过上下文判断任务边界
- 每个任务独立提取标题、开始时间、持续时长
- 无法提取完整信息的任务标记 incomplete: true，设置 confidence < 0.5
- "今天" → ${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}
- "2小时" → 120 分钟，"1个半小时" → 90 分钟
- "上午9点" → 当天 09:00，"下午3点" → 当天 15:00
- 只处理时间盒相关意图，不相关的输入返回空 tasks 数组
- 只有一个任务也返回 tasks 数组（单个元素）

模糊时间默认值（[023-01+] 关键）：
当用户给出「上午/下午/晚上/中午/凌晨」但**未带具体数字**时，按以下默认值填充 startTime 与 duration：
- "上午" → 当天 09:00，duration = 120 分钟（即 09:00-11:00）
- "下午" → 当天 14:00，duration = 120 分钟（即 14:00-16:00）
- "晚上" → 当天 19:00，duration = 120 分钟（即 19:00-21:00）
- "中午" → 当天 12:00，duration = 60 分钟（即 12:00-13:00）
- "凌晨" → 当天 02:00，duration = 60 分钟（即 02:00-03:00）

无数字的模糊词必须给出上述默认 startTime + duration（**不允许**返回 startTime=null 或 incomplete=true）。

标题规则（重要）：
- 标题可包含空格，如「OKR 季度计划」「带孩子出去玩」是单个任务的标题
- 仅以「时间关键词 / 分隔符」断句，绝不要按空格切分标题
- 分隔符优先级：全角分号"；" > 半角分号";" > 换行 > 半角逗号","

示例：
输入："上午10:30-12:30 OKR 季度计划"
输出：{"tasks":[{"title":"OKR 季度计划",...}]}
说明：标题「OKR 季度计划」含空格，是单个任务。

输入："上午10:30-12:30 OKR 季度计划；下午16:00-18:00 带孩子出去玩"
输出：两条任务，全角分号分隔。

输入："上午完成OKR计划"
输出：{"tasks":[{"title":"完成OKR计划","startTime":"<当天>T09:00:00+08:00","endTime":"<当天>T11:00:00+08:00","duration":120,"confidence":0.85}]}
说明："上午"无具体数字 → 默认 09:00-11:00；title 包含"完成"动作词也保留。

输入："10:30-12:30 完成OKR计划"
输出：{"tasks":[{"title":"完成OKR计划","startTime":"<当天>T10:30:00+08:00","endTime":"<当天>T12:30:00+08:00","duration":120,"confidence":0.92}]}
说明：时间区间显式 → 用区间端点；标题"完成OKR计划"含空格不拆分。
`

// ─── 返回类型 ────────────────────────────────────────────────────

export interface AIParserResult {
  success: boolean
  intent?: StructuredIntent
  error?: string
}

export interface MultiTaskParserResult {
  success: boolean
  intents: StructuredIntent[]
  error?: string
}

export interface BatchItemResult {
  index: number
  title: string
  timeboxId?: string
  error?: string
  warning?: string
  needsConfirmation?: boolean
}

export interface BatchIntentResult {
  results: BatchItemResult[]
}

// ─── LLM 响应中间类型 ────────────────────────────────────────────

interface LLMIntentResponse {
  targetDomain: string
  action: string
  fields: Record<string, unknown>
  confidence: number
  pathType?: string
}

// ─── 核心解析函数 ─────────────────────────────────────────────────

/**
 * 使用 AI 将自然语言输入解析为 StructuredIntent
 *
 * @param rawInput     - 用户原始自然语言输入
 * @param intentionId  - 关联的 Intention 对象 ID
 * @param aiRuntime    - AI 运行时实例
 * @param extraContext - 可选的额外上下文文本，注入系统提示词以辅助解析
 * @returns 解析结果，成功时包含 intent，失败时包含 error
 */
export async function parseWithAI(
  rawInput: string,
  intentionId: USOM_ID,
  aiRuntime: AIRuntime,
  extraContext?: string,
): Promise<AIParserResult> {
  try {
    // 构建动态路由上下文（替换硬编码 domain prompt）
    const routingActions = buildRoutingContext()
    const routingText = formatRoutingContextForPrompt(routingActions)

    const now = new Date()
    const systemPrompt = `你是 Lifeware 意图解析器。根据用户输入，判断目标域和动作。

路由规则：
- 用户说"打开XX页面" "进入XX管理" "XX设置" → view_route（页面导航）
- 用户说"看看XX" "有哪些XX" "统计XX" "查一下XX" → query（对话内查询）
- 模糊情况默认走 query（用户可后续说"打开详细页面"切换到 view_route）
- "创建" "新增" "修改" "删除" → contract（变更操作）
- "帮我安排" "生成" "规划" → generative（AI生成）

可用动作列表：
${routingText}
${extraContext ? `\n额外上下文：\n${extraContext}\n` : ''}

当前时间：${now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}

输出 JSON 格式：
{
  "targetDomain": "域名",
  "action": "动作名",
  "pathType": "contract|generative|query",
  "fields": {},
  "confidence": 0.0-1.0
}`

    // 1. 调用 AIRuntime
    const response = await aiRuntime.generate({
      domainId: 'system',
      action: 'parseIntent',
      systemPrompt,
      messages: [{ role: 'user', content: rawInput }],
      taskType: 'intent_routing',
      temperature: 0.3,
    })

    const content = response.content
    if (!content) {
      return {
        success: false,
        error: 'LLM 返回内容为空，请重试或使用表单模式',
      }
    }

    // 2. 提取 JSON（content 可能是对象或字符串）
    const jsonStr = typeof content === 'string' ? extractJSON(content) : JSON.stringify(content)

    let parsed: LLMIntentResponse
    try {
      parsed = JSON.parse(jsonStr) as LLMIntentResponse
    } catch {
      return {
        success: false,
        error: `无法解析 JSON 响应，请重试或使用表单模式。原始内容：${(content as any)?.slice(0, 100) ?? ''}`,
      }
    }

    // 3. 验证必需字段
    const validationError = validateResponse(parsed)
    if (validationError) {
      return {
        success: false,
        error: validationError,
      }
    }

    // 4. 检查置信度
    if (parsed.confidence < 0.5) {
      return {
        success: false,
        error: `AI 置信度过低（${parsed.confidence.toFixed(2)}），建议使用表单模式输入`,
      }
    }

    // 5. 补全 endTime（LLM 通常返回 duration 而非 endTime）
    const fields = { ...parsed.fields }
    if (!fields.endTime && fields.startTime && fields.duration) {
      const start = new Date(fields.startTime as string)
      start.setMinutes(start.getMinutes() + Number(fields.duration))
      fields.endTime = start.toISOString()
    }

    // 6. 构建 StructuredIntent 并返回（新增 pathType）
    const intent: StructuredIntent = {
      id: generateUUID(),
      intentionId,
      targetDomain: parsed.targetDomain,
      action: parsed.action,
      fields,
      confidence: parsed.confidence,
      resolvedBy: 'ai',
      pathType: parsed.pathType as StructuredIntent['pathType'],
      createdAt: new Date().toISOString() as Timestamp,
    }

    return { success: true, intent }
  } catch (err) {
    const message =
      err instanceof Error ? err.message : '未知错误'
    return {
      success: false,
      error: `AI 解析失败：${message}`,
    }
  }
}

// ─── 辅助函数 ─────────────────────────────────────────────────────

/**
 * 从 LLM 响应内容中提取 JSON 字符串
 * 支持纯 JSON 和 markdown 代码块包裹的 JSON
 */
function extractJSON(content: string): string {
  const trimmed = content.trim()

  // 尝试匹配 markdown 代码块 ```json ... ```
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/)
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim()
  }

  // 尝试匹配直接的花括号包裹
  const braceMatch = trimmed.match(/\{[\s\S]*\}/)
  if (braceMatch) {
    return braceMatch[0]
  }

  // 原样返回，后续 JSON.parse 会报错
  return trimmed
}

/**
 * 验证 LLM 返回的响应结构是否完整
 */
function validateResponse(parsed: LLMIntentResponse): string | null {
  if (!parsed.targetDomain) {
    return 'AI 响应缺少 targetDomain 字段，请重试或使用表单模式'
  }

  if (!parsed.action) {
    return 'AI 响应缺少 action 字段，请重试或使用表单模式'
  }

  if (typeof parsed.confidence !== 'number' || parsed.confidence < 0 || parsed.confidence > 1) {
    return 'AI 响应的 confidence 字段无效，请重试或使用表单模式'
  }

  if (!parsed.fields || typeof parsed.fields !== 'object') {
    return 'AI 响应缺少 fields 字段，请重试或使用表单模式'
  }

  return null
}

// ─── 多任务 LLM 响应类型 ─────────────────────────────────────────

interface LLMMultiTaskResponse {
  tasks: Array<{
    title: string
    startTime?: string | null
    endTime?: string | null
    duration?: number | null
    confidence: number
    incomplete?: boolean
  }>
}

// ─── 多任务解析函数 ──────────────────────────────────────────────

/**
 * 使用 AI 解析自然语言输入中的多个时间盒任务。
 *
 * 返回 StructuredIntent 数组，每个对应一个独立的时间盒创建意图。
 * 过滤掉标记为 incomplete 或 confidence < 0.5 的任务。
 */
export async function parseMultiTask(
  rawInput: string,
  intentionId: USOM_ID,
  aiRuntime: AIRuntime,
): Promise<MultiTaskParserResult> {
  try {
    const response = await aiRuntime.generate({
      domainId: 'timebox',
      action: 'parseMultiTask',
      systemPrompt: MULTI_TASK_PROMPT(new Date()),
      messages: [{ role: 'user', content: rawInput }],
      taskType: 'field_extraction',
      temperature: 0.3,
    })

    const content = response.content
    if (!content) {
      return { success: false, intents: [], error: 'LLM 返回内容为空' }
    }

    const jsonStr = typeof content === 'string' ? extractJSON(content) : JSON.stringify(content)
    let parsed: LLMMultiTaskResponse
    try {
      parsed = JSON.parse(jsonStr) as LLMMultiTaskResponse
    } catch {
      return { success: false, intents: [], error: '无法解析批量任务 JSON 响应' }
    }

    if (!Array.isArray(parsed.tasks) || parsed.tasks.length === 0) {
      return { success: false, intents: [], error: '未识别到有效的时间盒任务，请重新描述' }
    }

    const intents: StructuredIntent[] = []
    for (const task of parsed.tasks) {
      // 跳过不完整的任务
      if (task.incomplete || task.confidence < 0.5) continue
      if (!task.title || !task.startTime) continue

      // [023-01+ v2] RC-2：duration 不再必需。
      //   显式区间场景（如"21:00-23:00 外出看电影"）LLM 常返回 startTime+endTime
      //   但漏掉 duration —— 之前 filter `!task.duration` 直接丢弃 → intents 空。
      //   现在：缺 duration 时从 (endTime - startTime) 反推（分钟）。
      let duration: number
      if (task.duration) {
        duration = task.duration
      } else if (task.endTime) {
        duration = Math.round(
          (new Date(task.endTime).getTime() - new Date(task.startTime).getTime()) / 60000,
        )
      } else {
        // 既无 duration 又无 endTime：无法确定时长，跳过
        continue
      }
      if (!Number.isFinite(duration) || duration <= 0) continue

      // 计算 endTime
      const start = new Date(task.startTime)
      start.setMinutes(start.getMinutes() + duration)
      const endTime = start.toISOString()

      intents.push({
        id: generateUUID(),
        intentionId,
        targetDomain: 'timebox',
        action: 'create_timebox',
        fields: {
          title: task.title,
          startTime: task.startTime,
          duration,
          endTime,
        },
        confidence: task.confidence,
        resolvedBy: 'ai',
        createdAt: new Date().toISOString() as Timestamp,
      })
    }

    if (intents.length === 0) {
      return { success: false, intents: [], error: '所有子任务信息不完整，请单独逐一创建' }
    }

    return { success: true, intents }
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误'
    return { success: false, intents: [], error: `批量解析失败：${message}` }
  }
}

/**
 * 生成 UUID v4
 */
function generateUUID(): string {
  return crypto.randomUUID()
}

// ─── 行程解析系统提示词 ─────────────────────────────────────────

/**
 * [026] A2.1 行程意图解析系统提示词。
 *
 * 输出结构（JSON）：
 * {
 *   "drafts": [
 *     {
 *       "title": "string",
 *       "startTime": "ISO 8601（含时区，如 2026-07-15T14:00:00+08:00）",
 *       "durationMin": number（分钟）,
 *       "people": "string[]（@ 提取的关系人）",
 *       "confidence": 0-1
 *     }
 *   ]
 * }
 *
 * 关键约束：
 * - 多记录分隔符：全角"；" / 半角";"（与 MULTI_TASK_PROMPT 保持一致）
 * - 关系人提取：@ 前导（"@张三" → people=["张三"]）
 * - 不确定时长时使用 60 分钟作为默认（与行程常用时长对齐）
 */
const ITINERARY_PARSE_PROMPT = (now: Date) => `
你是 Lifeware 行程意图解析器。将用户的自然语言输入解析为结构化的行程列表。

当前时间：${now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', dateStyle: 'full', timeStyle: 'short' })}
时区：Asia/Shanghai (UTC+8)

支持的动作：仅解析行程相关输入。其他意图返回空 drafts 数组 + confidence < 0.5。

输出 JSON 格式：
{
  "drafts": [
    {
      "title": "string",
      "startTime": "ISO 8601（含时区，如 2026-07-15T14:00:00+08:00）",
      "durationMin": number（分钟）,
      "people": "string[]（@ 提取的关系人，可空数组）",
      "confidence": 0-1
    }
  ]
}

解析规则：

1. 多记录分隔符
   - 全角分号"；"和半角分号";"都作为行程分隔符
   - 优先级：全角"；" > 半角";" > 换行
   - 没有分隔符 → 单条 draft

2. 关系人提取（[026] D1=A 关系人纯文本）
   - "@" 前导的名称进入 people 数组
   - 示例："下周三19:00 @张三 吃饭" → people=["张三"]
   - 多个 @："@张三 @李四 开会" → people=["张三", "李四"]
   - 没有 @ → people=[]

3. 时间解析
   - "今天" → ${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}
   - "明天" → 日期 +1
   - "下周三" → 下个周三（Asia/Shanghai 时区）
   - "下午2点" → 14:00
   - "上午9点" → 09:00
   - "晚上7点" → 19:00
   - "7月15日下午2点" → 2026-07-15T14:00:00+08:00
   - 无具体时间时使用上午 9:00 作为默认 startTime

4. 时长推断
   - "1小时" → 60
   - "半小时" → 30
   - "2小时" → 120
   - "看牙医" → 60（典型时长）
   - "吃饭" → 90
   - "开会" → 60
   - 缺省 → 60

5. 标题规则
   - 移除 @ 关系人部分再取标题
   - "下周三19:00 @张三 吃饭" → title="吃饭"
   - "7月15日下午2点看牙医" → title="看牙医"
   - 含空格不拆分（"OKR 季度评审"是单个 title）

6. confidence
   - 信息完整：>= 0.85
   - 缺时间或缺时长：0.6-0.8
   - 无关输入：< 0.5

示例：
输入："7月15日下午2点看牙医"
输出：{"drafts":[{"title":"看牙医","startTime":"2026-07-15T14:00:00+08:00","durationMin":60,"people":[],"confidence":0.9}]}

输入："下周三19:00 @张三 吃饭；下周五15:00 @李四 开会"
输出：{"drafts":[
  {"title":"吃饭","startTime":"<下周三>T19:00:00+08:00","durationMin":90,"people":["张三"],"confidence":0.92},
  {"title":"开会","startTime":"<下周五>T15:00:00+08:00","durationMin":60,"people":["李四"],"confidence":0.9}
]}

输入："和家人吃晚饭"
输出：{"drafts":[{"title":"吃晚饭","startTime":"<今天>T19:00:00+08:00","durationMin":90,"people":["家人"],"confidence":0.7}]}
说明："和家人"作为关系人提取——但 @ 前缀更明确，没有 @ 时不强制提取。
本例应返回 people=[]。
`

// ─── 行程解析函数 ──────────────────────────────────────────────

/**
 * [026] A2.1 使用 AI 解析自然语言输入为行程 drafts。
 *
 * 与 parseMultiTask 行为相似但输出结构不同：
 *  - parseMultiTask 返回 StructuredIntent 数组（timebox 域）
 *  - parseItineraryWithAI 返回 { drafts, success, error? }（行程域，
 *    供 parseItineraryIntentOnly 转成最终对外契约）
 *
 * 解析容错：缺字段的 draft 会被过滤，最终为空数组时返回 success=false。
 */
export interface ItineraryDraft {
  title: string
  startTime: string
  durationMin: number
  people: string[]
}

export interface ItineraryParseResult {
  success: boolean
  drafts: ItineraryDraft[]
  error?: string
}

interface LLMItineraryResponse {
  drafts: Array<{
    title: string
    startTime: string
    durationMin: number
    people?: string[]
    confidence: number
  }>
}

export async function parseItineraryWithAI(
  rawInput: string,
  aiRuntime: AIRuntime,
): Promise<ItineraryParseResult> {
  try {
    const response = await aiRuntime.generate({
      domainId: 'timebox',
      action: 'parseItineraryIntent',
      systemPrompt: ITINERARY_PARSE_PROMPT(new Date()),
      messages: [{ role: 'user', content: rawInput }],
      taskType: 'field_extraction',
      temperature: 0.3,
    })

    const content = response.content
    if (!content) {
      return { success: false, drafts: [], error: 'LLM 返回内容为空' }
    }

    const jsonStr = typeof content === 'string' ? extractJSON(content) : JSON.stringify(content)
    let parsed: LLMItineraryResponse
    try {
      parsed = JSON.parse(jsonStr) as LLMItineraryResponse
    } catch {
      return { success: false, drafts: [], error: '无法解析行程 JSON 响应' }
    }

    if (!Array.isArray(parsed.drafts) || parsed.drafts.length === 0) {
      return { success: false, drafts: [], error: '未识别到有效的行程' }
    }

    const drafts: ItineraryDraft[] = []
    for (const d of parsed.drafts) {
      if (!d.title || !d.startTime) continue
      if (typeof d.durationMin !== 'number' || d.durationMin <= 0) continue
      drafts.push({
        title: d.title,
        startTime: d.startTime,
        durationMin: d.durationMin,
        people: Array.isArray(d.people) ? d.people : [],
      })
    }

    if (drafts.length === 0) {
      return { success: false, drafts: [], error: '所有行程信息不完整，请补充时间/时长' }
    }

    return { success: true, drafts }
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误'
    return { success: false, drafts: [], error: `行程解析失败：${message}` }
  }
}

// ─── 习惯意图解析 ──────────────────────────────────────────────

/**
 * 使用 AI 解析自然语言输入为习惯相关 StructuredIntent
 * 自动补全 earliestTime/latestStartTime/minDuration/trackable
 */
export async function parseHabitWithAI(
  rawInput: string,
  intentionId: USOM_ID,
  aiRuntime: AIRuntime,
): Promise<AIParserResult> {
  try {
    const response = await aiRuntime.generate({
      domainId: 'habits',
      action: 'parseHabitIntent',
      systemPrompt: HABIT_SYSTEM_PROMPT(new Date()),
      messages: [{ role: 'user', content: rawInput }],
      taskType: 'field_extraction',
      temperature: 0.3,
    })

    const content = response.content
    if (!content) {
      return { success: false, error: 'LLM 返回内容为空' }
    }

    const jsonStr = typeof content === 'string' ? extractJSON(content) : JSON.stringify(content)
    let parsed: LLMIntentResponse
    try {
      parsed = JSON.parse(jsonStr) as LLMIntentResponse
    } catch {
      return { success: false, error: '无法解析 JSON 响应' }
    }

    const validationError = validateResponse(parsed)
    if (validationError) {
      return { success: false, error: validationError }
    }

    if (parsed.confidence < 0.5) {
      return { success: false, error: `AI 置信度过低（${parsed.confidence.toFixed(2)}）` }
    }

    const fields = { ...parsed.fields }

    // 对 createHabit 自动补全默认值
    if (parsed.action === 'createHabit' && fields.defaultTime && fields.defaultDuration) {
      const defaults = inferHabitDefaults({
        defaultTime: fields.defaultTime as string,
        defaultDuration: fields.defaultDuration as number,
        title: fields.title as string | undefined,
      })

      if (!fields.earliestTime) fields.earliestTime = defaults.earliestTime
      if (!fields.latestStartTime) fields.latestStartTime = defaults.latestStartTime
      if (!fields.minDuration) fields.minDuration = defaults.minDuration
      if (fields.trackable === undefined) fields.trackable = defaults.trackable

      // 补全 startDate
      if (!fields.startDate) {
        fields.startDate = new Date().toISOString().slice(0, 10)
      }
    }

    const intent: StructuredIntent = {
      id: generateUUID(),
      intentionId,
      targetDomain: parsed.targetDomain,
      action: parsed.action,
      fields,
      confidence: parsed.confidence,
      resolvedBy: 'ai',
      createdAt: new Date().toISOString() as Timestamp,
    }

    return { success: true, intent }
  } catch (err) {
    const message = err instanceof Error ? err.message : '未知错误'
    return { success: false, error: `AI 习惯解析失败：${message}` }
  }
}
