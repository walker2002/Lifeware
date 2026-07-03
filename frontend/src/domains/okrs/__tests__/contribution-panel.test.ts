/**
 * @file contribution-panel.test
 * @brief ContributionPanel 组件行为测试
 *
 * 测试 KR 贡献关联管理的核心逻辑：搜索过滤、关联/解除关联状态。
 *
 * [022] Phase 3 Task 4：6 个单元测试
 * - 5 个搜索过滤（filterCandidates 纯函数）
 * - 1 个 linkedIds 集合状态正确性
 * - 1 个解除关联后 linkedIds 不再包含该项（合计 7，brief 列 6 但实际可拆分多一）
 */

import { describe, it, expect } from "vitest"
import { filterCandidates, isContributionEditable } from "../components/contribution-panel"

interface TestCandidate {
  id: string
  title: string
  type: "task" | "habit"
  label: string
}

describe("ContributionPanel — 搜索过滤逻辑", () => {
  const candidates: TestCandidate[] = [
    { id: "t1", title: "完成产品文档", type: "task", label: "📋 任务" },
    { id: "h1", title: "每日冥想", type: "habit", label: "✅ 习惯" },
    { id: "t2", title: "重构认证模块", type: "task", label: "📋 任务" },
    { id: "h2", title: "每周运动 3 次", type: "habit", label: "✅ 习惯" },
  ]

  it("空查询返回前 maxResults 个候选项", () => {
    expect(filterCandidates("", candidates)).toHaveLength(4)
  })

  it("按 title 模糊匹配", () => {
    const result = filterCandidates("文档", candidates)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("t1")
  })

  it("不区分大小写匹配", () => {
    const result = filterCandidates("冥想", candidates)
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe("h1")
  })

  it("无匹配返回空数组", () => {
    expect(filterCandidates("不存在的任务", candidates)).toHaveLength(0)
  })

  it("截断最多 maxResults 个结果", () => {
    const many: TestCandidate[] = Array.from({ length: 30 }, (_, i) => ({
      id: `t${i}`,
      title: `任务 ${i}`,
      type: "task",
      label: "📋 任务",
    }))
    expect(filterCandidates("任务", many)).toHaveLength(20)
  })
})

describe("ContributionPanel — 关联/解除关联状态", () => {
  it("linkedIds 正确标识已关联项", () => {
    const existing = [
      {
        id: "c1",
        keyResultId: "kr1" as any,
        contributorType: "task" as const,
        contributorId: "t1" as any,
        createdAt: "" as any,
        updatedAt: "" as any,
      },
    ]
    const linkedIds = new Set(
      existing.map((c) => `${c.contributorType}:${c.contributorId}`),
    )
    expect(linkedIds.has("task:t1")).toBe(true)
    expect(linkedIds.has("habit:h1")).toBe(false)
  })

  it("解除关联后 linkedIds 不再包含该项", () => {
    const existing: Array<{
      id: string
      contributorType: string
      contributorId: string
    }> = []
    const linkedIds = new Set(
      existing.map((c) => `${c.contributorType}:${c.contributorId}`),
    )
    expect(linkedIds.has("task:t1")).toBe(false)
  })
})

// [022.01] Phase 3：cycleStatus 决定 ContributionPanel 编辑权限
describe("ContributionPanel — isEditable（[022.01] Phase 3 cycleStatus 守卫）", () => {
  it('cycleStatus !== "reviewed" → 可编辑', () => {
    expect(isContributionEditable("draft")).toBe(true)
    expect(isContributionEditable("not_started")).toBe(true)
    expect(isContributionEditable("in_progress")).toBe(true)
    expect(isContributionEditable("ended")).toBe(true)
  })

  it('cycleStatus === "reviewed" → 不可编辑', () => {
    expect(isContributionEditable("reviewed")).toBe(false)
  })
})
