/**
 * @file wiring
 * @brief OKR 域编排器工厂与意图构造辅助（[022.01] Phase 1: 从 app/actions/okr.ts 提取）
 *
 * 单一职责：构造 OKR 域的 Orchestrator 实例（装配 repo/rule/event），
 * 以及构造该域通用的 StructuredIntent。供 okr.ts 各 server action
 * （createObjective / activateObjective / createCycle 等）共用，
 * 避免每个 action 各自重复实现编排器装配代码。
 *
 * [022.01] Task 2（eng-review D1）：
 * - wiring.ts 导出 createOKROrchestrator + makeIntent
 * - okr.ts 改为从本文件 import 这两个函数
 */

import { createOrchestrator } from "@/nexus/orchestrator";
import { createRuleEngine } from "@/nexus/core/rule-engine";
import { ObjectiveRepository } from "@/domains/okrs/repository/objective";
import { KeyResultRepository } from "@/domains/okrs/repository/key-result";
import { CycleRepository } from "@/domains/okrs/repository/cycle";
import { createOkrsGenericRepo } from "@/domains/okrs/repository/generic-repo-adapter";
import { SystemEventRepository } from "@/lib/db/repositories/system-event.repository";
import { TimeboxRepository } from "@/domains/timebox/repository";
import type { Timestamp, USOM_ID } from "@/usom/types/primitives";

/** MVP 用户 ID（与 app/actions/okr.ts 内部 const 保持一致） */
const MVP_USER_ID = "00000000-0000-0000-0000-000000000001";

/**
 * 创建 OKR 编排器实例
 *
 * 装配：4 个 repo（objective/keyResult/cycle/timebox）+ ruleEngine + eventBus
 * + 通用 repo 工厂（按 domainId/objectType 解析到 okrs 域 repo）。
 *
 * @returns OKR 编排器实例
 */
export async function createOKROrchestrator() {
  const objectiveRepo = new ObjectiveRepository();
  const keyResultRepo = new KeyResultRepository();
  const eventRepo = new SystemEventRepository();
  const timeboxRepo = new TimeboxRepository();
  const ruleEngine = createRuleEngine({ timeboxRepo, userId: MVP_USER_ID });

  const okrsRepos = createOkrsGenericRepo({
    objectiveRepo: objectiveRepo as any,
    keyResultRepo: keyResultRepo as any,
    cycleRepo: new CycleRepository() as any,
  });

  return createOrchestrator({
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
    getRepo: (domainId: string, objectType: string) => {
      if (domainId === 'okrs') {
        const repo = okrsRepos[objectType]
        if (!repo) throw new Error(`未找到 OKR repo: ${objectType}`)
        return repo
      }
      throw new Error(`getRepo: 不支持的域 ${domainId}`)
    },
  });
}

/**
 * 构建意图对象（OKR 域通用）
 *
 * @param action - 动作名称（如 'createCycle' / 'createObjective' / 'activateObjective'）
 * @param fields - 动作字段
 * @returns StructuredIntent 实例
 */
export function makeIntent(action: string, fields: Record<string, unknown>) {
  const now = new Date().toISOString() as Timestamp;
  return {
    id: crypto.randomUUID() as USOM_ID,
    intentionId: crypto.randomUUID() as USOM_ID,
    targetDomain: "okrs" as const,
    action,
    fields,
    confidence: 1.0,
    resolvedBy: "template_form" as const,
    createdAt: now,
  };
}
