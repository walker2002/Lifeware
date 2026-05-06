"use server";

import type { TimeboxSummary } from "@/usom/types/summaries";
import type { Timebox } from "@/usom/types/objects";
import type { Timestamp } from "@/usom/types/primitives";
import type { ActionSurface } from "@/usom/types/process";
import type { TraceSession } from "@/nexus/infrastructure/trace-logger/trace-types";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { TimeboxRepository } from "@/lib/db/repositories/timebox.repository";
import { SystemEventRepository } from "@/lib/db/repositories/system-event.repository";
import { IntentionRepository } from "@/lib/db/repositories/intention.repository";
import { createOrchestrator } from "../../nexus/orchestrator";
import { createRuleEngine } from "../../nexus/core/rule-engine";
import { parse as parseIntent } from "../../nexus/core/intent-engine";
import { parseTemplateForm } from "../../nexus/core/intent-engine/template-parser";
import type { TemplateFormFields } from "../../nexus/core/intent-engine/template-parser";
import { createActionSurfaceEngine } from "../../nexus/core/action-surface-engine";
import { timeboxPlugin } from "../../domains/timebox";
import { createTraceLogger } from "../../nexus/infrastructure/trace-logger";
import { getTraceConfig } from "../../lib/config/trace-config";
import { eq, desc } from "drizzle-orm";

// ─── 类型定义 ───────────────────────────────────────────────────

/** 意图提交结果 */
export interface IntentSubmissionResult {
  success: boolean;
  /** 最新的时间盒列表（供前端刷新） */
  timeboxes: TimeboxSummary[];
  /** 动作面（Action Surface Engine 生成） */
  actionSurface?: ActionSurface;
  /** 错误信息 */
  error?: string;
  /** 规则引擎的警告 */
  warnings?: string[];
  /** 是否需要用户确认 */
  needsConfirmation?: boolean;
  /** 确认提示消息 */
  confirmationMessage?: string;
  /** 追踪会话（仅当 TraceConfig.enabled 时） */
  traceSession?: TraceSession;
}

// ─── MVP 用户 ID ────────────────────────────────────────────────

const MVP_USER_ID = "00000000-0000-0000-0000-000000000001";

// ─── 辅助函数 ───────────────────────────────────────────────────

function timeboxToSummary(timebox: Timebox): TimeboxSummary {
  return {
    id: timebox.id,
    title: timebox.title,
    status: timebox.status,
    startTime: timebox.startTime,
    endTime: timebox.endTime,
    taskIds: timebox.taskIds,
    habitIds: timebox.habitIds,
  };
}

async function fetchTimeboxSummariesByRange(
  start: Date,
  end: Date,
): Promise<TimeboxSummary[]> {
  const timeboxRepo = new TimeboxRepository();

  const timeboxes = await timeboxRepo.findByDateRange(
    start.toISOString() as Timestamp,
    end.toISOString() as Timestamp,
    MVP_USER_ID,
  );

  return timeboxes.map(timeboxToSummary);
}

async function fetchTimeboxSummaries(): Promise<TimeboxSummary[]> {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return fetchTimeboxSummariesByRange(startOfDay, endOfDay);
}

/** 创建并执行 Orchestrator 管道（提取公共逻辑） */
async function executePipeline(
  rawInput: string,
  intentSupplier: () => Promise<{ success: boolean; intent?: any; error?: string }>,
  confirmed?: boolean,
  traceEnabled?: boolean,
): Promise<IntentSubmissionResult> {
  const traceConfig = getTraceConfig();
  const shouldTrace = traceEnabled ?? traceConfig.enabled;
  const logger = shouldTrace ? createTraceLogger() : null;

  try {
    if (logger) logger.startSession(rawInput);

    // Step 1: 解析意图
    const parseResult = await intentSupplier();
    if (!parseResult.success || !parseResult.intent) {
      const timeboxes = await fetchTimeboxSummaries();
      if (logger) logger.endSession('error');
      return {
        success: false,
        timeboxes,
        error: parseResult.error ?? "意图解析失败，请重试",
        traceSession: logger?.getSessions()[0],
      };
    }

    // Step 2-3: 创建 Orchestrator 并执行管道
    const timeboxRepo = new TimeboxRepository();
    const eventRepo = new SystemEventRepository();
    const ruleEngine = createRuleEngine({ timeboxRepo, userId: MVP_USER_ID });

    const orchestrator = createOrchestrator({
      timeboxRepo,
      eventRepo,
      intentEngine: { parse: async () => parseResult.intent! },
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
      actionSurfaceEngine: createActionSurfaceEngine(timeboxPlugin),
      onTrace: logger?.onTrace,
    });

    const result = await orchestrator.execute(rawInput, MVP_USER_ID, confirmed);
    const timeboxes = await fetchTimeboxSummaries();

    if (!result.success) {
      if (logger) logger.endSession('error');
      return {
        success: false,
        timeboxes,
        error: result.error,
        needsConfirmation: result.needsConfirmation,
        confirmationMessage: result.confirmationMessage,
        traceSession: logger?.getSessions()[0],
      };
    }

    if (logger) logger.endSession('success');
    return {
      success: true,
      timeboxes,
      actionSurface: result.actionSurface,
      warnings: result.warnings,
      traceSession: logger?.getSessions()[0],
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";
    if (logger) logger.endSession('error');

    try {
      const timeboxes = await fetchTimeboxSummaries();
      return { success: false, timeboxes, error: message, traceSession: logger?.getSessions()[0] };
    } catch {
      return { success: false, timeboxes: [], error: message };
    }
  }
}

// ─── Server Actions ─────────────────────────────────────────────

export async function submitIntent(
  rawInput: string,
  confirmed?: boolean,
  traceEnabled?: boolean,
): Promise<IntentSubmissionResult> {
  // Step 0: 创建 Intention 记录
  const intentionRepo = new IntentionRepository();
  const intentionId = crypto.randomUUID();
  const now = new Date().toISOString() as Timestamp;

  await intentionRepo.save(
    { id: intentionId, status: "captured", rawInput, inputMode: "natural_language", capturedAt: now },
    MVP_USER_ID,
  );

  return executePipeline(
    rawInput,
    async () => {
      const parseResult = await parseIntent(rawInput, intentionId);
      return parseResult;
    },
    confirmed,
    traceEnabled,
  );
}

export async function submitTemplateIntent(
  fields: TemplateFormFields,
  confirmed?: boolean,
  traceEnabled?: boolean,
): Promise<IntentSubmissionResult> {
  // Step 0: 创建 Intention 记录
  const intentionRepo = new IntentionRepository();
  const intentionId = crypto.randomUUID();
  const now = new Date().toISOString() as Timestamp;

  await intentionRepo.save(
    { id: intentionId, status: "captured", rawInput: `[表单] ${fields.title}`, inputMode: "template_form", capturedAt: now },
    MVP_USER_ID,
  );

  const intent = parseTemplateForm(fields, intentionId);

  return executePipeline(
    `[表单] ${fields.title}`,
    async () => ({ success: true, intent }),
    confirmed,
    traceEnabled,
  );
}

export async function getTimeboxes(): Promise<TimeboxSummary[]> {
  return fetchTimeboxSummaries();
}

export async function getTimeboxesByRange(
  start: Date,
  end: Date,
): Promise<TimeboxSummary[]> {
  return fetchTimeboxSummariesByRange(start, end);
}
