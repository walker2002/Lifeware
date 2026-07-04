/**
 * @file page
 * @brief 时间盒模板配置页（[023-02] 行列表 + 模板级星期）
 *
 * 服务端组件：拉取全部 TimeboxTemplate → 传递给客户端编辑器。
 * 订阅源由编辑器懒加载，避免 page 耦合多域 repo。
 * 外层容器用 min-h-full 替代 h-screen（[023-02] Task 10.2）：
 * 避免内部 PageBanner + 网格的 flex stretch 链把 h-screen 的 100vh 撑死。
 */
import { TimeboxTemplateRepository } from '@/lib/db/repositories/timebox-template'
import { TimeboxTemplateEditor } from '@/domains/timebox/components/timebox-template-editor'

export default async function TimeboxTemplatesPage() {
  const repo = new TimeboxTemplateRepository()
  const templates = await repo.findByUser('00000000-0000-0000-0000-000000000001') // MVP 固定用户

  return (
    <div className="min-h-full flex flex-col">
      <TimeboxTemplateEditor initialTemplates={templates} />
    </div>
  )
}