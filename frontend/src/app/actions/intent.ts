/**
 * @file intent
 * @brief 意图处理 Server Action 模块
 * 
 * 处理用户意图提交、时间盒状态转换等核心业务逻辑
 * 支持 AI 解析和表单解析两种输入模式
 */

"use server";

import type { TimeboxSummary } from "@/usom/types/summaries";
import type { Timebox } from "@/usom/types/objects";
import type { USOM_ID, Timestamp } from "@/usom/types/primitives";
import type { ActionSurface } from "@/usom/types/process";
import type { TraceSession } from "@/nexus/infrastructure/trace-logger/trace-types";
import { TimeboxRepository } from "@/domains/timebox/repository";
import { ActivityArchetypeRepository } from "@/lib/db/repositories/activity-archetype.repository";
import { SystemEventRepository } from "@/lib/db/repositories/system-event.repository";
import { IntentionRepository } from "@/lib/db/repositories/intention.repository";
import { HabitRepository } from "@/domains/habits/repository/habit";
import { createOrchestrator } from "../../nexus/orchestrator";
import { createRuleEngine } from "../../nexus/core/rule-engine";
import { createTimeboxGenericRepo } from "@/domains/timebox/repository/generic-repo-adapter";
import { createHabitsGenericRepo } from "@/domains/habits/repository/generic-repo-adapter";
import { parse as parseIntent, parseBatch } from "../../nexus/core/intent-engine";
import { parseHabitWithAI, parseMultiTask } from "../../nexus/core/intent-engine/ai-parser";
import type { AIParserResult } from "../../nexus/core/intent-engine/ai-parser";
import type { BatchIntentResult } from "../../nexus/core/intent-engine";
export type { BatchIntentResult } from "../../nexus/core/intent-engine";
import { createAIRuntime } from "../../nexus/ai-runtime";
import { parseTemplateForm, parseDynamicForm } from "../../nexus/core/intent-engine/template-parser";
import type { TemplateFormFields } from "../../nexus/core/intent-engine/template-parser";
import { getRequiredFields, getActionDescription, getIntentTriggerViewRoute, getViewRoute, getFullManifest } from "@/domains/registry";
import { HABIT_ERRORS } from "@/lib/constants/habit-messages";
import { createActionSurfaceEngine } from "../../nexus/core/action-surface-engine";
import { TaskRepository } from "@/domains/tasks/repository/task";
import { ThreadRepository } from "@/domains/tasks/repository/thread";
import { createTasksGenericRepo } from "@/domains/tasks/repository/generic-repo-adapter";
import { timeboxPlugin } from "../../domains/timebox";
import { tasksPlugin } from "../../domains/tasks";
import { habitsPlugin } from "../../domains/habits";
import { createTraceLogger } from "../../nexus/infrastructure/trace-logger";
import { getTraceConfig } from "../../lib/config/trace-config";
import { surfaceHandlers as habitHandlers } from '@/domains/habits/cnui/handlers';
import { surfaceHandlers as timeboxHandlers } from '@/domains/timebox/cnui/handlers';
import { surfaceHandlers as taskHandlers } from '@/domains/tasks/cnui/handlers';
import type { CnuiSurfaceHandler } from '@/nexus/ai-runtime/cnui/types';
import { recordActivity } from './activity-recorder';
import { createHabitsMutationService } from '@/app/actions/habits/mutation-service';
import { createTasksMutationService } from '@/app/actions/tasks/mutation-service';

// ─── CNUI Handlers 注册 ───────────────────────────────────────────

/**
 * 各 domain 自注册的 CNUI handler 合并
 * 新增 domain 只需加一行 import + spread
 */
const CNUI_HANDLERS: Record<string, CnuiSurfaceHandler> = {
  ...habitHandlers,
  ...timeboxHandlers,
  ...taskHandlers,
}

// ─── 类型定义 ───────────────────────────────────────────────────

/**
 * 意图提交结果
 */
