import { describe, it, expect } from 'vitest'
import { projectToMarkdown, parseMarkdownHeadings } from '../template-markdown'

describe('projectToMarkdown', () => {
  it('应将项目和任务转为 Markdown 模板', () => {
    const result = projectToMarkdown(
      { name: '重构认证模块', priority: 'high' },
      [
        {
          title: '设计新API', estimatedDuration: 120, depth: 0, children: [
            { title: '写测试', estimatedDuration: 60, depth: 1, children: [] }
          ]
        },
      ]
    )
    expect(result).toContain('## 项目: 重构认证模块')
    expect(result).toContain('# 设计新API')
    expect(result).toContain('## 写测试')
    expect(result).toContain('- 优先级: high')
  })
})

describe('parseMarkdownHeadings', () => {
  it('应从模板 Markdown 提取项目名和任务标题', () => {
    const md = `## 项目: 测试项目\n# 任务1\n## 子任务1.1\n# 任务2`
    const result = parseMarkdownHeadings(md)
    expect(result.projectName).toBe('测试项目')
    expect(result.tasks).toHaveLength(3)
  })

  it('无项目标题时应返回 undefined projectName', () => {
    const md = `# 独立任务1\n# 独立任务2`
    const result = parseMarkdownHeadings(md)
    expect(result.projectName).toBeUndefined()
    expect(result.tasks).toHaveLength(2)
  })
})
