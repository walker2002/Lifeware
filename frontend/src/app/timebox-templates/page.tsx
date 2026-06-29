/**
 * @file page
 * @brief 时间盒模板配置页（[023] A2，配置类不走 Nexus）
 *
 * 服务端组件：拉取全部 TimeboxTemplate → 传递给客户端编辑器。
 * 订阅源由编辑器懒加载，避免 page 耦合多域 repo。
 */
import { TimeboxTemplateRepository } from '@/lib/db/repositories/timebox-template'
import { TimeboxTemplateEditor } from '@/domains/timebox/components/timebox-template-editor'

export default async function TimeboxTemplatesPage() {
  const repo = new TimeboxTemplateRepository()
  const templates = await repo.findByUser('00000000-0000-0000-0000-000000000001') // MVP 固定用户

  return (
    <div className="h-screen flex flex-col">
      <TimeboxTemplateEditor initialTemplates={templates} />
    </div>
  )
}