export interface IntentSubmissionResult {
  /** 提交是否成功 */
  success: boolean;
  /** State Machine 返回的操作对象（Task/Habit/Timebox 等） */
  object?: unknown;
  /** 最新的时间盒列表（供前端刷新） */
  timeboxes: TimeboxSummary[];
  /** 动作面（Action Surface Engine 生成） */
  actionSurface?: ActionSurface;
  /** 意图动作名（如 createThread） */
  action?: string;
  /** 目标域 ID（如 tasks） */
  domainId?: string;
  /** 错误信息 */
  error?: string;
  /** 规则引擎的警告 */
  warnings?: string[];
  /** 是否需要用户确认 */
  needsConfirmation?: boolean;
  /** 确认提示消息 */
  confirmationMessage?: string;
  /** [023] CN-UI 写入确认 — 需要先展示 CNUI Surface 供用户确认 */
  needsCnuiConfirmation?: boolean;
  /** [023] CN-UI 写入确认 — 目标 action */
  cnuiAction?: string;
  /** [023] CN-UI 写入确认 — 目标 domain */
  cnuiDomain?: string;
  /** [023] CN-UI 写入确认 — CNUI surface 类型 */
  cnuiSurface?: string;
  /** [023] CN-UI 写入确认 — Intent 已提取的字段（Surface 预填值） */
  cnuiIntentFields?: Record<string, unknown>;
  /** 追踪会话（仅当 TraceConfig.enabled 时） */
  traceSession?: TraceSession;
}

// ─── MVP 用户 ID ────────────────────────────────────────────────

/** MVP 用户 ID（临时使用，待认证模块完善后移除） */
const MVP_USER_ID = "00000000-0000-0000-0000-000000000001";

// ─── 辅助函数 ───────────────────────────────────────────────────

/**
 * 将 Timebox 对象转换为 TimeboxSummary
 * @param timebox - 时间盒对象
 * @param archetypeName - 活动原型名（[023] A2 OV#4 死字段最小消费方），来自 ActivityArchetype.l2Name
 * @returns 时间盒摘要
 */
function timeboxToSummary(timebox: Timebox, archetypeName?: string): TimeboxSummary {
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
    ...(archetypeName ? { archetypeName } : {}),
  };
}

/**
 * 批量解析活动原型名（避免 N+1）
 *
 * [023] A2 OV#4：按 archetypeId 去重后单次 findById 查表，构造 Map 供 mapper 使用。
 * 无 archetypeId 或查不到时返回空 Map，mapper 会跳过该字段。
 */
async function loadArchetypeNames(archetypeIds: string[]): Promise<Map<string, string>> {
  const unique = Array.from(new Set(archetypeIds.filter(Boolean)))
  if (unique.length === 0) return new Map()
  const repo = new ActivityArchetypeRepository()
  const entries = await Promise.all(
    unique.map(async id => {
      const arch = await repo.findById(id as USOM_ID, MVP_USER_ID)
      return [id, arch?.l2Name] as const
    }),
  )
  return new Map(entries.filter(([, name]) => Boolean(name)) as Array<[string, string]>)
}

/**
 * 根据日期范围获取时间盒摘要列表
 * @param start - 开始日期
 * @param end - 结束日期
 * @returns 时间盒摘要列表
 */
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

  // 批量解析 archetype 名（去重后单查，避免 N+1）
  const archetypeNames = await loadArchetypeNames(
    timeboxes.map(t => t.activityArchetypeId).filter((id): id is string => Boolean(id)) as string[],
  )

  return timeboxes.map(timebox => {
    const archName = timebox.activityArchetypeId
      ? archetypeNames.get(timebox.activityArchetypeId as unknown as string)
      : undefined
    return timeboxToSummary(timebox, archName)
  });
}

/**
 * 获取当天的时间盒摘要列表
 * @returns 当天时间盒摘要列表
 */
async function fetchTimeboxSummaries(): Promise<TimeboxSummary[]> {
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  return fetchTimeboxSummariesByRange(startOfDay, endOfDay);
}

// ─── 解析失败兜底辅助函数 ───────────────────────────────────────

/**
 * 从原始输入推断可能的 action 名称
 * @param rawInput - 用户原始输入
 * @returns 推断的 action 名称，或 undefined
 */
function guessActionFromInput(rawInput: string): string | undefined {
  const input = rawInput.toLowerCase()
  const ACTION_KEYWORDS: Record<string, string[]> = {
    createTask: ['创建任务', '新建任务', '添加任务', '/createtask'],
    createThread: ['创建主线', '新建主线', '/createthread'],
    updateTask: ['修改任务', '更新任务', '/updatetask'],
    completeTask: ['完成任务', '/completetask'],
    archiveTask: ['归档任务', '/archivetask'],
    deleteTask: ['删除任务', '/deletetask'],
  }
  for (const [action, keywords] of Object.entries(ACTION_KEYWORDS)) {
    if (keywords.some(kw => input.includes(kw))) return action
  }
  // 默认：创建任务（最常见操作）
  return 'createTask'
}

/**
 * 构建 CNUI 表单兜底 intent
 * 当 AI 解析失败时，构建一个低置信度 intent 触发 CNUI 表单让用户手动填写
 * @param rawInput - 用户原始输入
 * @param intentionId - 意图 ID
 * @returns 低置信度兜底解析结果
 */
