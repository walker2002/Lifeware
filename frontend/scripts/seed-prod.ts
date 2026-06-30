/**
 * @file seed-prod
 * @brief 生产库最小种子数据脚本
 *
 * @usage npx tsx scripts/seed-prod.ts
 *
 * 仅创建 MVP 用户及其校准默认值 + 系统 Activity Archetype 默认词典，
 * 不插入任何演示数据。幂等设计：已有数据不重复插入，可安全重复运行。
 *
 * 与 seed-dev.ts 的职责分离：
 * - seed-dev.ts → 开发库（全量演示数据）
 * - seed-prod.ts → 生产库（用户 + 校准 + Archetype 默认词典，无演示污染）
 *
 * [023] A3.1 /review Codex 标记：fresh prod 若无 archetype seed，
 * 0026 删除 energy_profile 前的 guard 会拦所有 tasks/habits backfill
 * （activity_archetype_id 子查询返回 0 行 → count 永远为 0 → RAISE）。
 * 因此必须保证 archetype 至少在 MVP 用户下存在。
 */

import 'dotenv/config'
import { db } from '../src/lib/db'
import * as s from '../src/lib/db/schema'
import { UserCalibrationRepository } from '../src/lib/db/repositories/user-calibration.repository'
import { ActivityArchetypeRepository } from '../src/lib/db/repositories/activity-archetype.repository'

/** 生产环境用户 ID（固定，实现幂等） */
const USER_ID = '00000000-0000-0000-0000-000000000001'

/** 生产环境用户邮箱 */
const USER_EMAIL = 'mvp@lifeware.app'

/**
 * 主函数：执行生产库最小种子数据插入
 */
async function seedProd() {
  const now = new Date()

  console.log('🌱 生产库最小种子数据...\n')

  // 1. 创建用户（幂等）
  await db.insert(s.users).values({
    id: USER_ID,
    email: USER_EMAIL,
    createdAt: now,
    updatedAt: now,
  }).onConflictDoNothing()
  console.log(`  ✓ 用户: ${USER_EMAIL}`)

  // 2. 初始化用户校准默认值（幂等：已存在则跳过）
  const calibrationRepo = new UserCalibrationRepository()
  await calibrationRepo.initializeDefaults(USER_ID)
  console.log('  ✓ 用户校准默认值')

  // 3. 导入 Activity Archetype 系统默认词典（幂等：按 l1+l2 判重）
  //    [023] A3.1 /review R2: 0025 backfill 子查询依赖此 seed；fresh prod 缺此步
  //    会导致 0026 删除 energy_profile 时 count=0 guard 永久拦截。
  const archetypeRepo = new ActivityArchetypeRepository()
  const inserted = await archetypeRepo.seedDefaults(USER_ID)
  console.log(`  ✓ Activity Archetype 默认词典: 新增 ${inserted} 条（已存在跳过）`)

  console.log('\n✅ 生产库种子数据完成')
  console.log(`   用户: ${USER_EMAIL}`)
  console.log('   无演示数据 — 干净生产环境')
}

seedProd()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ 生产库 seed 失败:', err)
    process.exit(1)
  })
