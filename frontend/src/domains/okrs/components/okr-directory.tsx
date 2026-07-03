/**
 * @file okr-directory
 * @brief OKR 工作台左侧目录（周期-目标二级树 + ⋯ 菜单 + 折叠/展开）
 *
 * 重构要点（[024] G1 + [024.1] T1 + [022.01] T4 + [022.01] T5）：
 *  - 顶层节点由 Cycle 驱动（不再是按 objective.period 派生的字符串分组）
 *  - 每个 cycle 下挂载 objectives.filter(o => o.cycleId === cycle.id)
 *  - 顶部筛选 tabs：[022.01] Task 4 改为 Cycle 状态（draft/not_started/in_progress/ended/reviewed）；
 *    筛选作用于 parent cycle 状态，voice D8：非匹配 cycle 不渲染（解决 (0) 空卡问题）
 *  - 周期 ⋯：[022.01] Task 5 集成 审核通过(draft) / 添加目标 / 结束周期(in_progress) / 复盘(ended) / 删除周期（有目标时禁用）
 *  - 目标 ⋯：[022.01] Phase 3 简化为仅「删除目标」（设置 discardedAt）；
 *    pause/resume/complete/archive 语义由 cycle 级操作承载
 *  - 周期折叠：[022.01] Phase 3 改为「cycle.status === 'in_progress'」展开，其余收起（不再依赖 objective.status）
 *
 * @remarks
 *  - 移除了 getPeriodGroupKey（旧实现用 objective.period 派生分组键；现在以 cycle 为权威）
 *  - 顶部按钮 +新建 → +OKR周期（onCreateCycleClick）
 *  - 列表区域单击目标行触发 onSelect(id)
 *  - [022.01] Task 4：filterObjectivesByCycleStatus 为导出 pure function，
 *    给 okr-workspace 复用 + 测试用例断言；cycles / objectives 同时按 cycle.status 过滤
 */

"use client"

import { useState } from "react"
import { ChevronDown, ChevronRight } from "lucide-react"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import {
  CycleApproveMenuItem,
  CycleEndMenuItem,
  CycleReviewMenuItem,
} from "./cycle-menu"
import type { Cycle, Objective } from "@/usom/types/objects"

type CycleStatus = Cycle["status"]
type CycleFilter = CycleStatus | "all"

interface OKRDirectoryProps {
  cycles: Cycle[]
  objectives: Objective[]
  selectedId: string | null
  statusFilter: CycleFilter
  onStatusFilterChange: (filter: CycleFilter) => void
  onSelect: (id: string) => void
  onCreateCycleClick?: () => void
  onAddObjectiveToCycle?: (cycleId: string) => void
  onDeleteCycle?: (cycleId: string) => void
  onDeleteObjective?: (id: string) => void
  onEdit?: (id: string) => void
  onImport?: () => void
  /** [022.01] Task 5：审核通过周期后回调（刷新 cycle 列表） */
  onCycleApproved?: () => void
  /** [022.01] Task 5：结束周期后回调（刷新 cycle 列表） */
  onCycleEnded?: () => void
  /** [022.01] Task 5：复盘周期后回调（刷新 cycle 列表） */
  onCycleReviewed?: () => void
}

// [022.01] Task 4：顶部筛选 tabs 改为 Cycle 状态。
// 筛选作用于 objective 所属 cycle 的状态，而非 objective 自身状态
// （voice D8：非匹配 cycle 不应显示为 (0) 空卡）。
const CYCLE_STATUS_TABS: { key: CycleFilter; label: string }[] = [
  { key: "all", label: "全部" },
  { key: "draft", label: "草稿" },
  { key: "not_started", label: "未开始" },
  { key: "in_progress", label: "进行中" },
  { key: "ended", label: "已结束" },
  { key: "reviewed", label: "已复盘" },
]

/**
 * [022.01] Task 4：按 parent cycle 状态筛选 objectives（pure function，便于测试）。
 *
 * @param objectives - 所有 objective（含不同 cycle）
 * @param cycles - 所有 cycle（用于查 cycle.status）
 * @param filter - "all" 保留所有；否则仅保留 cycle.status === filter 的 objective
 * @returns 过滤后的 objective 列表
 */
export function filterObjectivesByCycleStatus(
  objectives: Objective[],
  cycles: Cycle[],
  filter: CycleFilter,
): Objective[] {
  if (filter === "all") return objectives
  const matchedCycleIds = new Set(
    cycles.filter((c) => c.status === filter).map((c) => c.id),
  )
  return objectives.filter((o) => matchedCycleIds.has(o.cycleId))
}

