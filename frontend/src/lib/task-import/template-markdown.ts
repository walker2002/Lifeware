/**
 * @file template-markdown
 * @brief 任务导入模板 Markdown 生成与解析
 * 
 * 提供项目任务模板的 Markdown 生成和标题解析功能
 */

/**
 * 模板任务结构
 */
export interface TemplateTask {
  /** 任务标题 */
  title: string
  /** 预估时长（分钟） */
  estimatedDuration?: number
  /** 优先级 */
  priority?: string
  /** 所需能量 */
  energyRequired?: string
  /** 层级深度 */
  depth: number
  /** 子任务列表 */
  children: TemplateTask[]
}

/**
 * 解析后的模板结构
 */
export interface ParsedTemplate {
  /** 项目名称 */
  projectName?: string
  /** 任务列表 */
  tasks: Array<{ title: string; level: number }>
}

/**
 * 将项目和任务转换为 Markdown 模板
 * @param project - 项目信息
 * @param tasks - 任务列表
 * @returns Markdown 字符串
 */
export function projectToMarkdown(
  project: { name: string; priority?: string; defaultEarliestTime?: string; defaultLatestStartTime?: string; description?: string },
  tasks: TemplateTask[]
): string {
  const lines: string[] = []
  lines.push('# 项目任务导入模板')
  lines.push('')
  lines.push(`## 项目: ${project.name}`)
  if (project.priority) lines.push(`- 优先级: ${project.priority}`)
  if (project.defaultEarliestTime) lines.push(`- 默认最早时间: ${project.defaultEarliestTime}`)
  if (project.defaultLatestStartTime) lines.push(`- 默认最晚时间: ${project.defaultLatestStartTime}`)
  if (project.description) lines.push(`- 描述: ${project.description}`)
  lines.push('')
  lines.push('---')
  lines.push('')
  for (const task of tasks) {
    renderTask(task, lines)
  }
  return lines.join('\n')
}

/**
 * 递归渲染任务到 Markdown 行
 * @param task - 任务对象
 * @param lines - 行数组（输出参数）
 */
function renderTask(task: TemplateTask, lines: string[]): void {
  const prefix = task.depth === 0 ? '# ' : '## '
  lines.push(`${prefix}${task.title}`)
  if (task.estimatedDuration) lines.push(`  - 预估时长: ${task.estimatedDuration}分钟`)
  if (task.priority) lines.push(`  - 优先级: ${task.priority}`)
  if (task.energyRequired) lines.push(`  - 所需能量: ${task.energyRequired}`)
  if (task.children.length > 0) {
    for (const child of task.children) {
      renderTask({ ...child, depth: task.depth + 1 }, lines)
    }
  }
}

/**
 * 解析 Markdown 中的标题
 * @param md - Markdown 字符串
 * @returns 解析后的模板结构
 */
export function parseMarkdownHeadings(md: string): ParsedTemplate {
  const lines = md.split('\n')
  let projectName: string | undefined
  const tasks: Array<{ title: string; level: number }> = []
  for (const line of lines) {
    const projectMatch = line.match(/^##\s*项目:\s*(.+)/)
    if (projectMatch) {
      projectName = projectMatch[1].trim()
      continue
    }
    const headingMatch = line.match(/^(#{1,2})\s+(.+)/)
    if (headingMatch) {
      const level = headingMatch[1].length
      const title = headingMatch[2].trim()
      if (!title.startsWith('项目')) {
        tasks.push({ title, level })
      }
    }
  }
  return { projectName, tasks }
}
