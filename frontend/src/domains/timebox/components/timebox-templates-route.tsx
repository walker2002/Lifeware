/**
 * @file timebox-templates-route
 * @brief 时间盒模板配置独立路由 domain 入口（async server component，[023-02] 行列表 + 模板级星期）
 *
 * 从 app/timebox-templates/page.tsx 抽出。与 client wrapper pages/TimeboxTemplatesPage.tsx
 * （ActionView 嵌入用）区分：本组件=独立 /timebox-templates URL 的 server 入口。
 * 容器用 min-h-full（[023-02] Task 10.2）：避免内部 PageBanner + 网格的 flex stretch
 * 链把 h-screen 的 100vh 撑死。订阅源由编辑器懒加载，避免 page 耦合多域 repo。
 */
import { loadTimeboxTemplates } from '@/domains/timebox/lib/server/load-templates'
import { TimeboxTemplateEditor } from '@/domains/timebox/components/timebox-template-editor'

export async function TimeboxTemplatesRoute() {
  const templates = await loadTimeboxTemplates()
  return (
    <div className="min-h-full flex flex-col">
      <TimeboxTemplateEditor initialTemplates={templates} />
    </div>
  )
}