function buildFallbackIntent(rawInput: string, intentionId: string): AIParserResult {
  return {
    success: true,
    intent: {
      id: crypto.randomUUID(),
      intentionId,
      targetDomain: 'tasks',
      action: guessActionFromInput(rawInput) ?? 'createTask',
      fields: {},
      confidence: 0.3,
      resolvedBy: 'ai',
      createdAt: new Date().toISOString(),
    } as any,
  }
}

/**
 * 创建并执行 Orchestrator 管道（提取公共逻辑）
 * 
 * @param rawInput - 用户原始输入
 * @param intentSupplier - 意图提供函数
 * @param confirmed - 是否已确认
 * @param traceEnabled - 是否启用追踪
 * @returns 意图提交结果
 */
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
    let parseResult = await intentSupplier();
    if (!parseResult.success || !parseResult.intent) {
      // ── 解析失败兜底 → 构建 CNUI 表单 intent ──
      // 从 rawInput 推断可能的 action，构建低置信度 intent
      // 让 Orchestrator 检测到 confidence < 0.5 时自动进入 CNUI 表单模式
      const fallbackIntentionId = crypto.randomUUID()
      parseResult = buildFallbackIntent(rawInput, fallbackIntentionId)

      // 如果兜底也失败，返回原始错误
      if (!parseResult.success || !parseResult.intent) {
        const timeboxes = await fetchTimeboxSummaries();
        if (logger) logger.endSession('error');
        return {
          success: false,
          timeboxes,
          error: parseResult.error ?? HABIT_ERRORS.INTENT_PARSE_FAILED,
          traceSession: logger?.getSessions()[0],
        };
      }
    }

    // Step 1.5: 规范化 intent.action
    // AI parser 的 routing prompt 使用 "domain.action" 格式（如 tasks.createThread），
    // AI 可能原样返回。剥离 domain 前缀，确保下游 ACTION_MAP / getObjectType 正常工作。
    if (parseResult.intent.action?.includes('.')) {
      parseResult.intent.action = parseResult.intent.action.split('.').pop()!
    }

    // Step 2-3: 创建 Orchestrator 并执行管道
    const timeboxRepo = new TimeboxRepository();
    const eventRepo = new SystemEventRepository();
    const ruleEngine = createRuleEngine({ timeboxRepo, userId: MVP_USER_ID });

    const timeboxRepos = createTimeboxGenericRepo({ timeboxRepo: timeboxRepo as any });

    const orchestrator = createOrchestrator({
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
      actionSurfaceEngine: (() => {
        const targetDomain = parseResult.intent?.targetDomain ?? 'timebox'
        const plugin = targetDomain === 'tasks' ? tasksPlugin
          : targetDomain === 'habits' ? habitsPlugin
          : timeboxPlugin
        return createActionSurfaceEngine(plugin)
      })(),
      getRepo: (domainId: string, objectType: string) => {
        // Timebox 域
        if (domainId === 'timebox') {
          const repo = timeboxRepos[objectType]
          if (!repo) throw new Error(`未找到 Timebox repo: ${objectType}`)
          return repo
        }
        // Tasks 域
        if (domainId === 'tasks') {
          const tasksRepos = createTasksGenericRepo({
            taskRepo: new TaskRepository() as any,
            threadRepo: new ThreadRepository() as any,
          })
          const repo = tasksRepos[objectType]
          if (!repo) throw new Error(`未找到 Tasks repo: ${objectType}`)
          return repo
        }
        // Habits 域
        if (domainId === 'habits') {
          const habitsRepos = createHabitsGenericRepo({
            habitRepo: new HabitRepository() as any,
            habitLogRepo: undefined as any,
          })
          const repo = habitsRepos[objectType]
          if (!repo) throw new Error(`未找到 Habits repo: ${objectType}`)
          return repo
        }
        throw new Error(`getRepo: 不支持的域 ${domainId}`)
      },
      // [025] D1：Orchestrator 契约路径带字段状态写复用 Tasks 域业务事实写入口。
      // 当 intent 携带 manifest field_metadata 声明的非路由键字段、且目标对象已存在时，
      // 由 Orchestrator 契约路径调用本回调，在 mutation service 单事务内原子完成
      // 「字段写 + 状态转换」（修复 SM updateStatus 丢弃 actualDuration/notes 的问题）。
      // 仅绑定 tasks 域；其他域命中时返回失败（当前无生产方）。
      executeFieldStateWrite: async ({ domainId, objectType, targetId, intentId, fieldSteps, stateAction, userId }) => {
        if (domainId !== 'tasks') {
          return { success: false, error: `executeFieldStateWrite 暂仅支持 tasks 域，收到: ${domainId}` }
        }
        const service = createTasksMutationService()
        const res = await service.execute(
          {
            // 用入参 intentId 做 AggregateIntent.id，建立与触发 intent 的追踪关联
            id: intentId,
            domainId,
            objectType,
            targetId,
            steps: [
              ...fieldSteps.map(f => ({ kind: 'field' as const, field: f.field, value: f.value })),
              { kind: 'state' as const, action: stateAction },
            ],
          },
          userId,
        )
        return { success: res.success, object: res.object as Record<string, unknown> | undefined, error: res.error }
      },
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
        needsCnuiConfirmation: result.needsCnuiConfirmation,
        cnuiAction: result.cnuiAction,
        cnuiDomain: result.cnuiDomain,
        cnuiSurface: result.cnuiSurface,
        cnuiIntentFields: result.cnuiIntentFields,
        traceSession: logger?.getSessions()[0],
      };
    }

    if (logger) logger.endSession('success');

    const si = parseResult.intent
    void recordActivity({
      activityType: 'intent_execute',
      source: 'ai_assistant',
      targetDomain: si.targetDomain,
      targetAction: si.action,
    })

    return {
      success: true,
      object: result.object,
      timeboxes,
      actionSurface: result.actionSurface,
      action: si.action,
      domainId: si.targetDomain,
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

/**
 * 提交自然语言意图
 * 
 * @param rawInput - 用户原始输入文本
 * @param confirmed - 是否已确认（用于二次确认场景）
 * @param traceEnabled - 是否启用追踪日志
 * @returns 意图提交结果
 */
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
      const aiRuntime = createAIRuntime();
      const parseResult = await parseIntent(rawInput, intentionId, aiRuntime);
      return parseResult;
    },
    confirmed,
    traceEnabled,
  );
}

