/**
 * @file contribution-panel
 * @brief KR 详情页贡献管理面板
 *
 * [022] Phase 3 Task 4 核心组件 + [022.01] Phase 3 cycleStatus 迁移：
 * - 列出 KR 下已关联的 task/habit contribution（Badge 列表）
 * - 提供客户端 title 搜索 + 一键关联 / 解除关联
 * - [022.01] Phase 3：编辑权限 = cycle.status ≠ "reviewed"
 *   （Objective.status 已删除，权限语义由 Cycle 承载）
 *
 * 架构要点（来自 /plan-eng-review outside voice #1 的修正）：
 * - 客户端组件不直接 new ContributionRepository()（违反 R-01）
 * - 所有读写经 server actions（frontend/src/app/actions/okrs/contributions.ts）
 * - 候选搜索走一次性 searchCandidates + 客户端 title 过滤（避免每按键 round-trip）
 * - 跨域隔离：本组件仅依赖 server actions + nexus/context-engine 类型；
 *   无 @/domains/tasks/* / @/domains/habits/* 运行时 import
 */

"use client"

import { useState, useEffect, useMemo } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import type { Contribution } from "@/usom/types/objects"
import {
  listContributions,
  linkContribution,
  unlinkContribution,
  searchCandidates,
  type ContributionCandidate,
} from "@/app/actions/okrs/contributions"

interface ContributionPanelProps {
  /** 目标 KR ID */
  krId: string
  /** [022.01] Phase 3：所属 cycle 状态（≠ "reviewed" 时允许编辑关联） */
  cycleStatus: string
  /** 变更回调（刷新父组件数据） */
  onChange: () => void
}

/** 候选条目（含类型用于 UI 区分） */
interface Candidate {
  id: string
  title: string
  type: "task" | "habit"
  label: string
}

/** 搜索过滤（纯函数，导出便于单元测试） */
export function filterCandidates(
  query: string,
  candidates: Candidate[],
  maxResults = 20,
): Candidate[] {
  if (!query.trim()) return candidates.slice(0, maxResults)
  const q = query.toLowerCase()
  return candidates
    .filter((c) => c.title.toLowerCase().includes(q))
    .slice(0, maxResults)
}

/**
 * KR 贡献管理面板
 */
export function ContributionPanel({ krId, cycleStatus, onChange }: ContributionPanelProps) {
  const [existingContribs, setExistingContribs] = useState<Contribution[]>([])
  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [isLoading, setIsLoading] = useState(true)
  const [isAdding, setIsAdding] = useState(false)
  // [022.01] Phase 3：编辑权限由 cycle.status 决定——仅 reviewed 只读。
  const isEditable = cycleStatus !== "reviewed"

  // 加载已有贡献 + 候选（一次性，搜索在客户端进行）
  useEffect(() => {
    let cancelled = false
    async function load() {
      setIsLoading(true)
      const [contribs, cands] = await Promise.all([
        listContributions(krId),
        searchCandidates(),
      ])
      if (cancelled) return
      setExistingContribs(contribs)
      setCandidates(mergeCandidates(cands))
      setIsLoading(false)
    }
    load()
    return () => {
      cancelled = true
    }
  }, [krId])

  // 客户端 title 过滤
  const filtered = useMemo(
    () => filterCandidates(searchQuery, candidates),
    [candidates, searchQuery],
  )

  // 关联
  const handleLink = async (candidate: Candidate) => {
    setIsAdding(true)
    try {
      await linkContribution(krId, candidate.type, candidate.id)
      const contribs = await listContributions(krId)
      setExistingContribs(contribs)
      onChange()
    } finally {
      setIsAdding(false)
    }
  }

  // 解除关联
  const handleUnlink = async (contribId: string) => {
    await unlinkContribution(contribId)
    const contribs = await listContributions(krId)
    setExistingContribs(contribs)
    onChange()
  }

  // 查找候选对应的已关联状态
  const linkedIds = new Set(
    existingContribs.map((c) => `${c.contributorType}:${c.contributorId}`),
  )

  if (isLoading) {
    return (
      <div className="space-y-2 py-2">
        <div className="h-4 w-1/3 rounded bg-hairline animate-pulse" />
        <div className="h-3 w-2/3 rounded bg-hairline animate-pulse" />
      </div>
    )
  }

  return (
    <div className="space-y-3 border-t border-hairline pt-3 mt-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-muted-foreground">贡献来源</h4>
      </div>

      {/* 已关联列表 */}
      {existingContribs.length === 0 ? (
        <p className="text-xs text-muted-foreground">尚未关联任何任务或习惯</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {existingContribs.map((c) => (
            <Badge key={c.id} variant="secondary" className="gap-1 text-xs">
              {c.contributorType === "task" ? "📋" : "✅"}
              {c.contributorId.slice(0, 8)}...
              {isEditable && (
                <button
                  type="button"
                  onClick={() => handleUnlink(c.id)}
                  className="ml-1 text-muted-foreground hover:text-destructive"
                  aria-label="解除关联"
                >
                  &times;
                </button>
              )}
            </Badge>
          ))}
        </div>
      )}

      {/* 搜索添加 */}
      {isEditable && (
        <div className="space-y-2">
          <Input
            placeholder="搜索任务或习惯名称..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 text-sm"
          />
          {searchQuery.trim() && filtered.length > 0 && (
            <div className="max-h-32 overflow-y-auto rounded-md border border-hairline divide-y divide-hairline">
              {filtered
                .filter((c) => !linkedIds.has(`${c.type}:${c.id}`))
                .map((c) => (
                  <button
                    key={`${c.type}:${c.id}`}
                    type="button"
                    onClick={() => handleLink(c)}
                    disabled={isAdding}
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-left hover:bg-muted/50 disabled:opacity-50"
                  >
                    <span>{c.label}</span>
                    <span className="text-muted-foreground truncate">{c.title}</span>
                  </button>
                ))}
            </div>
          )}
          {searchQuery.trim() &&
            filtered.filter((c) => !linkedIds.has(`${c.type}:${c.id}`)).length === 0 && (
              <p className="text-xs text-muted-foreground">没有匹配的未关联项</p>
            )}
        </div>
      )}
    </div>
  )
}

/** 把 server action 返回的 typed list 转成 UI 用的 Candidate（含 emoji label） */
function mergeCandidates(cands: {
  tasks: ContributionCandidate[]
  habits: ContributionCandidate[]
}): Candidate[] {
  return [
    ...cands.tasks.map((t) => ({ ...t, label: "📋 任务" })),
    ...cands.habits.map((h) => ({ ...h, label: "✅ 习惯" })),
  ]
}

// Re-export for unit tests
export type { Candidate }
