/**
 * @file constants
 * @brief [028] I-2 polish — Timebox 域常量集中定义
 *
 * **目的**：抽 SCHEDULE_PROPOSAL_ACTION + SCHEDULE_PROPOSAL_SURFACE 常量到 SSOT，
 * 防 [[feedback_post-ship-review-meta-pattern]] 中点名的「[023.08] 字符串漂移」
 * 模式重演 — 8+ 处硬编码 action 名任一处 rename 必漏一处。
 *
 * **类比 [023.05-1] PR1 R13 manifest-driven IRON RULE**：R13 守护了
 * resolveShortcut 解析路径，本常量守护所有 runtime handler dispatch 字符串。
 *
 * **使用**：
 * - 生产代码：import { SCHEDULE_PROPOSAL_ACTION, SCHEDULE_PROPOSAL_SURFACE }
 * - 测试代码：保留 hardcoded 字面量（reflection 守护常量值与 manifest 一致）
 */

/** [028] action 名（manifest A-block intent_triggers.action + handlers map key + handler dispatch + surface dispatch + batch record action 字段） */
export const SCHEDULE_PROPOSAL_ACTION = 'scheduleProposal' as const

/** [028] surface 名（manifest K-block cnui_surfaces key + register-client-surfaces.ts key + surfaceHandlers map key + ScheduleProposal.tsx surfaceType） */
export const SCHEDULE_PROPOSAL_SURFACE = 'schedule-proposal' as const
