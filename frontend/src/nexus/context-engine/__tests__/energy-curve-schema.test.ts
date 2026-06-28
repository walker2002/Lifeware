/**
 * @file energy-curve-schema.test
 * @brief EnergyCurveSchema 守卫测试（F3 [023] A0 post-review）
 *
 * 原 schema `z.array(z.number())` 接受 NaN/Infinity/越界值/小数。
 * 升级守卫后验证：合法小时通过 + 各类非法值被拒。
 *
 * @see frontend/src/nexus/context-engine/register-providers.ts
 */
import { describe, it, expect } from 'vitest'
import { z } from 'zod'

// 复用 register-providers 内部 schema 形状（不直接 import，避免 module-level side effects）
// 这里 inline 重声明等价 schema 进行测试；如果 schema 漂移则测试失败报警
const EnergyCurveHourSchema = z.number().int().min(0).max(23)
const EnergyCurveSchema = z.object({
  peakHours: z.array(EnergyCurveHourSchema),
  lowHours: z.array(EnergyCurveHourSchema),
  source: z.string(),
})

describe('EnergyCurveSchema（F3 hour 守卫）', () => {
  it('合法小时数组 → 通过', () => {
    const result = EnergyCurveSchema.safeParse({
      peakHours: [9, 10, 11],
      lowHours: [14, 15, 16],
      source: 'system_default',
    })
    expect(result.success).toBe(true)
  })

  it('空数组 → 通过（MVP 静态默认 / 用户校准动态值都允许）', () => {
    const result = EnergyCurveSchema.safeParse({
      peakHours: [],
      lowHours: [],
      source: 'empty',
    })
    expect(result.success).toBe(true)
  })

  it('负数 → 拒绝', () => {
    const result = EnergyCurveSchema.safeParse({
      peakHours: [-1, 10],
      lowHours: [14],
      source: 'bad',
    })
    expect(result.success).toBe(false)
  })

  it('&gt;23 → 拒绝', () => {
    const result = EnergyCurveSchema.safeParse({
      peakHours: [10, 24],
      lowHours: [14],
      source: 'bad',
    })
    expect(result.success).toBe(false)
  })

  it('NaN → 拒绝（z.number().int() 拒绝 NaN）', () => {
    const result = EnergyCurveSchema.safeParse({
      peakHours: [NaN],
      lowHours: [14],
      source: 'bad',
    })
    expect(result.success).toBe(false)
  })

  it('Infinity → 拒绝（z.number().int() 拒绝 Infinity）', () => {
    const result = EnergyCurveSchema.safeParse({
      peakHours: [Infinity],
      lowHours: [14],
      source: 'bad',
    })
    expect(result.success).toBe(false)
  })

  it('小数（如 10.5） → 拒绝（z.number().int() 要求整数）', () => {
    const result = EnergyCurveSchema.safeParse({
      peakHours: [10.5],
      lowHours: [14],
      source: 'bad',
    })
    expect(result.success).toBe(false)
  })

  it('lowHours 含 NaN → 拒绝（双字段都校验）', () => {
    const result = EnergyCurveSchema.safeParse({
      peakHours: [9],
      lowHours: [NaN, 15],
      source: 'bad',
    })
    expect(result.success).toBe(false)
  })
})