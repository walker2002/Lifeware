/**
 * @file load-templates
 * @brief 服务端预取 TimeboxTemplate（lib/server 目录约定：仅 server 调用）
 *
 * 从 app/timebox-templates/page.tsx 抽出。
 */
import { TimeboxTemplateRepository } from '@/lib/db/repositories/timebox-template'
import type { TimeboxTemplate } from '@/lib/db/repositories/timebox-template'

/** MVP 固定用户 ID（与 app/actions 现状一致） */
const MVP_USER_ID = '00000000-0000-0000-0000-000000000001'

/**
 * 预取当前用户全部模板（按 updatedAt 排序，repo 内置）
 * @returns TimeboxTemplate 列表
 */
export async function loadTimeboxTemplates(): Promise<TimeboxTemplate[]> {
  const repo = new TimeboxTemplateRepository()
  return repo.findByUser(MVP_USER_ID)
}
