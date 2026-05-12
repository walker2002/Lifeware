export interface TemplateTask {
  title: string
  estimatedDuration?: number
  priority?: string
  energyRequired?: string
  depth: number
  children: TemplateTask[]
}

export interface ParsedTemplate {
  projectName?: string
  tasks: Array<{ title: string; level: number }>
}

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
