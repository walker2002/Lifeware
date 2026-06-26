/**
 * @file contributions
 * @brief OKR 域 KR 贡献关联管理 Server Action 模块
 *
 * [022] Phase 3 Task 4：KR 详情页贡献管理面板的服务端入口。
 * - 解决 R-01 仓储层隔离：客户端不得 new ContributionRepository()
 * - 解决 Phase 3 Task 1 Concern 1（"use server" 边界问题）：
 *   全部读写通过本文件暴露的 server action，浏览器只看到函数引用。
 * - 跨域隔离：本模块仅依赖 OKR 域 ContributionRepository 与
 *   nexus/context-engine 的 resolveContext；不直接 import tasks/habits 域。
 *
 * 候选搜索采用「一次性拉取所有候选 + 客户端 title 过滤」策略：
 * 避免每次按键 round-trip，同时遵守跨域 ContextProvider 边界。
 */

"use server";

import { ContributionRepository } from "@/domains/okrs/repository/contribution";
import { resolveContext } from "@/nexus/context-engine";
import type { Contribution } from "@/usom/types/objects";
import type { USOM_ID } from "@/usom/types/primitives";

/** MVP 用户 ID（与 app/actions/okr.ts 保持一致的现状来源） */
const MVP_USER_ID = "00000000-0000-0000-0000-000000000001" as USOM_ID;

/** 候选条目（前端组件用作搜索下拉项） */
export interface ContributionCandidate {
  id: string
  title: string
  type: "task" | "habit"
}

/** 候选搜索结果（一次往返两个域） */
export interface ContributionCandidatesResult {
  tasks: ContributionCandidate[]
  habits: ContributionCandidate[]
}

/**
 * 获取指定 KR 下所有贡献记录
 * @param krId - 关键结果 ID
 * @returns 贡献记录列表
 */
export async function listContributions(krId: string): Promise<Contribution[]> {
  const repo = new ContributionRepository();
  return repo.findByKeyResult(krId as USOM_ID, MVP_USER_ID);
}

/**
 * 关联一个 task/habit 到指定 KR
 *
 * 重复关联由数据库 uq_contributions_kr_source 唯一索引兜底；
 * 若已存在，DB 层抛错由本函数透传给调用方。
 *
 * @param krId - 关键结果 ID
 * @param contributorType - 贡献来源类型
 * @param contributorId - 贡献来源 ID
 * @returns 新建的贡献记录
 */
export async function linkContribution(
  krId: string,
  contributorType: "task" | "habit",
  contributorId: string,
): Promise<Contribution> {
  const repo = new ContributionRepository();
  return repo.add(
    {
      keyResultId: krId as USOM_ID,
      contributorType,
      contributorId: contributorId as USOM_ID,
    },
    MVP_USER_ID,
  );
}

/**
 * 解除一个贡献关联
 * @param contributionId - 贡献记录 ID
 */
export async function unlinkContribution(contributionId: string): Promise<void> {
  const repo = new ContributionRepository();
  await repo.remove(contributionId as USOM_ID, MVP_USER_ID);
}

/**
 * 一次往返拉取所有可关联的 task/habit 候选
 *
 * 经 resolveContext 走 ContextProvider 边界（不直接 import tasks/habits 域），
 * 与 Phase 2 CompletedTasksProvider / Phase 3 ActiveHabitsProvider 同源。
 *
 * @returns 任务候选 + 习惯候选
 */
export async function searchCandidates(): Promise<ContributionCandidatesResult> {
  const tasks = (await resolveContext(
    "completedTasks",
    "completed_ids",
    { userId: MVP_USER_ID },
  )) as Array<{ id: string; title: string }> | null;
  const habits = (await resolveContext(
    "activeHabits",
    "active_habits",
    { userId: MVP_USER_ID },
  )) as Array<{ id: string; title: string }> | null;

  return {
    tasks: (tasks ?? []).map((t) => ({ id: t.id, title: t.title, type: "task" })),
    habits: (habits ?? []).map((h) => ({ id: h.id, title: h.title, type: "habit" })),
  };
}
