// Memory L2 Episode Layer — 摘要生成
import type { AIRuntime } from '../../index'

export interface EpisodeData {
  userId: string
  sessionId: string
  domainId: string
  action: string
  messages: Array<{ role: string; content: string }>
  metadata?: Record<string, unknown>
}

export interface EpisodeResult {
  summary: string
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

      const response = await aiRuntime.generate({
        domainId: data.domainId,
        action: 'generateSummary',
        systemPrompt: '你是一个对话摘要生成器。根据以下对话历史，生成一句话摘要（不超过 50 字）。只输出摘要文本，不要其他内容。',
        messages: [{ role: 'user', content: messageSummary }],
        taskType: 'summary',
        temperature: 0.3,
      })

      const summary = typeof response.content === 'string'
        ? response.content.trim()
        : JSON.stringify(response.content)

      return {
        summary: summary || `${data.domainId}/${data.action} Session 摘要`,
        metadata: {
          ...data.metadata,
          messageCount: data.messages.length,
          model: response.model,
        },
      }
    },
  }
}
