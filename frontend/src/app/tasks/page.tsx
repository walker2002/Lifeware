/**
 * @file page
 * @brief /tasks 路由 — 任务树页面
 */

import { loadDomainManifest } from '@/domains/manifest-loader/loader'
import TaskTreePage from '@/domains/tasks/pages/TaskTreePage'

/** 从 manifest 提取页面标题 */
function getDomainTitle(): string {
  const result = loadDomainManifest('tasks')
  if (result.success) {
    return result.manifest.name
  }
  return '任务'
}

export default function TasksPage() {
  const title = getDomainTitle()
  return <TaskTreePage title={title} />
}
