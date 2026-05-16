"use server";

import type { Objective, KeyResult } from "@/usom/types/objects";
import type { ObjectiveWithKR } from "@/usom/interfaces/irepository";
import type { ObjectiveStatus, KeyResultStatus, Timestamp } from "@/usom/types/primitives";
import { ObjectiveRepository } from "@/domains/okrs/repository/objective";
import { KeyResultRepository } from "@/domains/okrs/repository/key-result";
import { SystemEventRepository } from "@/lib/db/repositories/system-event.repository";
import { TimeboxRepository } from "@/domains/timebox/repository";
import { createOrchestrator } from "../../nexus/orchestrator";
import { createRuleEngine } from "../../nexus/core/rule-engine";
import { createEventBus } from "../../nexus/infrastructure/event-bus";

const MVP_USER_ID = "00000000-0000-0000-0000-000000000001";

export interface OKRActionResult<T = void> {
  success: boolean;
  data?: T;
  error?: string;
}

// ─── 查询 ────────────────────────────────────────────────────────

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

// ─── 操作 ────────────────────────────────────────────────────────

async function createOKROrchestrator() {
  const objectiveRepo = new ObjectiveRepository();
  const keyResultRepo = new KeyResultRepository();
  const eventRepo = new SystemEventRepository();
  const timeboxRepo = new TimeboxRepository();
  const ruleEngine = createRuleEngine({ timeboxRepo, userId: MVP_USER_ID });

  return createOrchestrator({
    timeboxRepo,
    eventRepo,
    intentEngine: { parse: async () => { throw new Error("not used") } },
    ruleEngine: {
      evaluate: async (intentEval, snapshot) => {
        const result = await ruleEngine.evaluate(intentEval, snapshot);
        return {
          result: result.severity,
          warnings: result.warnings,
          confirmations: result.confirmations,
        };
      },
    },
    objectiveRepo,
    keyResultRepo,
  });
}

function makeIntent(action: string, fields: Record<string, unknown>) {
  const now = new Date().toISOString() as Timestamp;
  return {
    id: crypto.randomUUID() as import("@/usom/types/primitives").USOM_ID,
    intentionId: crypto.randomUUID() as import("@/usom/types/primitives").USOM_ID,
    targetDomain: "okrs" as const,
    action,
    fields,
    confidence: 1.0,
    resolvedBy: "template_form" as const,
    createdAt: now,
  };
}

export async function createObjective(
  input: { title: string; description?: string; okrType?: "visionary" | "committed"; priority?: "P0" | "P1" | "P2"; periodType?: string; periodStart?: string; periodEnd?: string },
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

export async function updateObjective(
  objectiveId: string,
  fields: Record<string, unknown>,
): Promise<OKRActionResult<Objective>> {
  try {
    const repo = new ObjectiveRepository();
    const existing = await repo.findById(objectiveId, MVP_USER_ID);
    if (!existing) return { success: false, error: "目标不存在" };

    const now = new Date().toISOString() as Timestamp;
    const updated: Objective = {
      ...existing,
      ...fields,
      updatedAt: now,
    };
    await repo.save(updated, MVP_USER_ID);
    const refreshed = await repo.findById(objectiveId, MVP_USER_ID);
    return { success: true, data: refreshed! };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "更新目标失败" };
  }
}

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

// ─── 自动进度推进 (T034-T036) ────────────────────────────────────
// 任务完成时：等分策略 (KR targetValue / linkedTaskCount)
// 习惯打卡时：+1 策略

export async function handleTaskCompletedKRProgress(
  keyResultId: string,
): Promise<OKRActionResult<KeyResult>> {
  try {
    const krRepo = new KeyResultRepository();
    const kr = await krRepo.findById(keyResultId, MVP_USER_ID);
    if (!kr || kr.status !== "active") return { success: true };

    // 查找关联到此 KR 的所有任务
    const { db } = await import("@/lib/db");
    const { tasks } = await import("@/lib/db/schema");
    const { eq, and } = await import("drizzle-orm");
    const linkedTasks = await db.select().from(tasks)
      .where(and(eq(tasks.keyResultId, keyResultId), eq(tasks.userId, MVP_USER_ID)));

    const totalLinked = linkedTasks.length;
    if (totalLinked === 0) return { success: true };

    const completedLinked = linkedTasks.filter(t => t.status === "completed").length;
    const increment = kr.targetValue / totalLinked;
    const newCurrentValue = Math.round(completedLinked * increment * 100) / 100;

    const updated = await krRepo.updateProgress(keyResultId, newCurrentValue, MVP_USER_ID);
    return { success: true, data: updated };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "KR 进度更新失败" };
  }
}

export async function handleHabitLoggedKRProgress(
  keyResultId: string,
): Promise<OKRActionResult<KeyResult>> {
  try {
    const krRepo = new KeyResultRepository();
    const kr = await krRepo.findById(keyResultId, MVP_USER_ID);
    if (!kr || kr.status !== "active") return { success: true };

    const newCurrentValue = kr.currentValue + 1;
    const updated = await krRepo.updateProgress(keyResultId, newCurrentValue, MVP_USER_ID);
    return { success: true, data: updated };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "KR 进度更新失败" };
  }
}

export async function handleTaskDeletedKRRecalc(
  keyResultId: string,
): Promise<OKRActionResult<KeyResult>> {
  try {
    const krRepo = new KeyResultRepository();
    const kr = await krRepo.findById(keyResultId, MVP_USER_ID);
    if (!kr || kr.status !== "active") return { success: true };

    const { db } = await import("@/lib/db");
    const { tasks } = await import("@/lib/db/schema");
    const { eq, and } = await import("drizzle-orm");
    const linkedTasks = await db.select().from(tasks)
      .where(and(eq(tasks.keyResultId, keyResultId), eq(tasks.userId, MVP_USER_ID)));

    const totalLinked = linkedTasks.length;
    if (totalLinked === 0) {
      // 无关联任务，进度归零
      const updated = await krRepo.updateProgress(keyResultId, 0, MVP_USER_ID);
      return { success: true, data: updated };
    }

    const completedLinked = linkedTasks.filter(t => t.status === "completed").length;
    const increment = kr.targetValue / totalLinked;
    const newCurrentValue = Math.round(completedLinked * increment * 100) / 100;

    const updated = await krRepo.updateProgress(keyResultId, newCurrentValue, MVP_USER_ID);
    return { success: true, data: updated };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "KR 进度重算失败" };
  }
}
