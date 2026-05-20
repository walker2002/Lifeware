"use server";

import type { TimeboxSummary } from "@/usom/types/summaries";
import type { Timebox } from "@/usom/types/objects";
import type { Timestamp } from "@/usom/types/primitives";
import type { ActionSurface } from "@/usom/types/process";
import type { TraceSession } from "@/nexus/infrastructure/trace-logger/trace-types";
import { db } from "@/lib/db";
import * as schema from "@/lib/db/schema";
import { TimeboxRepository } from "@/domains/timebox/repository";
import { SystemEventRepository } from "@/lib/db/repositories/system-event.repository";
import { IntentionRepository } from "@/lib/db/repositories/intention.repository";
import { HabitRepository } from "@/domains/habits/repository/habit";
import { createOrchestrator } from "../../nexus/orchestrator";
import { createRuleEngine } from "../../nexus/core/rule-engine";
import { parse as parseIntent, parseBatch } from "../../nexus/core/intent-engine";
import type { BatchIntentResult } from "../../nexus/core/intent-engine";
export type { BatchIntentResult } from "../../nexus/core/intent-engine";
import { parseTemplateForm, parseDynamicForm } from "../../nexus/core/intent-engine/template-parser";
import type { TemplateFormFields } from "../../nexus/core/intent-engine/template-parser";
import { getRequiredFields, hasRequiredFields, getActionDescription } from "@/domains/registry";
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
    startedAt: timebox.startedAt,
    overtimeAt: timebox.overtimeAt,
    endedAt: timebox.endedAt,
    loggedAt: timebox.loggedAt,
    executionRecord: timebox.executionRecord,
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

// ─── 执行记录结果类型 ─────────────────────────────────────────────

export interface TransitionResult {
  success: boolean
  timebox?: TimeboxSummary
  actionSurface?: ActionSurface
  error?: string
  warnings?: string[]
  needsConfirmation?: boolean
  confirmationMessage?: string
}

// ─── 状态转换 Server Action ──────────────────────────────────────

