/**
 * @file activity-recorder
 * @brief 活动记录 Server Action 模块
 * 
 * 提供用户活动记录功能
 */

'use server'

import { ActivityRepository, type RecordActivityInput } from '@/lib/db/repositories/activity.repository'

/** MVP 用户 ID（临时使用） */
const MVP_USER_ID = '00000000-0000-0000-0000-000000000001'

/**
 * 记录用户活动
 * 
 * @param input - 活动记录输入数据
 */
export async function recordActivity(input: RecordActivityInput): Promise<void> {
  try {
    const repo = new ActivityRepository()
    await repo.insert(MVP_USER_ID, input)
  } catch (err) {
    console.error('[recordActivity] 记录失败:', err)
  }
}
