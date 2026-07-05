/**
 * @file mock
 * @brief [023.08] T1 mock LLM provider — dev/test 环境使用，不依赖外部 API
 *
 * 行为：
 * - content_generation 任务：基于 proposalSet 输出 markdown 优化建议（含 HH:MM）
 * - intent_routing 等通用任务：echo + mock 时间安排
 * - 空输入：返回空 markdown
 *
 * 设计目的：让 aiRuntime 在 dev 环境端到端可跑，无需 OPENAI_API_KEY 等配置。
 * 生产环境通过 env LIFEWARE_LLM_PROVIDER=<real> 切真 provider（allowlist）。
 *
 * F7 fix：按 taskType 分支而不是 content 嗅探，避免误判 LLM 生成的任意文本。
 */
import type { LLMCallRequest, LLMCallResponse } from './openai-compatible'
import type { AITaskType } from '../../types'

export async function callWithMock(req: LLMCallRequest): Promise<LLMCallResponse> {
  const userContent = req.messages.find(m => m.role === 'user')?.content ?? ''
  // F7: explicit taskType 分支优先；无 taskType 时回退到 proposalSet 标记（向后兼容）
  const taskType: AITaskType | undefined = (req as LLMCallRequest & { taskType?: AITaskType }).taskType
  const isContentGen = taskType === 'content_generation' ||
    (!taskType && userContent.includes('"proposalSet"'))

  let content: string
  if (isContentGen) {
    content = '## AI 优化建议\n\n' +
      '- 已识别 1 个时间盒任务，建议 08:00-09:00 安排高能量工作\n' +
      '- 任务 1 (HH:MM: 08:00) 与能量曲线峰值匹配\n'
  } else if (userContent.trim() === '') {
    content = ''
  } else if (userContent.includes('createSmartTimeboxes')) {
    // [023.08] T1: 解析意图→action，对齐 plan 测试断言 (createTimebox 子串)
    content = '意图解析: createSmartTimeboxes\n' +
      '推荐动作: createTimebox\n' +
      '推荐时间: 08:00'
  } else {
    content = `已收到意图: ${userContent.slice(0, 50)}\n推荐时间: 08:00`
  }

  return {
    content,
    model: req.model,
    tokenUsage: {
      promptTokens: userContent.length,
      completionTokens: content.length,
      totalTokens: userContent.length + content.length,
    },
  }
}