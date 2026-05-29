// Memory L2 Episode Layer — 摘要生成 + 标题生成
import type { AIRuntime } from '../../index'

export interface EpisodeData {
  userId: string
  sessionId: string
  domainId: string
  action: string
  messages: Array<{ role: string; content: string }>
  metadata?: Record<string, unknown>
  generateTitle?: boolean
}

export interface EpisodeResult {
  summary: string
  suggestedTitle?: string
  metadata: Record<string, unknown>
}

export interface MemoryL2Episode {
  generateSummary(data: EpisodeData, aiRuntime: AIRuntime): Promise<EpisodeResult>
}

export function createMemoryL2(): MemoryL2Episode {
  return {
    async generateSummary(data, aiRuntime) {
      const messageSummary = data.messages
        .map(m => `${m.role}: ${typeof m.content === 'string' ? m.content.slice(0, 200) : JSON.stringify(m.content).slice(0, 200)}`)
        .join('\n')

      const hashedSessionId = data.sessionId.slice(0, 8)

      const systemPrompt = data.generateTitle
        ? `你是一个对话分析器。根据对话历史完成两项任务：
1. 生成一句话摘要（不超过 50 字）
2. 生成对话标题（不超过 15 个字），标题应概括用户的核心意图

请以 JSON 格式回复：
{
  "summary": "摘要内容",
  "suggestedTitle": "标题"
}

只输出 JSON，不要其他内容。`
        : '你是一个对话摘要生成器。根据以下对话历史，生成一句话摘要（不超过 50 字）。只输出摘要文本，不要其他内容。'

      const response = await aiRuntime.generate({
        domainId: data.domainId,
        action: 'generateSummary',
        systemPrompt,
        messages: [{ role: 'user', content: messageSummary }],
        taskType: 'summary',
        temperature: 0.3,
      })

      const rawContent = typeof response.content === 'string'
        ? response.content.trim()
        : JSON.stringify(response.content)

      let summary: string
      let suggestedTitle: string | undefined

      if (data.generateTitle) {
        try {
          const parsed = JSON.parse(rawContent)
          summary = parsed.summary || `${data.domainId}/${data.action} Session`
          suggestedTitle = parsed.suggestedTitle
        } catch {
          summary = rawContent
        }
      } else {
        summary = rawContent
      }

      return {
        summary: summary || `${data.domainId}/${data.action} Session ${hashedSessionId}`,
        suggestedTitle,
        metadata: {
          ...data.metadata,
          messageCount: data.messages.length,
          generateTitle: data.generateTitle ?? false,
          model: response.model,
        },
      }
    },
  }
}
