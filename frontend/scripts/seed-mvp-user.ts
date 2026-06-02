/**
 * @file seed-mvp-user
 * @brief MVP 用户种子数据脚本
 * 
 * @usage npx tsx scripts/seed-mvp-user.ts
 * 
 * 向数据库插入硬编码的 MVP 用户及其默认校准数据
 * 幂等设计：已有数据不重复插入，可安全重复运行
 */

// ─── 常量与数据构造（可被测试安全导入）────────────────────────

/** MVP 用户 ID */
export const MVP_USER_ID = '00000000-0000-0000-0000-000000000001' as const

/** MVP 用户邮箱 */
export const MVP_USER_EMAIL = 'mvp@lifeware.app' as const

/**
 * 获取 MVP 用户种子数据
 * @returns 用户数据对象
 */
export function getMvpUserSeed() {
  const now = new Date()
  return {
    id: MVP_USER_ID,
    email: MVP_USER_EMAIL,
    createdAt: now,
    updatedAt: now,
  }
}

// ─── 主流程（仅直接运行时执行）──────────────────────────────

/**
 * 主函数：执行 MVP 用户种子数据插入
 * 
 * 将 db 相关导入放在条件执行内部，避免测试导入时触发连接
 */
async function seedMvpUser() {
  // 加载环境变量（仅脚本运行时需要）
  await import('dotenv/config')

  // 延迟导入：仅在脚本实际运行时才加载 db 依赖
  const { db } = await import('../src/lib/db')
  const s = await import('../src/lib/db/schema')
  const { UserCalibrationRepository } = await import('../src/lib/db/repositories/user-calibration.repository')

  const user = getMvpUserSeed()

  console.log(`正在 seed MVP 用户: id=${user.id}, email=${user.email}`)

  // 插入用户（幂等：已存在则跳过）
  await db.insert(s.users).values(user).onConflictDoNothing()

  console.log(`✓ 用户已就绪: ${user.id}`)

  // 初始化用户校准默认值（幂等：已存在则跳过）
  const calibrationRepo = new UserCalibrationRepository()
  await calibrationRepo.initializeDefaults(user.id)

  console.log(`✓ 用户校准默认值已就绪`)
  console.log(`\nSeed 完成.`)
}

seedMvpUser()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed 失败:', err)
    process.exit(1)
  })
