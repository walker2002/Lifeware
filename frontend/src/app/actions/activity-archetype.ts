/**
 * @file activity-archetype
 * @brief Activity Archetype 配置管理 Server Action 模块（[023] A1）
 *
 * 直接调用 ActivityArchetypeRepository（OQ-7：配置变更不走 SM）。
 * 每次 CUD 由 Repository 自动写 user_audit_log。
 *
 * MVP 单租户：MVP_USER_ID 硬编码常量。
 */

"use server";

import { ActivityArchetypeRepository } from "@/lib/db/repositories/activity-archetype.repository";
import type { CreateActivityArchetypeInput, UpdateActivityArchetypeInput } from "@/usom/interfaces/irepository";
import type { ActivityArchetype } from "@/usom/activity-archetype/types";
import type { USOM_ID } from "@/usom/types/primitives";

/** MVP 用户 ID（临时使用） */
// [023] A2 QA hot-fix: 'use server' file 禁止 export const/string（Next.js: 只能 export async function）
const MVP_USER_ID = "00000000-0000-0000-0000-000000000001" as USOM_ID;

/**
 * 操作结果
 */
export interface ArchetypeActionResult<T = void> {
  /** 是否成功 */
  success: boolean;
  /** 返回数据 */
  data?: T;
  /** 错误信息 */
  error?: string;
}

// ─── 查询 ────────────────────────────────────────────────────────

/**
 * 获取当前用户全部 Archetype
 *
 * @returns Archetype 列表
 */
export async function getArchetypes(): Promise<ArchetypeActionResult<ActivityArchetype[]>> {
  try {
    const repo = new ActivityArchetypeRepository();
    const data = await repo.findByUser(MVP_USER_ID);
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "获取 Archetype 列表失败" };
  }
}

// ─── 操作 ────────────────────────────────────────────────────────

/**
 * 创建 Archetype
 *
 * @param input - 创建输入（含 l1Category / l2Name / energyCost 4 维 / activityLabel 6 维）
 * @returns 创建结果
 */
export async function createArchetype(
  input: CreateActivityArchetypeInput,
): Promise<ArchetypeActionResult<ActivityArchetype>> {
  try {
    const repo = new ActivityArchetypeRepository();
    const data = await repo.create(input, MVP_USER_ID);
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "创建 Archetype 失败" };
  }
}

/**
 * 更新 Archetype
 *
 * @param id - Archetype ID
 * @param input - 更新输入（任意字段可选）
 * @returns 更新结果
 */
export async function updateArchetype(
  id: USOM_ID,
  input: UpdateActivityArchetypeInput,
): Promise<ArchetypeActionResult<ActivityArchetype>> {
  try {
    const repo = new ActivityArchetypeRepository();
    const data = await repo.update(id, input, MVP_USER_ID);
    return { success: true, data };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "更新 Archetype 失败" };
  }
}

/**
 * 删除非系统 Archetype（isSystem=true 拒绝删除）
 *
 * @param id - Archetype ID
 * @returns 删除结果
 */
export async function deleteArchetype(id: USOM_ID): Promise<ArchetypeActionResult> {
  try {
    const repo = new ActivityArchetypeRepository();
    await repo.delete(id, MVP_USER_ID);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "删除 Archetype 失败" };
  }
}

/**
 * 导入默认词典（按 l1Category+l2Name 判重，幂等插入）
 *
 * @returns 实际新插入的条目数
 */
export async function seedArchetypes(): Promise<ArchetypeActionResult<{ inserted: number }>> {
  try {
    const repo = new ActivityArchetypeRepository();
    const inserted = await repo.seedDefaults(MVP_USER_ID);
    return { success: true, data: { inserted } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "导入默认词典失败" };
  }
}