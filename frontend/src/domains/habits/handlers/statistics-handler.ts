import type { DomainHandler, QueryContext, QueryResult, GenerationRequest, GenerationResult } from '@/usom/types/process'
import type { AIRuntime } from '@/nexus/ai-runtime'

/**
 * 习惯统计分析 Handler。
 * 实现 onQuery hook，使用 AI Runtime 生成分析文本。
 */
export class HabitStatisticsHandler implements DomainHandler {
  async handle(_request: GenerationRequest): Promise<GenerationResult> {
    throw new Error('HabitStatisticsHandler does not support handle(). Use onQuery().')
  }

  async onGenerate(_request: GenerationRequest, _aiRuntime: AIRuntime): Promise<GenerationResult> {
    throw new Error('HabitStatisticsHandler does not support onGenerate(). Use onQuery().')
  }

  async onQuery(context: QueryContext, aiRuntime: AIRuntime): Promise<QueryResult> {
    const { habitLogs, habitStreaks } = context.contexts as {
      habitLogs: Array<{ habitId: string; date: string; completed: boolean }>
      habitStreaks: Array<{
        habitId: string
        title: string
        currentStreak: number
        longestStreak: number
        completionRate7d: number
      }>
    }

    const sessionInfo = context.sessionContext?.priorQueries?.length
      ? `\n\n上下文：用户之前已查询过习惯列表。`
      : ''

    const response = await aiRuntime.generate({
      domainId: 'habits',
      action: 'habit_statistics',
      systemPrompt: `你是 Lifeware 习惯追踪分析助手。根据用户的习惯日志和连续打卡数据，
生成简洁的分析报告。报告应包含：
1. 各习惯的当前状态（连续天数、7日完成率）
2. 值得关注的趋势（增长、下降、停滞）
3. 简短建议（如有明显问题）

数据：
${JSON.stringify({ habitLogs, habitStreaks }, null, 2)}${sessionInfo}`,
      messages: [{
        role: 'user',
        content: (context.intent.fields.question as string) ?? '分析我的习惯数据',
      }],
      taskType: 'content_generation',
      temperature: 0.3,
    })

    return {
      type: 'text',
      content: typeof response.content === 'string'
        ? response.content
        : JSON.stringify(response.content),
    }
  }
}
