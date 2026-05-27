/** 习惯模块的错误提示文案 */

export const HABIT_ERRORS = {
  FETCH_FAILED: '获取习惯列表失败',
  CREATE_FAILED: '创建习惯失败',
  UPDATE_FAILED: '更新习惯失败',
  DELETE_FAILED: '删除习惯失败',
  STATUS_UPDATE_FAILED: '更新习惯状态失败',
  CHECK_REFS_FAILED: '检查引用失败',
  PARSE_FAILED: '解析失败',
  INTENT_PARSE_FAILED: '意图解析失败，请重试',
} as const

export const HABIT_USER_FACING = {
  INTENT_UNRECOGNIZED: (error?: string) =>
    `未能识别习惯创建意图：${error ?? '未知原因'}。请尝试更具体的描述，或使用左侧「成长领域」→「创建一个新习惯」。`,
  INTENT_RECOGNIZED: '已识别习惯创建意图，请在右侧面板中确认并创建。',
} as const