/**
 * 提交表单模板意图
 * 
 * @param fields - 表单字段
 * @param confirmed - 是否已确认
 * @param traceEnabled - 是否启用追踪日志
 * @returns 意图提交结果
 */
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

// ─── 状态转换结果类型 ─────────────────────────────────────────────

/**
 * 时间盒状态转换结果
 */
export interface TransitionResult {
  /** 是否成功 */
  success: boolean
  /** 更新后的时间盒摘要 */
  timebox?: TimeboxSummary
  /** 动作面 */
  actionSurface?: ActionSurface
  /** 错误信息 */
  error?: string
  /** 警告信息 */
  warnings?: string[]
  /** 是否需要确认 */
  needsConfirmation?: boolean
  /** 确认消息 */
  confirmationMessage?: string
}

// ─── 状态转换 Server Action ──────────────────────────────────────

/**
 * 执行时间盒状态转换
 * 
 * @param timeboxId - 时间盒 ID
 * @param action - 转换动作（start/end/cancel/log/overtime）
 * @param executionRecord - 执行记录（仅 log 动作需要）
 * @param confirmed - 是否已确认
 * @returns 转换结果
 */
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

    const timeboxRepos = createTimeboxGenericRepo({ timeboxRepo: timeboxRepo as any });

    const orchestrator = createOrchestrator({
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
      getRepo: (domainId: string, objectType: string) => {
        if (domainId === 'timebox') {
          const repo = timeboxRepos[objectType]
          if (!repo) throw new Error(`未找到 Timebox repo: ${objectType}`)
          return repo
        }
        throw new Error(`getRepo: 不支持的域 ${domainId}`)
      },
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
    const updatedTimebox = result.object as Timebox | undefined;

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

/**
 * 获取当天的时间盒列表
 * @returns 时间盒摘要列表
 */
export async function getTimeboxes(): Promise<TimeboxSummary[]> {
  return fetchTimeboxSummaries();
}

// ─── 执行意图结果类型 ─────────────────────────────────────────────

/**
 * 执行意图结果
 */
export interface ExecutionIntentResult {
  /** 是否成功 */
  success: boolean;
  /** 时间盒列表 */
  timeboxes: TimeboxSummary[];
  /** 错误信息 */
  error?: string;
  /** 匹配到的时间盒 ID */
  matchedTimeboxId?: string;
}

/**
 * target 匹配：根据 AI 解析的 target 字段找到对应的时间盒 ID
 * 
 * @param target - 目标信息
 * @param timeboxes - 时间盒列表
 * @returns 匹配的时间盒 ID，未匹配返回 null
 */
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

/**
 * 提交自然语言执行意图（执行/记录类型）
 * 
 * @param rawInput - 用户原始输入
 * @returns 执行意图结果
 */
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
    const aiRuntime = createAIRuntime();
    const parseResult = await parseIntent(rawInput, intentionId, aiRuntime);
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
    // 批量解析 archetype 名（与 fetchTimeboxSummariesByRange 保持一致语义）
    const archetypeNames = await loadArchetypeNames(
      allTimeboxes.map(t => t.activityArchetypeId).filter((id): id is string => Boolean(id)) as string[],
    )
    const summaries = allTimeboxes.map(timebox => {
      const archName = timebox.activityArchetypeId
        ? archetypeNames.get(timebox.activityArchetypeId as unknown as string)
        : undefined
      return timeboxToSummary(timebox, archName)
    });

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
  const aiRuntime = createAIRuntime();
  const parseResult = await parseBatch(rawInput, intentionId, aiRuntime);
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
  /** [019.0] Lane B：字段级服务端错误（handler.submit 拆分自 orchestrator Rejected.errors），供 surface 回填 */
  errors?: string[];
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
    const message = err instanceof Error ? err.message : HABIT_ERRORS.FETCH_FAILED;
    return { success: false, error: message };
  }
}

