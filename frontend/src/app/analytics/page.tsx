import { fetchActivityStats, fetchFrequentIntents } from '../actions/activity'

export default async function AnalyticsPage() {
  const [{ typeCounts, dailyCounts, sinceDays }, topIntents] = await Promise.all([
    fetchActivityStats(30),
    fetchFrequentIntents(20),
  ])

  const totalCount = typeCounts.reduce((sum, t) => sum + t.count, 0)
  const maxDaily = Math.max(...dailyCounts.map(d => d.count), 1)

  const ACTIVITY_TYPE_LABELS: Record<string, string> = {
    intent_execute: '意图执行',
    menu_click: '菜单点击',
    page_navigate: '页面导航',
    cnui_action: 'CNUI 操作',
  }

  return (
    <div className="min-h-screen bg-background text-ink p-8">
      <div className="mx-auto max-w-4xl">
        <h1 className="text-2xl font-bold mb-6">用户行为分析</h1>
        <p className="text-sm text-body/60 mb-8">过去 {sinceDays} 天共记录 {totalCount} 条行为数据</p>

        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">行为类型分布</h2>
          <div className="space-y-2">
            {typeCounts.map(tc => (
              <div key={tc.activityType} className="flex items-center gap-3">
                <span className="w-24 text-sm text-body/70">{ACTIVITY_TYPE_LABELS[tc.activityType] ?? tc.activityType}</span>
                <div className="flex-1 h-6 bg-surface-soft rounded overflow-hidden">
                  <div
                    className="h-full bg-primary/70 rounded"
                    style={{ width: `${totalCount > 0 ? (tc.count / totalCount) * 100 : 0}%` }}
                  />
                </div>
                <span className="w-12 text-sm text-right">{tc.count}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">每日活跃度</h2>
          <div className="flex items-end gap-1 h-32">
            {dailyCounts.map(dc => (
              <div
                key={dc.date}
                className="flex-1 bg-primary/50 rounded-t min-w-[4px]"
                style={{ height: `${(dc.count / maxDaily) * 100}%` }}
                title={`${dc.date}: ${dc.count}`}
              />
            ))}
          </div>
          {dailyCounts.length > 0 && (
            <div className="flex justify-between text-xs text-body/40 mt-1">
              <span>{dailyCounts[0]?.date}</span>
              <span>{dailyCounts[dailyCounts.length - 1]?.date}</span>
            </div>
          )}
        </section>

        <section className="mb-10">
          <h2 className="text-lg font-semibold mb-3">常用意图排行 (Top 20)</h2>
          <div className="space-y-1">
            {topIntents.map((intent, i) => (
              <div key={`${intent.targetDomain}:${intent.targetAction}`} className="flex items-center gap-3 text-sm">
                <span className="w-6 text-body/40 text-right">{i + 1}</span>
                <span className="w-20 text-body/60">{intent.targetDomain}</span>
                <span className="flex-1">{intent.label}</span>
                <span className="text-body/40">{intent.score.toFixed(1)}</span>
              </div>
            ))}
            {topIntents.length === 0 && (
              <p className="text-sm text-body/40">暂无数据</p>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}
