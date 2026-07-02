/**
 * @file okr
 * @brief OKR（目标与关键结果）管理 Server Action 模块
 * 
 * 提供 OKR 的创建、查询、更新、删除等功能
 */

"use server";

import type { Objective, KeyResult, Cycle } from "@/usom/types/objects";
import type { ObjectiveWithKR } from "@/usom/interfaces/irepository";
import type { ObjectiveStatus } from "@/usom/types/primitives";
import { ObjectiveRepository } from "@/domains/okrs/repository/objective";
import { KeyResultRepository } from "@/domains/okrs/repository/key-result";
import { CycleRepository } from "@/domains/okrs/repository/cycle";
import { createOkrsMutationService } from "./okrs/mutation-service";
import { createOKROrchestrator, makeIntent } from "@/domains/okrs/wiring";
import type { USOM_ID } from "@/usom/types/primitives";

/** MVP 用户 ID（临时使用） */
const MVP_USER_ID = "00000000-0000-0000-0000-000000000001";

/**
 * OKR 操作结果
 */
interface OKRActionResult<T = void> {
  /** 是否成功 */
  success: boolean;
  /** 返回数据 */
  data?: T;
  /** 错误信息 */
  error?: string;
}

// ─── 查询 ────────────────────────────────────────────────────────

/**
 * 获取目标列表
 * 
 * @param status - 目标状态（可选）
 * @returns 目标列表
 */
export async function getObjectives(
  status?: ObjectiveStatus,
): Promise<OKRActionResult<Objective[]>> {
  try {
    const repo = new ObjectiveRepository();
    const objectives = status
      ? await repo.findByStatus(status, MVP_USER_ID)
      : await repo.findAll(MVP_USER_ID);
    return { success: true, data: objectives };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "获取目标列表失败" };
  }
}

/**
 * 根据 ID 获取目标详情（包含关键结果）
 * 
 * @param id - 目标 ID
 * @returns 目标详情
 */
export async function getObjectiveById(
  id: string,
): Promise<OKRActionResult<ObjectiveWithKR>> {
  try {
    const repo = new ObjectiveRepository();
    const result = await repo.findWithKeyResults(id, MVP_USER_ID);
    if (!result) return { success: false, error: "目标不存在" };
    return { success: true, data: result };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "获取目标详情失败" };
  }
}

/**
 * 获取指定目标的关键结果列表
 * 
 * @param objectiveId - 目标 ID
 * @returns 关键结果列表
 */
export async function getKeyResultsByObjective(
  objectiveId: string,
): Promise<OKRActionResult<KeyResult[]>> {
  try {
    const repo = new KeyResultRepository();
    const data = await repo.findByObjective(objectiveId, MVP_USER_ID);
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "获取关键结果失败" };
  }
}

// ─── 周期（[022] QA fix：移到 server action 以避免 use-okrs.ts 客户端导入 CycleRepository） ─

/**
 * 获取当前用户的活跃周期列表
 */
export async function getActiveCycles(): Promise<OKRActionResult<Cycle[]>> {
  try {
    const repo = new CycleRepository();
    const data = await repo.findByUserAndStatus("in_progress", MVP_USER_ID);
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "获取周期失败" };
  }
}

/**
 * 创建周期（[022.01] Phase 1：改走 executeIntent → SM create→draft）
 *
 * 不再接受 status 入参——SM 按 manifest create→draft 强制 draft。
 * 自然键幂等：同 (userId, periodStart, periodEnd) 只存在一条 cycle。
 *
 * @param input - 周期输入数据
 * @returns 创建结果
 */
export async function createCycle(
  input: { cycleType: string; name: string; periodStart: string; periodEnd: string },
): Promise<OKRActionResult<Cycle>> {
  try {
    const orchestrator = await createOKROrchestrator();
    const intent = makeIntent("createCycle", {
      cycleType: input.cycleType,
      name: input.name,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
    });
    const result = await orchestrator.executeIntent(intent, MVP_USER_ID);
    if (!result.success) return { success: false, error: result.error };

    // 从 SM 执行结果取返回对象（adapter.create → save 回查返回持久化行）
    const cycle = result.object as Cycle | undefined;
    if (!cycle) return { success: false, error: "周期创建成功但未返回对象" };
    return { success: true, data: cycle };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "创建周期失败" };
  }
}

/**
 * 删除周期（[024] G1：周期管理重构）
 *
 * 业务规则：周期下若仍有挂载的目标（任意状态，含 archived），
 * 一律拒绝删除，避免悬空引用。
 *
 * 与 createCycle 一致：单行硬删 + 前置读检查，
 * 不经 mutation-service / orchestrator —— 不存在跨表副作用
 * （KR recompute 路径不触发；event fan-out 暂无）。
 *
 * 例外登记：write-entry-guard.test.ts 的 allow 列表
 *
 * @param cycleId - 待删除周期 ID
 * @returns success=true 表示已删；success=false 表示拒绝（附 error）
 */
