'use server'

import { ActivityRepository, type RecordActivityInput } from '@/lib/db/repositories/activity.repository'

const MVP_USER_ID = '00000000-0000-0000-0000-000000000001'

export async function recordActivity(input: RecordActivityInput): Promise<void> {
  try {
    const repo = new ActivityRepository()
    await repo.insert(MVP_USER_ID, input)
  } catch (err) {
    console.error('[recordActivity] 记录失败:', err)
  }
}