export function OKRDirectory({
  cycles,
  objectives,
  selectedId,
  statusFilter,
  onStatusFilterChange,
  onSelect,
  onCreateCycleClick,
  onAddObjectiveToCycle,
  onDeleteCycle,
  onDeleteObjective,
  onEdit: _onEdit,
  onImport,
  onCycleApproved,
  onCycleEnded,
  onCycleReviewed,
}: OKRDirectoryProps) {
  const handleCreateCycle = onCreateCycleClick ?? (() => {})
  const handleAddObjective = onAddObjectiveToCycle ?? (() => {})
  const handleDeleteCycle = onDeleteCycle ?? (() => {})
  const handleDeleteObjective = onDeleteObjective ?? (() => {})

  // [022.01] Task 5：周期折叠。
  // MVP：进行中的周期默认展开，其余收起（不在依赖 objective.status）
  const [collapsedCycleIds, setCollapsedCycleIds] = useState<Set<string>>(() => {
    const collapsed = new Set<string>()
    for (const cycle of cycles) {
      const hasActive = cycle.status === "in_progress"
      if (!hasActive) collapsed.add(cycle.id)
    }
    return collapsed
  })
  const toggleCollapsed = (cycleId: string) => {
    setCollapsedCycleIds((prev) => {
      const next = new Set(prev)
      if (next.has(cycleId)) next.delete(cycleId)
      else next.add(cycleId)
      return next
    })
  }
  return (
    <div className="p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-sm text-ink">OKR 目标</h2>
        <div className="flex gap-1">
          {onImport && (
            <Button variant="outline" size="sm" onClick={onImport}>导入</Button>
          )}
          <Button size="sm" onClick={handleCreateCycle}>+OKR周期</Button>
        </div>
      </div>

      <div className="flex gap-1 flex-wrap">
        {CYCLE_STATUS_TABS.map(tab => (
          <button key={tab.key} type="button"
            onClick={() => onStatusFilterChange(tab.key)}
            className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
              statusFilter === tab.key
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}>
            {tab.label}
          </button>
        ))}
      </div>

      {cycles.length === 0 && (
        <div className="text-center text-muted-foreground text-xs py-6">
          点击 [+OKR周期] 创建第一个周期
        </div>
      )}

      <div className="space-y-3">
        {cycles
          // [022.01] Task 4：cycles 也按 cycle.status 过滤，
          // 非匹配 cycle 不显示（解决 voice D8「(0) 空卡」问题）。
          .filter(cycle => statusFilter === "all" || cycle.status === statusFilter)
          .map(cycle => {
            const cycleObjectives = objectives.filter(
              o => o.cycleId === cycle.id
            )
            const hasObjectives = cycleObjectives.length > 0
          const isCollapsed = collapsedCycleIds.has(cycle.id)
          return (
            <div key={cycle.id}>
              <div className="flex items-center justify-between py-1 px-1 rounded hover:bg-muted/50 transition-colors">
                <button
                  type="button"
                  onClick={() => toggleCollapsed(cycle.id)}
                  aria-label={isCollapsed ? "展开周期" : "收起周期"}
                  className="flex items-baseline gap-1 min-w-0 text-left outline-hidden"
                >
                  {isCollapsed ? (
                    <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronDown className="size-3.5 text-muted-foreground shrink-0" />
                  )}
                  <span className="text-sm font-semibold text-ink truncate">{cycle.name}</span>
                  <span className="text-xs text-muted-foreground shrink-0">({cycleObjectives.length})</span>
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger
                    aria-label="周期操作"
                    className="px-1.5 py-0.5 text-sm text-muted-foreground hover:text-ink rounded hover:bg-muted/80 transition-colors outline-hidden"
                  >
                    ⋯
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {/* [022.01] Task 5：菜单排序按用户 review 反馈，审核通过作为主要动作置首。
                        三个菜单项自身带状态守卫（非 draft/in_progress/ended 返回 null），
                        宿主 DropdownMenu 自然隐藏——不需外层条件渲染。 */}
                    <CycleApproveMenuItem
                      cycle={cycle}
                      onApproved={onCycleApproved}
                    />
                    <DropdownMenuItem onClick={() => handleAddObjective(cycle.id)}>
                      添加目标
                    </DropdownMenuItem>
                    <CycleEndMenuItem
                      cycle={cycle}
                      onEnded={onCycleEnded}
                    />
                    <CycleReviewMenuItem
                      cycle={cycle}
                      onReviewed={onCycleReviewed}
                    />
                    <DropdownMenuItem
                      disabled={hasObjectives}
                      title={hasObjectives ? "请先处理周期内目标" : undefined}
                      onClick={() => {
                        if (hasObjectives) return
                        handleDeleteCycle(cycle.id)
                      }}
                    >
                      删除周期
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {!isCollapsed && hasObjectives && (
                <div className="space-y-0.5 mt-1">
                  {cycleObjectives.map(obj => (
                    <div
                      key={obj.id}
                      className={`group flex items-center gap-1.5 px-2 py-1.5 rounded text-sm hover:bg-muted/80 transition-colors ${
                        selectedId === obj.id ? "bg-muted font-medium" : ""
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => onSelect(obj.id)}
                        title={obj.title}
                        className="flex items-center gap-1.5 min-w-0 flex-1 text-left"
                      >
                        {obj.objectiveNumber && (
                          <span className="font-mono text-xs text-muted-foreground shrink-0">{obj.objectiveNumber}</span>
                        )}
                        <span className="truncate min-w-0">{obj.title}</span>
                      </button>
                      {/* [022.01] Task 5：MVP 目标菜单简化为仅「删除」（设置 discardedAt）。
                          pause/resume/complete/archive 语义由 cycle 级操作承载。 */}
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          aria-label="目标操作"
                          className="px-1 py-0.5 text-sm text-muted-foreground hover:text-ink rounded hover:bg-muted/80 transition-colors opacity-0 group-hover:opacity-100 focus-visible:opacity-100 outline-hidden"
                        >
                          ⋯
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => handleDeleteObjective(obj.id)}
                          >
                            删除目标
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
