/**
 * @file seed-dev
 * @brief 开发环境全量种子数据脚本
 * 
 * @usage npx tsx scripts/seed-dev.ts
 * 
 * 幂等设计：已有数据不重复插入，可安全重复运行
 * 包含用户、目标、关键结果、任务、习惯、时间盒、复盘和意图等完整测试数据
 */

import 'dotenv/config'
import { db } from '../src/lib/db'
import * as s from '../src/lib/db/schema'
import { eq, sql } from 'drizzle-orm'

// ─── 固定 ID（幂等）────────────────────────────────────────

/** 测试用户 ID */
const USER_ID = '00000000-0000-0000-0000-000000000001'

/**
 * 预分配的种子数据 ID（全部硬编码，保证幂等）
 */
const IDS = {
  // 目标
  objHealth: '10000000-0000-0000-0000-000000000001',
  objCareer: '10000000-0000-0000-0000-000000000002',
  objLearn:  '10000000-0000-0000-0000-000000000003',
  // 关键结果
  krExercise:  '20000000-0000-0000-0000-000000000001',
  krSleep:     '20000000-0000-0000-0000-000000000002',
  krProject:   '20000000-0000-0000-0000-000000000003',
  krRead:      '20000000-0000-0000-0000-000000000004',
  // 任务
  taskDesign:     '30000000-0000-0000-0000-000000000001',
  taskCode:       '30000000-0000-0000-0000-000000000002',
  taskReview:     '30000000-0000-0000-0000-000000000003',
  taskDeploy:     '30000000-0000-0000-0000-000000000004',
  taskRead:       '30000000-0000-0000-0000-000000000005',
  taskGrocery:    '30000000-0000-0000-0000-000000000006',
  taskExercise:   '30000000-0000-0000-0000-000000000007',
  // 习惯
  habitMeditation: '40000000-0000-0000-0000-000000000001',
  habitReading:    '40000000-0000-0000-0000-000000000002',
  habitExercise:   '40000000-0000-0000-0000-000000000003',
  habitJournal:    '40000000-0000-0000-0000-000000000004',
  // 时间盒
  tbDeepWork:  '50000000-0000-0000-0000-000000000001',
  tbExercise:  '50000000-0000-0000-0000-000000000002',
  tbReading:   '50000000-0000-0000-0000-000000000003',
  tbPlanning:  '50000000-0000-0000-0000-000000000004',
  // 复盘
  reviewWeekly: '60000000-0000-0000-0000-000000000001',
  // 意图
  intention1: '70000000-0000-0000-0000-000000000001',
  intention2: '70000000-0000-0000-0000-000000000002',
  sIntent1:   '70000000-0000-0000-0000-000000000003',
  sIntent2:   '70000000-0000-0000-0000-000000000004',
}

// ─── 辅助函数 ─────────────────────────────────────────────

/**
 * 获取 n 天前的日期
 * @param n - 天数
 * @returns 日期对象
 */
function daysAgo(n: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d
}

/**
 * 获取 n 天后的日期
 * @param n - 天数
 * @returns 日期对象
 */
function daysFromNow(n: number): Date {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d
}

/**
 * 获取今天的日期字符串（YYYY-MM-DD）
 * @returns 日期字符串
 */
function today(): string {
  return new Date().toISOString().split('T')[0]
}

/**
 * 格式化日期为字符串（YYYY-MM-DD）
 * @param d - 日期对象
 * @returns 日期字符串
 */
function formatDate(d: Date): string {
  return d.toISOString().split('T')[0]
}

/**
 * 获取今天指定时间的日期对象
 * @param hour - 小时
 * @param minute - 分钟（默认 0）
 * @returns 日期对象
 */
function todayAt(hour: number, minute = 0): Date {
  const d = new Date()
  d.setHours(hour, minute, 0, 0)
  return d
}

/**
 * 幂等插入数据（已存在则跳过）
 * @param table - 数据库表
 * @param values - 插入数据
 */
async function upsert<T extends { id: string }>(
  table: Parameters<typeof db.insert>[0],
  values: T,
) {
  await db.insert(table).values(values).onConflictDoNothing()
}