export async function deleteCycle(cycleId: string): Promise<OKRActionResult<void>> {
  try {
    const objRepo = new ObjectiveRepository();
    const cycleRepo = new CycleRepository();
    const objs = await objRepo.findByCycleId(cycleId, MVP_USER_ID);
    if (objs.length > 0) {
      return { success: false, error: "周期下仍有目标，请先处理后再删除" };
    }
    const deleted = await cycleRepo.delete(cycleId, MVP_USER_ID);
    if (deleted === 0) {
      return { success: false, error: "周期不存在或已删除" };
    }
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "删除周期失败" };
  }
}

// ─── 操作 ────────────────────────────────────────────────────────

/**
 * 创建目标
 * 
 * @param input - 目标输入数据
 * @returns 创建结果
 */
export async function createObjective(
  input: { cycleId: string; title: string; description?: string; okrType?: "visionary" | "committed"; priority?: "P0" | "P1" | "P2" },
): Promise<OKRActionResult<Objective>> {
  try {
    const orchestrator = await createOKROrchestrator();
    const intent = makeIntent("createObjective", { ...input, priority: input.priority ?? 'P1' });
    const result = await orchestrator.executeIntent(intent, MVP_USER_ID);
    if (!result.success) return { success: false, error: result.error };
    const repo = new ObjectiveRepository();
    const objectives = await repo.findByStatus("draft", MVP_USER_ID);
    const created = objectives.sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )[0];
    return { success: true, data: created };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "创建目标失败" };
  }
}

/**
 * 更新目标
 *
 * 经 mutation-service 逐字段写入（FactField→FieldExecutor / ContentField→repo.updateFields），
 * 成功后 re-fetch 回填 data（FactField 成功路径 svc.update 仅返回 {success:true} 无 object，A6/FM-8）。
 *
 * 已知架构债（FM-5，本 Task 不处理）：orchestrator（自带 SM）与 mutation-service（factory 自带 SM）
 * 并存——Phase 1 仅修真正的 repo 直写违宪（updateObjective），不强行统一两套写入口（须宪法讨论）。
 *
 * @param objectiveId - 目标 ID
 * @param fields - 更新字段
 * @returns 更新结果
 */
export async function updateObjective(
  objectiveId: string,
  fields: Record<string, unknown>,
): Promise<OKRActionResult<Objective>> {
  try {
    const svc = createOkrsMutationService()
    // 过滤派生/不可写字段（period 现为派生；调用方不应再发，但防御性剔除）
    const writable = { ...fields }
    delete writable.period
    // 逐字段经 mutation-service 写（FactField→FieldExecutor / ContentField→repo.updateFields）
    for (const [field, value] of Object.entries(writable)) {
      const r = await svc.update(objectiveId, field, value, MVP_USER_ID, 'okrs', 'objective')
      if (!r.success) return { success: false, error: r.error }
    }
    // re-fetch 回填 data（svc.update FactField 成功只返回 {success:true} 无 object）
    const refreshed = await new ObjectiveRepository().findById(objectiveId, MVP_USER_ID)
    return { success: true, data: refreshed! }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : '更新目标失败' }
  }
}

/**
 * 激活目标
 * 
 * @param objectiveId - 目标 ID
 * @returns 操作结果
 */
export async function activateObjective(
  objectiveId: string,
): Promise<OKRActionResult> {
  try {
    const orchestrator = await createOKROrchestrator();
    const intent = makeIntent("activateObjective", { objectiveId });
    const result = await orchestrator.executeIntent(intent, MVP_USER_ID);
    if (!result.success) return { success: false, error: result.error };
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "激活失败" };
  }
}

/**
 * 更改目标状态
 * 
 * @param objectiveId - 目标 ID
 * @param action - 状态动作（pause/resume/complete/discard/archive）
 * @returns 操作结果
 */
export async function changeObjectiveStatus(
  objectiveId: string,
  action: "pause" | "resume" | "complete" | "discard" | "archive",
): Promise<OKRActionResult> {
  try {
    const actionMap: Record<string, string> = {
      pause: "pauseObjective",
      resume: "resumeObjective",
      complete: "completeObjective",
      discard: "discardObjective",
      archive: "archiveObjective",
    };
    const orchestrator = await createOKROrchestrator();
    const intent = makeIntent(actionMap[action], { objectiveId });
    const result = await orchestrator.executeIntent(intent, MVP_USER_ID);
    if (!result.success) return { success: false, error: result.error };
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "状态更新失败" };
  }
}

