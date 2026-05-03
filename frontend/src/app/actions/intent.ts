"use server";

import type { TimeboxSummary } from "@/usom/types/summaries";
import type { Timebox } from "@/usom/types/objects";
import type { Timestamp } from "@/usom/types/primitives";
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
import { eq, desc } from "drizzle-orm";

// ─── 类型定义 ───────────────────────────────────────────────────

/** 意图提交结果 */
export interface IntentSubmissionResult {
  success: boolean;
  /** 最新的时间盒列表（供前端刷新） */
  timeboxes: TimeboxSummary[];
  /** 错误信息 */
  error?: string;
  /** 规则引擎的警告 */
  warnings?: string[];
  /** 是否需要用户确认 */
  needsConfirmation?: boolean;
}

// ─── MVP 用户 ID ────────────────────────────────────────────────

const MVP_USER_ID = "00000000-0000-0000-0000-000000000001";

// ─── 辅助函数 ───────────────────────────────────────────────────

/**
 * 将 Timebox USOM 对象转换为 TimeboxSummary
 */
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

/**
 * 从数据库获取最新时间盒列表
 */
async function fetchTimeboxSummaries(): Promise<TimeboxSummary[]> {
  const timeboxRepo = new TimeboxRepository();

  // 获取今天的时间范围
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    23,
    59,
    59,
    999,
  );

  const timeboxes = await timeboxRepo.findByDateRange(
    startOfDay.toISOString() as Timestamp,
    endOfDay.toISOString() as Timestamp,
    MVP_USER_ID,
  );

  return timeboxes.map(timeboxToSummary);
}

// ─── Server Action ──────────────────────────────────────────────

/**
 * submitIntent — 意图提交 Server Action
 *
 * 完整 Nexus 管道：
 * 1. 创建 Intention 记录
 * 2. 解析意图（Intent Engine）
 * 3. 规则评估（Rule Engine）
 * 4. 执行状态机（State Machine）
 * 5. 返回最新时间盒列表
 */
export async function submitIntent(
  rawInput: string,
): Promise<IntentSubmissionResult> {
  try {
    // Step 1: 创建 Intention 记录
    const intentionRepo = new IntentionRepository();
    const intentionId = crypto.randomUUID();
    const now = new Date().toISOString() as Timestamp;

    await intentionRepo.save(
      {
        id: intentionId,
        status: "captured",
        rawInput,
        inputMode: "natural_language",
        capturedAt: now,
      },
      MVP_USER_ID,
    );

    // Step 2: 解析意图
    const parseResult = await parseIntent(rawInput, intentionId);
    if (!parseResult.success || !parseResult.intent) {
      // 返回当前时间盒列表和错误
      const timeboxes = await fetchTimeboxSummaries();
      return {
        success: false,
        timeboxes,
        error: parseResult.error ?? "意图解析失败，请重试",
      };
    }

    // Step 3-4: 创建 Orchestrator 并执行管道
    const timeboxRepo = new TimeboxRepository();
    const eventRepo = new SystemEventRepository();
    const ruleEngine = createRuleEngine();

    const orchestrator = createOrchestrator({
      timeboxRepo,
      eventRepo,
      intentEngine: {
        // Intent Engine 已经在上面解析过了，这里直接返回结果
        parse: async () => parseResult.intent!,
      },
      ruleEngine: {
        evaluate: async (intent, snapshot) => {
          const result = ruleEngine.evaluate(intent, snapshot);
          return {
            result: result.severity,
            warnings: result.warnings,
            confirmations: result.confirmations,
          };
        },
      },
    });

    const result = await orchestrator.execute(rawInput, MVP_USER_ID);

    // Step 5: 获取最新时间盒列表
    const timeboxes = await fetchTimeboxSummaries();

    if (!result.success) {
      return {
        success: false,
        timeboxes,
        error: result.error,
        needsConfirmation: result.needsConfirmation,
      };
    }

    return {
      success: true,
      timeboxes,
      warnings: result.warnings,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";

    // 尝试返回当前时间盒列表
    try {
      const timeboxes = await fetchTimeboxSummaries();
      return { success: false, timeboxes, error: message };
    } catch {
      return { success: false, timeboxes: [], error: message };
    }
  }
}

/**
 * submitTemplateIntent — 表单模式意图提交 Server Action
 *
 * 使用 template parser 代替 AI 解析，直接从表单字段构造 StructuredIntent。
 * 管道与 submitIntent 相同（Orchestrator → RuleEngine → StateMachine）。
 */
export async function submitTemplateIntent(
  fields: TemplateFormFields,
): Promise<IntentSubmissionResult> {
  try {
    // Step 1: 创建 Intention 记录
    const intentionRepo = new IntentionRepository();
    const intentionId = crypto.randomUUID();
    const now = new Date().toISOString() as Timestamp;

    await intentionRepo.save(
      {
        id: intentionId,
        status: "captured",
        rawInput: `[表单] ${fields.title}`,
        inputMode: "template_form",
        capturedAt: now,
      },
      MVP_USER_ID,
    );

    // Step 2: 使用 template parser 直接构造 StructuredIntent
    const intent = parseTemplateForm(fields, intentionId);

    // Step 3-4: 创建 Orchestrator 并执行管道
    const timeboxRepo = new TimeboxRepository();
    const eventRepo = new SystemEventRepository();
    const ruleEngine = createRuleEngine();

    const orchestrator = createOrchestrator({
      timeboxRepo,
      eventRepo,
      intentEngine: {
        // Template parser 已经解析完成，直接返回
        parse: async () => intent,
      },
      ruleEngine: {
        evaluate: async (intentEval, snapshot) => {
          const result = ruleEngine.evaluate(intentEval, snapshot);
          return {
            result: result.severity,
            warnings: result.warnings,
            confirmations: result.confirmations,
          };
        },
      },
    });

    const result = await orchestrator.execute(
      `[表单] ${fields.title}`,
      MVP_USER_ID,
    );

    // Step 5: 获取最新时间盒列表
    const timeboxes = await fetchTimeboxSummaries();

    if (!result.success) {
      return {
        success: false,
        timeboxes,
        error: result.error,
        needsConfirmation: result.needsConfirmation,
      };
    }

    return {
      success: true,
      timeboxes,
      warnings: result.warnings,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "未知错误";

    try {
      const timeboxes = await fetchTimeboxSummaries();
      return { success: false, timeboxes, error: message };
    } catch {
      return { success: false, timeboxes: [], error: message };
    }
  }
}

/**
 * getTimeboxes — 获取当前时间盒列表
 *
 * 用于页面初始化加载。
 */
export async function getTimeboxes(): Promise<TimeboxSummary[]> {
  return fetchTimeboxSummaries();
}