/** 创建新习惯 */
export async function submitHabitIntent(
  input: CreateHabitInput,
): Promise<HabitActionResult> {
  try {
    const result = await submitDynamicIntent('habits', 'createHabit', { ...input })
    if (!result.success) {
      return { success: false, error: result.error }
    }
    return { success: true, habit: result.object as Habit | undefined }
  } catch (err) {
    const message = err instanceof Error ? err.message : HABIT_ERRORS.CREATE_FAILED;
    return { success: false, error: message };
  }
}

/** 更新习惯状态（暂停/恢复/归档） */
export async function updateHabitStatus(
  habitId: string,
  action: "activate" | "suspend" | "reactivate" | "archive",
): Promise<HabitActionResult> {
  try {
    const actionMap: Record<string, string> = {
      activate: "activateHabit",
      suspend: "suspendHabit",
      reactivate: "reactivateHabit",
      archive: "archiveHabit",
    }
    const result = await submitDynamicIntent('habits', actionMap[action], { habitId })
    if (!result.success) {
      return { success: false, error: result.error }
    }
    return { success: true, habit: result.object as Habit | undefined }
  } catch (err) {
    const message = err instanceof Error ? err.message : HABIT_ERRORS.STATUS_UPDATE_FAILED;
    return { success: false, error: message };
  }
}

/**
 * 删除习惯（软删除 → status = 'deleted'）
 *
 * 注意：已归档（archived）的习惯不可直接删除，需先取消归档到其他状态后再删除。
 * suspended 状态的 reactivateHabit intent 会将状态恢复为 active。
 */
export async function deleteHabit(
  habitId: string,
): Promise<HabitActionResult> {
  try {
    const result = await submitDynamicIntent('habits', 'deleteHabit', { habitId })
    if (!result.success) {
      return { success: false, error: result.error }
    }
    return { success: true }
  } catch (err) {
    const message = err instanceof Error ? err.message : HABIT_ERRORS.DELETE_FAILED;
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
    const message = err instanceof Error ? err.message : HABIT_ERRORS.CHECK_REFS_FAILED;
    return { success: false, error: message };
  }
}

/** 记录习惯打卡 */
export async function logHabit(
  habitId: string,
  fields?: {
    actualDuration?: number
    completionRating?: number
    energyLevel?: number
    note?: string
  },
): Promise<HabitActionResult> {
  try {
    const result = await submitDynamicIntent('habits', 'logHabit', { habitId, ...fields })
    if (!result.success) {
      return { success: false, error: result.error }
    }
    return { success: true, habit: result.object as Habit | undefined }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : '打卡失败' }
  }
}

/** 批量打卡 */
export async function batchLogHabits(
  items: Array<{
    habitId: string
    fields?: {
      actualDuration?: number
      completionRating?: number
      energyLevel?: number
      note?: string
    }
  }>,
): Promise<{ success: boolean; error?: string }> {
  let lastError: string | undefined
  for (const item of items) {
    const result = await logHabit(item.habitId, item.fields)
    if (!result.success) {
      lastError = result.error
    }
  }
  return { success: !lastError, error: lastError }
}

