/**
 * @file habit-messages
 * @brief 习惯模块消息常量
 * 
 * 定义习惯模块的错误提示和用户可见文案
 */

/** 习惯模块的错误提示文案 */
export const HABIT_ERRORS = {
  /** 获取习惯列表失败 */
  FETCH_FAILED: '获取习惯列表失败',
  /** 创建习惯失败 */
  CREATE_FAILED: '创建习惯失败',
  /** 更新习惯失败 */
  UPDATE_FAILED: '更新习惯失败',
  /** 删除习惯失败 */
  DELETE_FAILED: '删除习惯失败',
  /** 更新习惯状态失败 */
  STATUS_UPDATE_FAILED: '更新习惯状态失败',
  /** 检查引用失败 */
  CHECK_REFS_FAILED: '检查引用失败',
  /** 解析失败 */
  PARSE_FAILED: '解析失败',
  /** 意图解析失败 */
  INTENT_PARSE_FAILED: '意图解析失败，请重试',
} as const

/** 习惯模块的用户可见文案 */
export const HABIT_USER_FACING = {
  /** 意图未识别 */
  INTENT_UNRECOGNIZED: (error?: string) =>
    `未能识别习惯创建意图：${error ?? '未知原因'}。请尝试更具体的描述，或使用左侧「成长领域」→「创建一个新习惯」。`,
  /** 意图已识别 */
  INTENT_RECOGNIZED: '已识别习惯创建意图，请在右侧面板中确认并创建。',
} as const