/**
 * 创建关键结果
 * 
 * @param objectiveId - 目标 ID
 * @param input - 关键结果输入数据
 * @returns 创建结果
 */
export async function createKeyResult(
  objectiveId: string,
  input: { title: string; description?: string; targetValue: number; unit: string },
): Promise<OKRActionResult<KeyResult>> {
  try {
    const orchestrator = await createOKROrchestrator();
    const intent = makeIntent("createKeyResult", { objectiveId, ...input });
    const result = await orchestrator.executeIntent(intent, MVP_USER_ID);
    if (!result.success) return { success: false, error: result.error };
    const krRepo = new KeyResultRepository();
    const krs = await krRepo.findByObjective(objectiveId, MVP_USER_ID);
    const created = krs.sort((a, b) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )[0];
    return { success: true, data: created };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "创建关键结果失败" };
  }
}

/**
 * 更新关键结果
 * 
 * @param keyResultId - 关键结果 ID
 * @param fields - 更新字段
 * @returns 更新结果
 */
export async function updateKeyResult(
  keyResultId: string,
  fields: Record<string, unknown>,
): Promise<OKRActionResult<KeyResult>> {
  try {
    const orchestrator = await createOKROrchestrator();
    const intent = makeIntent("updateKeyResult", { keyResultId, ...fields });
    const result = await orchestrator.executeIntent(intent, MVP_USER_ID);
    if (!result.success) return { success: false, error: result.error };
    const krRepo = new KeyResultRepository();
    const kr = await krRepo.findById(keyResultId, MVP_USER_ID);
    return { success: true, data: kr! };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "更新关键结果失败" };
  }
}

/**
 * 更新关键结果进度
 * 
 * @param keyResultId - 关键结果 ID
 * @param currentValue - 当前值
 * @returns 更新结果
 */
export async function updateKeyResultProgress(
  keyResultId: string,
  currentValue: number,
): Promise<OKRActionResult<KeyResult>> {
  try {
    const orchestrator = await createOKROrchestrator();
    const intent = makeIntent("updateKeyResultProgress", { keyResultId, currentValue });
    const result = await orchestrator.executeIntent(intent, MVP_USER_ID);
    if (!result.success) return { success: false, error: result.error };
    const krRepo = new KeyResultRepository();
    const kr = await krRepo.findById(keyResultId, MVP_USER_ID);
    return { success: true, data: kr! };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "更新进度失败" };
  }
}

export async function deleteDraftKeyResult(
  keyResultId: string,
): Promise<OKRActionResult> {
  try {
    const orchestrator = await createOKROrchestrator();
    const intent = makeIntent("deleteKeyResult", { keyResultId });
    const result = await orchestrator.executeIntent(intent, MVP_USER_ID);
    if (!result.success) return { success: false, error: result.error };
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "删除失败" };
  }
}

/**
 * 审核通过周期（[022.01] Phase 1: Task 7）
 *
 * 按 server 时刻 now（UTC date-only YYYY-MM-DD）与 periodStart 比较分派：
 * - now >= periodStart → executeIntent('startCycle')（draft → in_progress）
 * - now <  periodStart → executeIntent('planCycle')  （draft → not_started）
 *
 * 仅允许从 draft 状态审核通过；非 draft 返回错误，避免误改已 in_progress/ended 周期。
 * 不接受其他 fromState 的 transition；分派由 server 决定，避免客户端造假。
 *
 * @param cycleId - 周期 ID（USOM UUID 字符串）
 * @returns 执行结果，成功时返回更新后的 Cycle
 */
export async function approveCycle(cycleId: string): Promise<OKRActionResult<Cycle>> {
  try {
    const cycleRepo = new CycleRepository();
    const cycle = await cycleRepo.findById(cycleId as USOM_ID, MVP_USER_ID);
    if (!cycle) return { success: false, error: "周期不存在" };
    if (cycle.status !== "draft") {
      return { success: false, error: "仅 draft 状态可审核通过" };
    }

    const now = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC date-only)
    const action = now >= cycle.period.start ? "startCycle" : "planCycle";

    const orchestrator = await createOKROrchestrator();
    const intent = makeIntent(action, { cycleId });
    const result = await orchestrator.executeIntent(intent, MVP_USER_ID);
    if (!result.success) return { success: false, error: result.error };

    const updated = await cycleRepo.findById(cycleId as USOM_ID, MVP_USER_ID);
    if (!updated) return { success: false, error: "审核通过后回读失败" };
    return { success: true, data: updated };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "审核通过失败" };
  }
}