/**
 * 更新习惯字段（业务事实写入口单事务）
 *
 * [018-G1] G1-H：从 `habitRepo.update(整对象)` 迁移至
 * `createHabitsMutationService().execute(聚合 Intent, userId)` 单事务写。
 *
 * 修复三处缺陷：
 *  - F-1（字段覆盖）：旧 `repo.update(整对象)` 绕过 manifest field_metadata，
 *    未声明字段（如未来扩展）会被字段执行器拒写而旧路径静默放行。新路径每个
 *    FactField 经字段执行器字段级校验（enum/number/time 等），ContentField 直走
 *    Repo.updateFields，均按 manifest 声明路由。
 *  - F-3（原子性）：input 中多个字段构造为聚合 field steps，在 execute() 顶层
 *    db.transaction 内按声明顺序写入，任一字段校验失败即抛 FieldMutationError
 *    触发整体回滚——不再出现「部分字段落库、部分未落」的中间态。
 *  - F-2（frequency 合并）：frequencyType/daysOfWeek 是平铺列 frequency_type/
 *    days_of_week，单列写后 findById 经 habitRowToUSOM 重建 frequency 嵌套对象，
 *    不会因单写一列而清空另一列（mapper 总是从两列重建）。
 *
 * 契约保持：签名 `(habitId, input) => HabitActionResult` 不变；返回形状
 * 成功 `{success:true, habit}`、失败 `{success:false, error}` 不变。
 *
 * @param habitId - 习惯 ID
 * @param input - 更新数据（仅值非 undefined 的字段落库）
 * @returns 操作结果
 */
export async function updateHabit(
  habitId: string,
  input: UpdateHabitInput,
): Promise<HabitActionResult> {
  try {
    // 每个「值非 undefined」的字段构造一个 field step；undefined 字段不造步，
    // 避免误写 undefined 覆盖既有值（与旧 repo.update 的条件展开语义一致）。
    const fieldSteps = Object.entries(input)
      .filter(([, v]) => v !== undefined)
      .map(([field, value]) => ({ kind: 'field' as const, field, value }));

    if (fieldSteps.length === 0) {
      // 无字段可写：直接读回当前习惯返回（保持契约——成功且有 habit）
      const habitRepo = await getHabitRepo();
      const habit = await habitRepo.findById(habitId as USOM_ID, MVP_USER_ID as USOM_ID);
      if (!habit) return { success: false, error: `Habit ${habitId} not found` };
      return { success: true, habit };
    }

    const service = createHabitsMutationService();
    const res = await service.execute(
      {
        id: crypto.randomUUID() as USOM_ID,
        domainId: 'habits',
        objectType: 'habit',
        targetId: habitId as USOM_ID,
        steps: fieldSteps,
      },
      MVP_USER_ID as USOM_ID,
    );

    if (!res.success) {
      return { success: false, error: res.error ?? HABIT_ERRORS.UPDATE_FAILED };
    }

    // 纯 field steps 路径下 res.object 为 undefined（execute 仅在 state step 设 lastObject），
    // 兜底用 findById 读回更新后的习惯，满足契约 {success:true, habit}。
    if (res.object) {
      return { success: true, habit: res.object as Habit };
    }
    const habitRepo = await getHabitRepo();
    const habit = await habitRepo.findById(habitId as USOM_ID, MVP_USER_ID as USOM_ID);
    if (!habit) return { success: false, error: `Habit ${habitId} not found` };
    return { success: true, habit };
  } catch (err) {
    const message = err instanceof Error ? err.message : HABIT_ERRORS.UPDATE_FAILED;
    return { success: false, error: message };
  }
}

export async function resolveShortcut(rawInput: string): Promise<{ domainId: string; action: string; view_route?: string } | null> {
  const { matchShortcut } = await import("@/nexus/core/intent-engine/shortcut-matcher");
  // [023-01+ v2] RC-1 修复：取首个空白前的 command token 再 matchShortcut，
  //   使 /createTimebox [payload] 也能解析出 domain/action（路由用）。
  //   根因：matchShortcut 正则以 $ 结尾，整条 rawInput 含 payload 时恒不匹配 →
  //   resolveShortcut 返回 null → use-intent-handler 的 timebox 路由条件恒 false
  //   → chat 落到 submitIntent → parseWithAI 非确定性（tasks 域"任务标题必填" / "处理失败"）。
  //   注意：仅 resolveShortcut（路由解析）payload-aware；matchShortcut/parse 仍精确匹配，
  //   保留 parse()「纯快捷方式 → template_form」vs「带 payload → AI 解析」的区分语义，零回归。
  const commandToken = rawInput.split(/\s/)[0];
  const result = matchShortcut(commandToken);
  if (result) {
    const { getIntentTriggerViewRoute } = await import("@/domains/registry");
    const view_route = getIntentTriggerViewRoute(result.domainId, result.action);
    return { domainId: result.domainId, action: result.action, view_route };
  }
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

/** 查询 action 所需的表单字段和描述（供 CNUI surface 使用） */
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
): Promise<{ fields: ActionFieldDescriptor[]; description: string; hasFields: boolean; viewRoute?: string; viewComponent?: string }> {
  const fields = getRequiredFields(domainId, action)
  const description = getActionDescription(domainId, action)
  const viewRoute = getIntentTriggerViewRoute(domainId, action)
  const viewRouteInfo = getViewRoute(domainId, action)
  return {
    fields: fields as ActionFieldDescriptor[],
    description,
    hasFields: fields.length > 0,
    viewRoute,
    viewComponent: viewRouteInfo?.component,
  }
}