export async function transitionTimebox(
  timeboxId: string,
  action: 'start' | 'end' | 'cancel' | 'log' | 'overtime',
  executionRecord?: import("@/usom/types/objects").ExecutionRecord,
  confirmed?: boolean,
): Promise<TransitionResult> {
  try {
    const timeboxRepo = new TimeboxRepository();
    const eventRepo = new SystemEventRepository();
    const ruleEngine = createRuleEngine({ timeboxRepo, userId: MVP_USER_ID });

    const orchestrator = createOrchestrator({
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
      actionSurfaceEngine: createActionSurfaceEngine(timeboxPlugin),
    });

    const payload: Record<string, unknown> = {};
    if (action === 'log' && executionRecord) {
      payload.executionRecord = executionRecord;
    }

    const result = await orchestrator.executeTransition(
      timeboxId,
      action,
      MVP_USER_ID,
      payload,
      confirmed,
    );

    // 获取更新后的时间盒用于返回摘要
    const updatedTimebox = result.timebox;

    return {
      success: result.success,
      timebox: updatedTimebox ? timeboxToSummary(updatedTimebox) : undefined,
      actionSurface: result.actionSurface,
      error: result.error,
      warnings: result.warnings,
      needsConfirmation: result.needsConfirmation,
      confirmationMessage: result.confirmationMessage,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";
    return { success: false, error: message };
  }
}

export async function getTimeboxes(): Promise<TimeboxSummary[]> {
  return fetchTimeboxSummaries();
}

// ─── 执行意图结果类型 ─────────────────────────────────────────────

export interface ExecutionIntentResult {
  success: boolean;
  timeboxes: TimeboxSummary[];
  error?: string;
  matchedTimeboxId?: string;
}

/** target 匹配：根据 AI 解析的 target 字段找到对应的时间盒 ID */
function matchTarget(
  target: { type: string; value: string },
  timeboxes: TimeboxSummary[],
): string | null {
  if (target.type === "current" || target.value === "running") {
    const running = timeboxes.find(t => t.status === "running");
    return running?.id ?? null;
  }

  if (target.type === "index") {
    const idx = parseInt(target.value, 10) - 1;
    return timeboxes[idx]?.id ?? null;
  }

  // title 模糊匹配
  const keyword = target.value.toLowerCase();
  const match = timeboxes.find(t =>
    t.title.toLowerCase().includes(keyword),
  );
  return match?.id ?? null;
}

// ─── 自然语言执行意图 Server Action ────────────────────────────────

export async function submitExecutionIntent(
  rawInput: string,
): Promise<ExecutionIntentResult> {
  try {
    // 1. 创建 Intention
    const intentionRepo = new IntentionRepository();
    const intentionId = crypto.randomUUID();
    const now = new Date().toISOString() as Timestamp;

    await intentionRepo.save(
      { id: intentionId, status: "captured", rawInput, inputMode: "natural_language", capturedAt: now },
      MVP_USER_ID,
    );

    // 2. AI 解析
    const parseResult = await parseIntent(rawInput, intentionId);
    if (!parseResult.success || !parseResult.intent) {
      const timeboxes = await fetchTimeboxSummaries();
      return { success: false, timeboxes, error: parseResult.error ?? "解析失败" };
    }

    const intent = parseResult.intent;
    const action = intent.action as string;

    // 检查是否为执行动作
    const executionActions = ["start_timebox", "end_timebox", "cancel_timebox", "log_timebox"];
    if (!executionActions.includes(action)) {
      const timeboxes = await fetchTimeboxSummaries();
      return { success: false, timeboxes, error: "非执行意图" };
    }

    // 3. target 匹配
    const target = intent.fields.target as { type: string; value: string } | undefined;
    if (!target) {
      const timeboxes = await fetchTimeboxSummaries();
      return { success: false, timeboxes, error: "未指定目标时间盒" };
    }

    // 获取当天时间盒用于匹配
    const timeboxRepo = new TimeboxRepository();
    const allTimeboxes = await timeboxRepo.findByDateRange(
      new Date(new Date().setHours(0, 0, 0, 0)).toISOString() as Timestamp,
      new Date(new Date().setHours(23, 59, 59, 999)).toISOString() as Timestamp,
      MVP_USER_ID,
    );
    const summaries = allTimeboxes.map(timeboxToSummary);

    const matchedId = matchTarget(target, summaries);
    if (!matchedId) {
      return { success: false, timeboxes: summaries, error: `找不到匹配的时间盒："${target.value}"` };
    }

    // 4. 执行转换
    const shortAction = action.replace("_timebox", "") as "start" | "end" | "cancel" | "log";
    const result = await transitionTimebox(matchedId, shortAction);
    const timeboxes = await fetchTimeboxSummaries();

    return {
      success: result.success,
      timeboxes,
      error: result.error,
      matchedTimeboxId: matchedId,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";
    const timeboxes = await fetchTimeboxSummaries();
    return { success: false, timeboxes, error: message };
  }
}

// ─── 多任务批量创建 Server Action ─────────────────────────────────

export async function submitBatchIntent(
  rawInput: string,
): Promise<BatchIntentResult> {
  // 1. 创建 Intention
  const intentionRepo = new IntentionRepository();
  const intentionId = crypto.randomUUID();
  const now = new Date().toISOString() as Timestamp;

  await intentionRepo.save(
    { id: intentionId, status: "captured", rawInput, inputMode: "natural_language", capturedAt: now },
    MVP_USER_ID,
  );

  // 2. AI 批量解析
  const parseResult = await parseBatch(rawInput, intentionId);
  if (!parseResult.success || parseResult.intents.length === 0) {
    return { results: [{ index: 0, title: rawInput.slice(0, 50), error: parseResult.error ?? "未识别到有效任务" }] };
  }

  // 3. 每个任务生成独立的自然语言描述，复用 submitIntent
  const results: BatchIntentResult["results"] = [];
  for (let i = 0; i < parseResult.intents.length; i++) {
    const intent = parseResult.intents[i];
    const title = (intent.fields.title as string) ?? `任务${i + 1}`;
    const startTime = intent.fields.startTime as string;
    const duration = intent.fields.duration as number;
    const taskDesc = `${title} 开始时间${startTime} 持续${duration}分钟`;

    try {
      const result = await submitIntent(taskDesc, false, false);
      if (result.success) {
        const created = result.timeboxes.find(t => t.title === title);
        results.push({ index: i, title, timeboxId: created?.id });
      } else {
        results.push({
          index: i,
          title,
          error: result.error,
          warning: result.warnings?.[0],
          needsConfirmation: result.needsConfirmation,
        });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "未知错误";
      results.push({ index: i, title, error: message });
    }
  }

  // 4. 返回最终时间盒列表
  return { results };
}

export async function getTimeboxesByRange(
  start: Date,
  end: Date,
): Promise<TimeboxSummary[]> {
  return fetchTimeboxSummariesByRange(start, end);
}

// ─── Habit Server Actions ─────────────────────────────────────────

import type { Habit } from "@/usom/types/objects";
import type { CreateHabitInput, UpdateHabitInput } from "@/usom/interfaces/irepository";

export interface HabitActionResult {
  success: boolean;
  habit?: Habit;
  habits?: Habit[];
  error?: string;
}

async function getHabitRepo(): Promise<HabitRepository> {
  return new HabitRepository();
}

/** 获取当前用户的所有习惯 */
export async function getHabits(): Promise<HabitActionResult> {
  try {
    const repo = await getHabitRepo();
    const habits = await repo.findByUserId(MVP_USER_ID);
    return { success: true, habits };
  } catch (err) {
    const message = err instanceof Error ? err.message : "获取习惯列表失败";
    return { success: false, error: message };
  }
}

/** 创建新习惯 */
export async function submitHabitIntent(
  input: CreateHabitInput,
): Promise<HabitActionResult> {
  try {
    const habitRepo = await getHabitRepo();
    const eventRepo = new SystemEventRepository();

    const orchestrator = createOrchestrator({
      timeboxRepo: new TimeboxRepository(),
      eventRepo,
      intentEngine: { parse: async () => { throw new Error("not used") } },
      ruleEngine: {
        evaluate: async () => ({
          result: "pass" as const,
          warnings: [],
          confirmations: [],
        }),
      },
      habitRepo,
    });

    const intentionId = crypto.randomUUID();
    const now = new Date().toISOString() as Timestamp;

    const intent: import("@/usom/types/objects").StructuredIntent = {
      id: crypto.randomUUID(),
      intentionId,
      targetDomain: "habits",
      action: "createHabit",
      fields: { ...input },
      confidence: 1.0,
      resolvedBy: "template_form",
      createdAt: now,
    };

    const result = await orchestrator.executeIntent(intent, MVP_USER_ID);

    if (!result.success) {
      return { success: false, error: result.error };
    }

    return { success: true, habit: result.habit };
  } catch (err) {
    const message = err instanceof Error ? err.message : "创建习惯失败";
    return { success: false, error: message };
  }
}

/** 更新习惯状态（暂停/恢复/归档） */
export async function updateHabitStatus(
  habitId: string,
  action: "activate" | "suspend" | "reactivate" | "archive",
): Promise<HabitActionResult> {
  try {
    const habitRepo = await getHabitRepo();
    const eventRepo = new SystemEventRepository();

    const orchestrator = createOrchestrator({
      timeboxRepo: new TimeboxRepository(),
      eventRepo,
      intentEngine: { parse: async () => { throw new Error("not used") } },
      ruleEngine: {
        evaluate: async () => ({
          result: "pass" as const,
          warnings: [],
          confirmations: [],
        }),
      },
      habitRepo,
    });

    const now = new Date().toISOString() as Timestamp;
    const actionMap: Record<string, string> = {
      activate: "activateHabit",
      suspend: "suspendHabit",
      reactivate: "reactivateHabit",
      archive: "archiveHabit",
    };

    const intent: import("@/usom/types/objects").StructuredIntent = {
      id: crypto.randomUUID(),
      intentionId: crypto.randomUUID(),
      targetDomain: "habits",
      action: actionMap[action],
      fields: { habitId },
      confidence: 1.0,
      resolvedBy: "template_form",
      createdAt: now,
    };

    const result = await orchestrator.executeIntent(intent, MVP_USER_ID);

    if (!result.success) {
      return { success: false, error: result.error };
    }

    return { success: true, habit: result.habit };
  } catch (err) {
    const message = err instanceof Error ? err.message : "更新习惯状态失败";
    return { success: false, error: message };
  }
}

/** 删除习惯 */
export async function deleteHabit(
  habitId: string,
): Promise<HabitActionResult> {
  try {
    const repo = await getHabitRepo();
    await repo.delete(habitId, MVP_USER_ID);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "删除习惯失败";
    return { success: false, error: message };
  }
}

/** 检查习惯引用状态 */
export async function checkHabitReferences(
  habitId: string,
): Promise<{ success: boolean; references?: import("@/usom/interfaces/irepository").HabitReferenceInfo; error?: string }> {
  try {
    const repo = await getHabitRepo();
    const references = await repo.checkReferences(habitId, MVP_USER_ID);
    return { success: true, references };
  } catch (err) {
    const message = err instanceof Error ? err.message : "检查引用失败";
    return { success: false, error: message };
  }
}

/** 更新习惯信息 */
export async function updateHabit(
  habitId: string,
  input: UpdateHabitInput,
): Promise<HabitActionResult> {
  try {
    const repo = await getHabitRepo();
    const habit = await repo.update(habitId, input, MVP_USER_ID);
    return { success: true, habit };
  } catch (err) {
    const message = err instanceof Error ? err.message : "更新习惯失败";
    return { success: false, error: message };
  }
}

// ─── Template Server Actions ────────────────────────────────────

import { HabitTemplateRepository } from "@/domains/habits/repository/habit-template";
import type { HabitTemplate } from "@/usom/types/objects";
import type { CreateTemplateInput, TemplateHabitOverrides } from "@/usom/interfaces/irepository";

export interface TemplateActionResult {
  success: boolean;
  template?: HabitTemplate;
  templates?: HabitTemplate[];
  generatedTimeboxes?: import("@/usom/types/objects").Timebox[];
  error?: string;
}

async function getTemplateRepo(): Promise<HabitTemplateRepository> {
  return new HabitTemplateRepository();
}

/** 获取所有模板 */
export async function getTemplates(): Promise<TemplateActionResult> {
  try {
    const repo = await getTemplateRepo();
    const templates = await repo.findByUserId(MVP_USER_ID);
    return { success: true, templates };
  } catch (err) {
    const message = err instanceof Error ? err.message : "获取模板列表失败";
    return { success: false, error: message };
  }
}

/** 创建模板 */
export async function createTemplate(
  input: CreateTemplateInput,
): Promise<TemplateActionResult> {
  try {
    const repo = await getTemplateRepo();
    const template = await repo.create(input, MVP_USER_ID);
    return { success: true, template };
  } catch (err) {
    const message = err instanceof Error ? err.message : "创建模板失败";
    return { success: false, error: message };
  }
}

/** 更新模板 */
export async function updateTemplate(
  id: string,
  data: { name?: string; description?: string; icon?: string; applicableDays?: number[] },
): Promise<TemplateActionResult> {
  try {
    const repo = await getTemplateRepo();
    const template = await repo.update(id, data, MVP_USER_ID);
    return { success: true, template };
  } catch (err) {
    const message = err instanceof Error ? err.message : "更新模板失败";
    return { success: false, error: message };
  }
}

/** 删除模板 */
export async function deleteTemplate(
  id: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const repo = await getTemplateRepo();
    await repo.delete(id, MVP_USER_ID);
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "删除模板失败";
    return { success: false, error: message };
  }
}

/** 添加习惯到模板 */
export async function addHabitToTemplate(
  templateId: string,
  habitId: string,
  overrides?: TemplateHabitOverrides,
): Promise<TemplateActionResult> {
  try {
    const repo = await getTemplateRepo();
    await repo.addHabit(templateId, habitId, overrides ?? undefined, MVP_USER_ID);
    const template = await repo.findById(templateId, MVP_USER_ID);
    return { success: true, template: template ?? undefined };
  } catch (err) {
    const message = err instanceof Error ? err.message : "添加习惯到模板失败";
    return { success: false, error: message };
  }
}

/** 从模板移除习惯 */
export async function removeHabitFromTemplate(
  templateId: string,
  habitId: string,
): Promise<TemplateActionResult> {
  try {
    const repo = await getTemplateRepo();
    await repo.removeHabit(templateId, habitId, MVP_USER_ID);
    const template = await repo.findById(templateId, MVP_USER_ID);
    return { success: true, template: template ?? undefined };
  } catch (err) {
    const message = err instanceof Error ? err.message : "从模板移除习惯失败";
    return { success: false, error: message };
  }
}

/** 应用模板生成每日时间盒 */
export async function applyTemplate(
  templateId: string,
  date: string,
): Promise<TemplateActionResult> {
  try {
    const habitRepo = await getHabitRepo();
    const templateRepo = await getTemplateRepo();
    const timeboxRepo = new TimeboxRepository();
    const eventRepo = new SystemEventRepository();

    const orchestrator = createOrchestrator({
      timeboxRepo,
      eventRepo,
      intentEngine: { parse: async () => { throw new Error("not used") } },
      ruleEngine: {
        evaluate: async () => ({
          result: "pass" as const,
          warnings: [],
          confirmations: [],
        }),
      },
      habitRepo,
      templateRepo,
    });

    const result = await orchestrator.applyTemplate(templateId, date, MVP_USER_ID);

    if (!result.success) {
      return { success: false, error: result.error };
    }

    return { success: true, generatedTimeboxes: result.generatedTimeboxes };
  } catch (err) {
    const message = err instanceof Error ? err.message : "应用模板失败";
    return { success: false, error: message };
  }
}

export async function resolveShortcut(rawInput: string): Promise<{ domainId: string; action: string } | null> {
  const { matchShortcut } = await import("@/nexus/core/intent-engine/shortcut-matcher");
  const result = matchShortcut(rawInput);
  if (result) return { domainId: result.domainId, action: result.action };
  return null;
}

export async function fetchDomainActions() {
  const { getAllDomainActions, domainRegistry } = await import("@/domains/registry");
  const actions = getAllDomainActions();
  if (actions.length === 0) {
    console.warn('[fetchDomainActions] 返回空数据 — domainRegistry 长度:', domainRegistry.length);
    for (const plugin of domainRegistry) {
      console.warn(`  - ${plugin.manifest.domainId}: intentTriggers=${plugin.manifest.intentTriggers?.length ?? 'undefined'}`);
    }
  }
  return actions;
}

// ─── 动态表单提交 Server Action ──────────────────────────────────

export async function submitDynamicIntent(
  domainId: string,
  action: string,
  fields: Record<string, unknown>,
  confirmed?: boolean,
  traceEnabled?: boolean,
): Promise<IntentSubmissionResult> {
  const intentionRepo = new IntentionRepository();
  const intentionId = crypto.randomUUID();
  const now = new Date().toISOString() as Timestamp;

  await intentionRepo.save(
    { id: intentionId, status: "captured", rawInput: `[表单] ${domainId}:${action}`, inputMode: "template_form", capturedAt: now },
    MVP_USER_ID,
  );

  const intent = parseDynamicForm(domainId, action, fields, intentionId);

  return executePipeline(
    `[表单] ${domainId}:${action}`,
    async () => ({ success: true, intent }),
    confirmed,
    traceEnabled,
  );
}

/** 查询 action 所需的表单字段和描述（供客户端 DynamicForm/ActionConfirm 使用） */
export type ActionFieldType = 'text' | 'textarea' | 'number' | 'date' | 'time' | 'select' | 'multiselect' | 'toggle'

export interface ActionFieldDescriptor {
  name: string
  label: string
  type: ActionFieldType
  required: boolean
  options?: string[]
  default_value?: unknown
  placeholder?: string
}

export async function fetchActionData(
  domainId: string,
  action: string,
): Promise<{ fields: ActionFieldDescriptor[]; description: string; hasFields: boolean }> {
  const fields = getRequiredFields(domainId, action)
  const description = getActionDescription(domainId, action)
  return {
    fields: fields as ActionFieldDescriptor[],
    description,
    hasFields: fields.length > 0,
  }
}
