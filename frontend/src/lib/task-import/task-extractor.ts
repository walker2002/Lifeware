/**
 * @file task-extractor
 * @brief 任务提取工具
 * 
 * 从 Markdown 模板提取任务结构，支持规则解析和 LLM 辅助
 */

/**
 * 导入预览结构
 */
export interface ImportPreview {
  /** 项目信息 */
  project?: {
    /** 项目名称 */
    name: string
    /** 优先级 */
    priority?: string
    /** 默认最早时间 */
    defaultEarliestTime?: string
    /** 默认最晚时间 */
    defaultLatestStartTime?: string
    /** 描述 */
    description?: string
  }
  /** 任务列表 */
  tasks: Array<{
    /** 临时 ID */
    tempId: string
    /** 任务标题 */
    title: string
    /** 层级深度 */
    depth: number
    /** 父任务临时 ID */
    parentTempId?: string
    /** 预估时长 */
    estimatedDuration?: number
    /** 优先级 */
    priority?: string
    /** 所需能量 */
    energyRequired?: string
    /** 频率类型 */
    frequencyType?: string
  }>
}

/**
 * 从 Markdown 模板文本提取结构化导入预览。
 * MVP 阶段使用纯规则解析；生产环境可接入 LLM。
 * @param markdown - Markdown 字符串
 * @returns 导入预览结构
 */
export async function extractTasks(markdown: string): Promise<ImportPreview> {
  const lines = markdown.split('\n')
  let project: ImportPreview['project'] | undefined
  const tasks: ImportPreview['tasks'] = []
  let counter = 0

  let lastTopLevelId: string | undefined

  for (const line of lines) {
    // 提取项目信息
    const projectMatch = line.match(/^##\s*项目:\s*(.+)/)
    if (projectMatch) {
      project = { name: projectMatch[1].trim() }
      continue
    }

    // 提取项目属性
    const priorityMatch = line.match(/^-\s*优先级:\s*(.+)/)
    if (priorityMatch && project) {
      project.priority = priorityMatch[1].trim()
      continue
    }
    const timeMatch = line.match(/^-\s*默认最早时间:\s*(.+)/)
    if (timeMatch && project) {
      project.defaultEarliestTime = timeMatch[1].trim()
      continue
    }
    const lateMatch = line.match(/^-\s*默认最晚时间:\s*(.+)/)
    if (lateMatch && project) {
      project.defaultLatestStartTime = lateMatch[1].trim()
      continue
    }

    // 提取任务标题
    const headingMatch = line.match(/^(#{1,2})\s+(.+)/)
    if (headingMatch) {
      const level = headingMatch[1].length
      const title = headingMatch[2].trim()
      if (title.startsWith('项目')) continue

      counter++
      const tempId = `t${counter}`
      const depth = level === 1 ? 0 : 1
      const task: ImportPreview['tasks'][0] = { tempId, title, depth }

      if (depth === 0) {
        lastTopLevelId = tempId
      } else if (depth === 1 && lastTopLevelId) {
        task.parentTempId = lastTopLevelId
      }

      // 解析下一行的时长
      tasks.push(task)
    }

    // 提取任务属性
    const durationMatch = line.match(/^\s*-\s*预估时长:\s*(\d+)/)
    if (durationMatch && tasks.length > 0) {
      tasks[tasks.length - 1].estimatedDuration = Number(durationMatch[1])
    }
    const taskPriorityMatch = line.match(/^\s*-\s*优先级:\s*(.+)/)
    if (taskPriorityMatch && tasks.length > 0) {
      tasks[tasks.length - 1].priority = taskPriorityMatch[1].trim()
    }
    const energyMatch = line.match(/^\s*-\s*所需能量:\s*(.+)/)
    if (energyMatch && tasks.length > 0) {
      tasks[tasks.length - 1].energyRequired = energyMatch[1].trim()
    }
  }

  return { project, tasks }
}

/**
 * Markdown 规则解析无法满足时调用 LLM 提取。
 * 需要 OPENAI_API_KEY 环境变量。
 * @param markdown - Markdown 字符串
 * @returns 导入预览结构
 */
export async function extractTasksWithLLM(markdown: string): Promise<ImportPreview> {
  const OpenAI = (await import('openai')).default
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

  const prompt = `你是一个任务管理助手。请从以下 Markdown 模板文本中提取项目信息和任务结构。

返回严格的 JSON 格式：
{
  "project": { "name": "项目名", "priority": "high|medium|low", "defaultEarliestTime": "HH:MM", "defaultLatestStartTime": "HH:MM", "description": "描述" },
  "tasks": [
    { "tempId": "t1", "title": "任务标题", "depth": 0, "estimatedDuration": 120, "priority": "high", "energyRequired": "high", "frequencyType": "once" }
  ]
}

规则：
- depth: 0=顶级任务（# 开头），1=子任务（## 开头）
- 推断子任务的父任务（连续出现的子任务属于最近的顶级任务）
- 缺失字段用 null

模板文本：
${markdown}`

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{ role: 'user', content: prompt }],
    response_format: { type: 'json_object' },
    temperature: 0.1,
  })

  const text = response.choices[0]?.message?.content
  if (!text) throw new Error('LLM 返回空响应')
  return JSON.parse(text) as ImportPreview
}