// ─── 习惯意图仅解析（不执行）Server Action ────────────────────────

export interface HabitParseResult {
  success: boolean;
  action?: string;
  fields?: Partial<import("@/domains/habits/components/habit-form").HabitFormFields>;
  error?: string;
}

/** 仅解析习惯意图，不执行管道。供 AI 助手路径使用。 */
export async function parseHabitIntentOnly(rawInput: string): Promise<HabitParseResult> {
  try {
    const intentionId = crypto.randomUUID();
    const aiRuntime = createAIRuntime();
    const parseResult = await parseHabitWithAI(rawInput, intentionId as any, aiRuntime);

    if (!parseResult.success || !parseResult.intent) {
      return { success: false, error: parseResult.error ?? HABIT_ERRORS.PARSE_FAILED };
    }

    return {
      success: true,
      action: parseResult.intent.action,
      fields: parseResult.intent.fields as Partial<import("@/domains/habits/components/habit-form").HabitFormFields>,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : HABIT_ERRORS.PARSE_FAILED;
    return { success: false, error: message };
  }
}

// ─── Timebox 多任务意图仅解析（[023-01+] dry-run Server Action）──

/**
 * [023-01+] 仅解析 timebox 多任务意图（不提交），返回 drafts 给 CNUI surface 预填。
 *
 * 与 submitBatchIntent 的区别：submitBatchIntent 解析后立即逐条提交；
 * 本函数是 dry-run，仅返回 drafts 让用户在 CNUI 表单里编辑确认后再提交。
 *
 * 路由来源：use-intent-handler.ts:483+ hasPayload 分支检测
 *   targetDomain === 'timebox' && targetAction === 'createTimebox'
 * 时调用，避免 chat 路径走 submitIntent → parseWithAI（弱 systemPrompt）
 * 的老 bug（模糊时间 / 含空格标题识别失败）。
 *
 * 复用 parseMultiTask（ai-parser.ts:383），MULTI_TASK_PROMPT 在 Commit 3
 * 强化过「上午/下午/晚上」默认值 + few-shot 示例。
 */
export interface TimeboxBatchParseResult {
  success: boolean
  drafts?: Array<{ title: string; startTime: string; endTime: string; duration?: number }>
  error?: string
}

export async function parseTimeboxBatchIntentOnly(rawInput: string): Promise<TimeboxBatchParseResult> {
  try {
    const intentionId = crypto.randomUUID() as USOM_ID
    const aiRuntime = createAIRuntime()
    const parseResult = await parseMultiTask(rawInput, intentionId, aiRuntime)

    if (!parseResult.success || parseResult.intents.length === 0) {
      return { success: false, error: parseResult.error ?? '未识别到有效的时间盒任务' }
    }

    const drafts = parseResult.intents.map((intent) => {
      const f = intent.fields as Record<string, unknown>
      return {
        title: String(f.title ?? ''),
        startTime: String(f.startTime ?? ''),
        endTime: String(f.endTime ?? ''),
        duration: typeof f.duration === 'number' ? f.duration : undefined,
      }
    })

    return { success: true, drafts }
  } catch (err) {
    const message = err instanceof Error ? err.message : '解析失败'
    return { success: false, error: message }
  }
}

// ─── CN-UI Surface Server Actions ──────────────────────────────────

import type { CnuiSurfaceRef } from "@/usom/types/objects";

export interface OpenCnuiSurfaceResult {
  content: string
  surface: CnuiSurfaceRef
}

/** 打开 CN-UI 表面（在对话流内渲染表单） */
export async function openCnuiSurface(
  domainId: string,
  action: string,
  intentFields?: Record<string, unknown>,
): Promise<OpenCnuiSurfaceResult> {
  // 从 manifest 获取 intent_trigger 元数据
  const fullManifest = getFullManifest(domainId) as Record<string, any> | undefined
  const intentTriggers = (fullManifest?.intent_triggers as Array<Record<string, any>> | undefined) ?? []
  const trigger = intentTriggers.find((t) => t.action === action)

  // 确定 surfaceType：优先从 intent_triggers.cnui_surface，其次 generation_actions.cnui_surface_type
  let surfaceType = trigger?.cnui_surface as string | undefined
  if (!surfaceType) {
    const genActions = fullManifest?.generation_actions as Record<string, any> | undefined
    const genAction = genActions?.[action]
    surfaceType = genAction?.cnui_surface_type as string | undefined
  }

  // 通过 registry 找到 handler
  if (!surfaceType) {
    return {
      content: `Unknown action: ${domainId}/${action}`,
      surface: {
        cnuiSurfaceId: crypto.randomUUID(),
        cnuiSurfaceType: 'unknown',
        domainId,
        action,
        dataSnapshot: {},
      },
    }
  }

  const handler = CNUI_HANDLERS[surfaceType]
  if (!handler) {
    return {
      content: `Handler 未找到: ${surfaceType}`,
      surface: {
        cnuiSurfaceId: crypto.randomUUID(),
        cnuiSurfaceType: surfaceType,
        domainId,
        action,
        dataSnapshot: {},
      },
    }
  }

  try {
    const result = await handler.open(action, intentFields)
    return {
      content: result.content,
      surface: {
        cnuiSurfaceId: crypto.randomUUID(),
        cnuiSurfaceType: surfaceType,
        domainId,
        action,
        dataSnapshot: result.dataSnapshot,
      },
    }
  } catch (e) {
    console.error(`[openCnuiSurface] handler.open failed for ${domainId}/${action}:`, e)
    return {
      content: '打开操作面板失败，请重试',
      surface: {
        cnuiSurfaceId: crypto.randomUUID(),
        cnuiSurfaceType: surfaceType,
        domainId,
        action,
        dataSnapshot: {},
      },
    }
  }
}

/** 提交 CN-UI 表面数据 */
export async function submitCnuiSurface(
  _cnuiSurfaceId: string,
  domainId: string,
  action: string,
  fields: Record<string, unknown>,
): Promise<HabitActionResult> {
  // 通过 manifest 确定 surfaceType，查找 handler
  const fullManifest = getFullManifest(domainId) as Record<string, any> | undefined
  const intentTriggers = (fullManifest?.intent_triggers as Array<Record<string, any>> | undefined) ?? []
  const trigger = intentTriggers.find((t) => t.action === action)

  let surfaceType = trigger?.cnui_surface as string | undefined
  if (!surfaceType) {
    const genActions = fullManifest?.generation_actions as Record<string, any> | undefined
    const genAction = genActions?.[action]
    surfaceType = genAction?.cnui_surface_type as string | undefined
  }

  if (!surfaceType) {
    return { success: false, error: `Unknown CN-UI action: ${domainId}/${action}` }
  }

  const handler = CNUI_HANDLERS[surfaceType]
  if (!handler) {
    return { success: false, error: `Handler 未找到: ${surfaceType}` }
  }

  // 委托给 domain handler 执行提交（[019.1] fieldMapping 恒等已退役，fields 直传）
  const result = await handler.submit(action, fields)
  // [019.0] Lane B：转发 handler 拆分的字段级 errors（之前被丢弃，导致回填管线断）
  return {
    success: result.success,
    error: result.error,
    errors: result.errors,
    ...(result.data ?? {}),
  }
}

/** 判断 action 的 response_type 是否为 cnui（读取 manifest，供客户端使用） */
export async function isCnuiSurface(domainId: string, action: string): Promise<boolean> {
  const fullManifest = getFullManifest(domainId) as Record<string, any> | undefined
  const intentTriggers = (fullManifest?.intent_triggers as Array<Record<string, any>> | undefined) ?? []
  const trigger = intentTriggers.find((t) => t.action === action)
  return trigger?.response_type === 'cnui'
}

/** 获取 action 的响应类型（服务端查询） */
// [023-01] 委托给 manifest-utils.getResponseType SSOT（Task 6 落定）。
//   返回类型从 string 收紧为 'cnui' | 'page' | 'text' | 'unimplemented'，
//   客户端 use-intent-handler.ts 可据此做 type narrowing + 'unimplemented' 待开发分支。
//   smoke test 见 __tests__/intent.test.ts:getActionResponse。
import { getResponseType } from '@/usom/manifest-utils'
export async function getActionResponse(domainId: string, action: string): Promise<{
  responseType: 'cnui' | 'page' | 'text' | 'unimplemented'
}> {
  return { responseType: getResponseType(domainId, action) }
}