// ─── 主流程 ────────────────────────────────────────────────
async function seed() {
  console.log('🌱 开始填充开发种子数据...\n')

  // 1. 用户
  const now = new Date()
  await upsert(s.users, {
    id: USER_ID,
    email: 'dev@lifeware.app',
    createdAt: now,
    updatedAt: now,
  })
  console.log('  ✓ 用户')

  // 2. 用户校准（跳过，由应用层初始化）
  const calibrationCount = await db.select({ count: sql<number>`count(*)` })
    .from(s.userCalibration)
    .where(eq(s.userCalibration.userId, USER_ID))
  if (calibrationCount[0].count === 0) {
    await db.insert(s.userCalibration).values({
      userId: USER_ID,
      chronotype: 'morning_lark',
      energySensitivity: 'medium',
      peakEnergyStart: 8,
      peakEnergyEnd: 12,
      comfortableWipLimit: 5,
      sustainableDeepWorkHours: 4,
      baselineCurve: [
        { hour: 6, baseline: 0.4 }, { hour: 7, baseline: 0.6 },
        { hour: 8, baseline: 0.9 }, { hour: 9, baseline: 1.0 },
        { hour: 10, baseline: 0.95 }, { hour: 11, baseline: 0.85 },
        { hour: 12, baseline: 0.6 }, { hour: 13, baseline: 0.5 },
        { hour: 14, baseline: 0.7 }, { hour: 15, baseline: 0.65 },
        { hour: 16, baseline: 0.5 }, { hour: 17, baseline: 0.4 },
        { hour: 18, baseline: 0.3 }, { hour: 19, baseline: 0.3 },
        { hour: 20, baseline: 0.2 }, { hour: 21, baseline: 0.15 },
        { hour: 22, baseline: 0.1 }, { hour: 23, baseline: 0.05 },
      ],
    })
  }
  console.log('  ✓ 用户校准')

  // 3. 目标 (objectives)
  const qStart = formatDate(daysAgo(30))
  const qEnd = formatDate(daysFromNow(60))

  await upsert(s.objectives, {
    id: IDS.objHealth, userId: USER_ID, schemaVersion: 1,
    status: 'active', title: '提升身心健康', description: '通过运动、冥想和良好作息提升整体健康水平',
    periodType: 'quarterly', periodStart: qStart, periodEnd: qEnd, tags: ['健康', '生活'],
    createdAt: daysAgo(30), updatedAt: now,
  })
  await upsert(s.objectives, {
    id: IDS.objCareer, userId: USER_ID, schemaVersion: 1,
    status: 'active', title: '推进核心项目', description: '完成 Lifeware MVP 开发并上线',
    periodType: 'quarterly', periodStart: qStart, periodEnd: qEnd, tags: ['职业', '项目'],
    createdAt: daysAgo(30), updatedAt: now,
  })
  await upsert(s.objectives, {
    id: IDS.objLearn, userId: USER_ID, schemaVersion: 1,
    status: 'active', title: '持续学习成长', description: '阅读技术书籍、学习新技能',
    periodType: 'quarterly', periodStart: qStart, periodEnd: qEnd, tags: ['学习', '成长'],
    createdAt: daysAgo(30), updatedAt: now,
  })
  console.log('  ✓ 目标 (3)')

  // 4. 关键结果 (key_results)
  await upsert(s.keyResults, {
    id: IDS.krExercise, userId: USER_ID, schemaVersion: 1,
    status: 'active', objectiveId: IDS.objHealth,
    title: '每周运动 4 次', targetValue: '48', currentValue: '20', unit: '次',
    progressRate: '0.4167', dueDate: formatDate(daysFromNow(60)),
    createdAt: daysAgo(30), updatedAt: now,
  })
  await upsert(s.keyResults, {
    id: IDS.krSleep, userId: USER_ID, schemaVersion: 1,
    status: 'active', objectiveId: IDS.objHealth,
    title: '保持 23:00 前入睡', targetValue: '90', currentValue: '60', unit: '天',
    progressRate: '0.6667', dueDate: formatDate(daysFromNow(60)),
    createdAt: daysAgo(30), updatedAt: now,
  })
  await upsert(s.keyResults, {
    id: IDS.krProject, userId: USER_ID, schemaVersion: 1,
    status: 'active', objectiveId: IDS.objCareer,
    title: '完成 MVP 核心功能', targetValue: '10', currentValue: '6', unit: '个模块',
    progressRate: '0.6000', dueDate: formatDate(daysFromNow(60)),
    createdAt: daysAgo(30), updatedAt: now,
  })
  await upsert(s.keyResults, {
    id: IDS.krRead, userId: USER_ID, schemaVersion: 1,
    status: 'active', objectiveId: IDS.objLearn,
    title: '阅读 4 本技术书籍', targetValue: '4', currentValue: '1', unit: '本',
    progressRate: '0.2500', dueDate: formatDate(daysFromNow(60)),
    createdAt: daysAgo(30), updatedAt: now,
  })
  console.log('  ✓ 关键结果 (4)')

  // 5. 任务 (tasks)
  const taskSeedData = [
    { id: IDS.taskDesign, title: '完成时间盒模块 UI 设计', priority: 'high' as const, energy: 'high' as const, duration: 120, status: 'active' as const, keyResultId: IDS.krProject, due: 3 },
    { id: IDS.taskCode, title: '实现时间冲突检测逻辑', priority: 'critical' as const, energy: 'high' as const, duration: 180, status: 'active' as const, keyResultId: IDS.krProject, due: 1 },
    { id: IDS.taskReview, title: '代码审查与重构', priority: 'medium' as const, energy: 'medium' as const, duration: 90, status: 'active' as const, keyResultId: IDS.krProject, due: 5 },
    { id: IDS.taskDeploy, title: '部署 MVP 到测试环境', priority: 'high' as const, energy: 'medium' as const, duration: 60, status: 'draft' as const, keyResultId: IDS.krProject, due: 7 },
    { id: IDS.taskRead, title: '阅读《系统设计面试》第 3-5 章', priority: 'medium' as const, energy: 'medium' as const, duration: 60, status: 'active' as const, keyResultId: IDS.krRead, due: 4 },
    { id: IDS.taskGrocery, title: '采购本周食材', priority: 'low' as const, energy: 'low' as const, duration: 45, status: 'active' as const, keyResultId: null, due: 1 },
    { id: IDS.taskExercise, title: '晨跑 5 公里', priority: 'medium' as const, energy: 'high' as const, duration: 40, status: 'completed' as const, keyResultId: IDS.krExercise, due: -1 },
  ]
  for (const t of taskSeedData) {
    await upsert(s.tasks, {
      id: t.id, userId: USER_ID, schemaVersion: 1,
      status: t.status, title: t.title,
      priority: t.priority, energyRequired: t.energy,
      estimatedDuration: t.duration,
      keyResultId: t.keyResultId,
      dueDate: formatDate(daysFromNow(t.due)),
      tags: [],
      createdAt: daysAgo(2), updatedAt: now,
      completedAt: t.status === 'completed' ? daysAgo(1) : null,
    })
  }
  console.log('  ✓ 任务 (7)')

  // 6. 习惯 (habits)
  await upsert(s.habits, {
    id: IDS.habitMeditation, userId: USER_ID, schemaVersion: 1,
    status: 'active', title: '晨间冥想', description: '每天早上 10 分钟正念冥想',
    frequencyType: 'daily',
    defaultTime: '07:00', earliestTime: '06:30', latestStartTime: '07:30',
    defaultDuration: 10, minDuration: 5, trackable: true,
    streak: 5, longestStreak: 12, completionRate7d: 0.85,
    startDate: formatDate(daysAgo(30)), tags: ['健康', '正念'],
    createdAt: daysAgo(30), updatedAt: now,
  })
  await upsert(s.habits, {
    id: IDS.habitReading, userId: USER_ID, schemaVersion: 1,
    status: 'active', title: '睡前阅读', description: '每天睡前阅读 30 分钟',
    frequencyType: 'daily',
    defaultTime: '22:00', earliestTime: '21:30', latestStartTime: '22:30',
    defaultDuration: 30, minDuration: 15, trackable: true,
    streak: 3, longestStreak: 7, completionRate7d: 0.71,
    startDate: formatDate(daysAgo(30)), keyResultId: IDS.krRead, tags: ['学习'],
    createdAt: daysAgo(30), updatedAt: now,
  })
  await upsert(s.habits, {
    id: IDS.habitExercise, userId: USER_ID, schemaVersion: 1,
    status: 'active', title: '力量训练', description: '每周 3 次力量训练',
    frequencyType: 'weekly',
    defaultTime: '18:00', earliestTime: '17:30', latestStartTime: '18:30',
    defaultDuration: 45, minDuration: 20, trackable: true,
    streak: 2, longestStreak: 4, completionRate7d: 0.57,
    startDate: formatDate(daysAgo(30)), keyResultId: IDS.krExercise,
    daysOfWeek: [1, 3, 5], tags: ['健康', '运动'],
    createdAt: daysAgo(30), updatedAt: now,
  })
  await upsert(s.habits, {
    id: IDS.habitJournal, userId: USER_ID, schemaVersion: 1,
    status: 'active', title: '每日复盘', description: '每天结束时写复盘日记',
    frequencyType: 'daily',
    defaultTime: '21:30', earliestTime: '21:00', latestStartTime: '22:00',
    defaultDuration: 15, minDuration: 5, trackable: true,
    streak: 8, longestStreak: 15, completionRate7d: 1.0,
    startDate: formatDate(daysAgo(30)), tags: ['反思', '成长'],
    createdAt: daysAgo(30), updatedAt: now,
  })
  console.log('  ✓ 习惯 (4)')

  // 7. 习惯日志 (habit_logs) — 过去 7 天
  const habitIds = [IDS.habitMeditation, IDS.habitReading, IDS.habitExercise, IDS.habitJournal]
  const habitStatuses: ('completed' | 'not_completed' | 'partially_completed')[] = ['completed', 'completed', 'completed', 'completed', 'not_completed', 'completed', 'partially_completed']
  for (let d = 6; d >= 0; d--) {
    for (let h = 0; h < habitIds.length; h++) {
      // 力量训练只在周一三五
      if (habitIds[h] === IDS.habitExercise) {
        const dayOfWeek = new Date()
        dayOfWeek.setDate(dayOfWeek.getDate() - d)
        const dow = dayOfWeek.getDay()
        if (![1, 3, 5].includes(dow)) continue
      }
      await db.insert(s.habitLogs).values({
        userId: USER_ID, schemaVersion: 1,
        habitId: habitIds[h],
        date: formatDate(daysAgo(d)),
        completionStatus: habitStatuses[6 - d],
        actualDuration: habitStatuses[6 - d] === 'completed' ? [10, 30, 45, 15][h] : null,
        source: 'manual',
      }).onConflictDoNothing()
    }
  }
  console.log('  ✓ 习惯日志 (过去 7 天)')

  // 8. 能量日志 (energy_logs)
  const energyLevels = [7, 8, 9, 6, 7, 8, 5]
  for (let d = 6; d >= 0; d--) {
    await db.insert(s.energyLogs).values({
      userId: USER_ID, schemaVersion: 1,
      level: energyLevels[6 - d],
      source: 'user',
      context: { timeOfDay: 'morning', note: '晨间自评' },
      loggedAt: daysAgo(d),
    }).onConflictDoNothing()
  }
  console.log('  ✓ 能量日志 (7 条)')

  // 9. 时间盒 (timeboxes) — 今天的安排
  await upsert(s.timeboxes, {
    id: IDS.tbDeepWork, userId: USER_ID, schemaVersion: 1,
    status: 'planned', title: '深度工作：核心开发',
    startTime: todayAt(9), endTime: todayAt(12),
    isRecurring: true,
    recurrenceRule: { frequency: 'weekly', interval: 1 },
    tags: ['开发', '深度工作'],
    createdAt: now, updatedAt: now,
  })
  await upsert(s.timeboxes, {
    id: IDS.tbExercise, userId: USER_ID, schemaVersion: 1,
    status: 'planned', title: '午间运动',
    startTime: todayAt(12, 30), endTime: todayAt(13, 30),
    isRecurring: true,
    recurrenceRule: { frequency: 'daily', interval: 1 },
    tags: ['运动'],
    createdAt: now, updatedAt: now,
  })
  await upsert(s.timeboxes, {
    id: IDS.tbReading, userId: USER_ID, schemaVersion: 1,
    status: 'planned', title: '睡前阅读',
    startTime: todayAt(22), endTime: todayAt(22, 30),
    tags: ['阅读'],
    createdAt: now, updatedAt: now,
  })
  await upsert(s.timeboxes, {
    id: IDS.tbPlanning, userId: USER_ID, schemaVersion: 1,
    status: 'ended', title: '晨间规划',
    startTime: todayAt(7), endTime: todayAt(7, 30),
    tags: ['规划'],
    createdAt: now, updatedAt: now,
    startedAt: todayAt(7), endedAt: todayAt(7, 30),
  })
  console.log('  ✓ 时间盒 (4)')

  // 10. 时间盒-任务关联
  await db.insert(s.timeboxTasks).values([
    { timeboxId: IDS.tbDeepWork, taskId: IDS.taskCode },
    { timeboxId: IDS.tbDeepWork, taskId: IDS.taskDesign },
    { timeboxId: IDS.tbExercise, taskId: IDS.taskExercise },
  ]).onConflictDoNothing()
  // 时间盒-习惯关联
  await db.insert(s.timeboxHabits).values([
    { timeboxId: IDS.tbReading, habitId: IDS.habitReading },
  ]).onConflictDoNothing()
  console.log('  ✓ 时间盒关联')

  // 11. 复盘 (reviews)
  await upsert(s.reviews, {
    id: IDS.reviewWeekly, userId: USER_ID, schemaVersion: 1,
    status: 'completed', type: 'weekly',
    periodStart: formatDate(daysAgo(7)), periodEnd: formatDate(daysAgo(1)),
    generatedBy: 'ai',
    sections: [
      { key: 'summary', title: '本周总结', content: '本周整体进展良好，核心模块完成 60%，运动习惯保持稳定。需要注意睡眠质量和深度工作的专注度。' },
      { key: 'highlights', title: '亮点', content: '连续 5 天完成晨间冥想；完成时间冲突检测的初步设计。' },
      { key: 'improvements', title: '改进方向', content: '减少社交媒体干扰，提升深度工作时段的专注度。' },
    ],
    metrics: {
      tasksCompleted: 5, tasksTotal: 8,
      habitsCompleted: 22, habitsTotal: 28,
      timeboxedHours: 18.5, focusScore: 7.2,
    },
    createdAt: daysAgo(1), updatedAt: daysAgo(1),
    completedAt: daysAgo(1),
  })
  console.log('  ✓ 复盘 (1)')

  // 12. 意图 (intentions)
  await upsert(s.intentions, {
    id: IDS.intention1, userId: USER_ID, schemaVersion: 1,
    status: 'routed', rawInput: '今天上午我要专注于核心开发工作',
    inputMode: 'natural_language',
    capturedAt: todayAt(7, 15), dissolvedAt: null,
  })
  await upsert(s.intentions, {
    id: IDS.intention2, userId: USER_ID, schemaVersion: 1,
    status: 'dissolved', rawInput: '帮我规划本周的学习计划',
    inputMode: 'natural_language',
    capturedAt: daysAgo(1), dissolvedAt: daysAgo(1),
  })
  console.log('  ✓ 意图 (2)')

  // 13. 结构化意图 (structured_intents)
  await upsert(s.structuredIntents, {
    id: IDS.sIntent1, userId: USER_ID, schemaVersion: 1,
    intentionId: IDS.intention1,
    targetDomain: 'task', action: 'create',
    fields: { title: '核心开发工作', priority: 'high', energyRequired: 'high', estimatedDuration: 180 },
    confidence: 0.92, resolvedBy: 'ai',
    createdAt: todayAt(7, 15),
  })
  await upsert(s.structuredIntents, {
    id: IDS.sIntent2, userId: USER_ID, schemaVersion: 1,
    intentionId: IDS.intention2,
    targetDomain: 'task', action: 'plan',
    fields: { periodType: 'weekly', focusArea: '学习' },
    confidence: 0.88, resolvedBy: 'ai',
    createdAt: daysAgo(1),
  })
  console.log('  ✓ 结构化意图 (2)')

  // 14. 衍生信号 (derived_signals)
  const dsCount = await db.select({ count: sql<number>`count(*)` })
    .from(s.derivedSignals)
    .where(eq(s.derivedSignals.userId, USER_ID))
  if (dsCount[0].count === 0) {
    await db.insert(s.derivedSignals).values({
      userId: USER_ID,
      energyPattern: {
        peakHours: [8, 9, 10, 11],
        lowHours: [13, 18, 19, 20],
        confidence: 0.75,
      },
      activeTaskCount: 6,
      avgCompletionRate7d: 0.72,
      avgCompletionRate30d: 0.65,
      habitStreaks: {
        [IDS.habitMeditation]: 5,
        [IDS.habitReading]: 3,
        [IDS.habitExercise]: 2,
        [IDS.habitJournal]: 8,
      },
      habitCompletionRates: {
        [IDS.habitMeditation]: 0.85,
        [IDS.habitReading]: 0.71,
        [IDS.habitExercise]: 0.57,
        [IDS.habitJournal]: 1.0,
      },
      timeboxAdherence7d: 0.8,
      isOvercommitted: false,
    })
  }
  console.log('  ✓ 衍生信号')

  console.log('\n✅ 种子数据填充完成!')
  console.log(`   用户: dev@lifeware.app`)
  console.log(`   目标: 3 | 关键结果: 4 | 任务: 7`)
  console.log(`   习惯: 4 (含 7 天日志) | 时间盒: 4 | 复盘: 1`)
  console.log(`   意图: 2 | 能量日志: 7 | 衍生信号: 1`)
}

seed()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('❌ Seed 失败:', err)
    process.exit(1)
  })
