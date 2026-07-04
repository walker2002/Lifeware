/**
 * @file overlap
 * @brief [023.04] 内部时间重叠检测纯函数
 *
 * 半开区间重叠算法（与 timebox-overlap rule 对齐）：
 *   overlap ⇔ s1 < e2 && s2 < e1
 * 边界相切（end == start）不重叠。
 *
 * 与已有 today timebox 的比较放在服务端 rule（本函数仅扫 batch 内），
 * 因为客户端传 today 列表会让 useEffect 重渲染抖动；服务端 rule 是
 * 单一权威源（service-side 已发起的 createTimebox intent 走 Nexus）。
 *
 * 注意：所有时间比较使用 epoch 算术（Date.parse），不依赖任何具体时区
 * 转换逻辑；当前实现假定调用方传入的所有 ISO 字符串使用同一时区偏移，
 * 跨时区一致性债 defer 到未来的 `[TZ.01]` plan。
 */

// 注意：上述所有时间比较使用 epoch 算术（Date.parse），不挑 TZ，TZ 一致性债 defer [TZ.01]。

export interface OverlapItem {
  title: string
  startTime: string
  endTime: string
}

export interface OverlapResult {
  hasOverlap: boolean
  conflictTitles: string[]
}

export function assertNoInternalOverlap(
  items: OverlapItem[],
  _dayStart: string,
  _dayEnd: string,
): OverlapResult {
  const conflictTitles: string[] = []
  for (let i = 0; i < items.length; i++) {
    const a = items[i]
    const aS = Date.parse(a.startTime)
    const aE = Date.parse(a.endTime)
    if (isNaN(aS) || isNaN(aE) || aE <= aS) continue  // 端点非法由 EndTimeAfterStartRule 兜底

    for (let j = i + 1; j < items.length; j++) {
      const b = items[j]
      const bS = Date.parse(b.startTime)
      const bE = Date.parse(b.endTime)
      if (isNaN(bS) || isNaN(bE) || bE <= bS) continue

      if (aS < bE && bS < aE) {
        conflictTitles.push(a.title || '未命名')
        conflictTitles.push(b.title || '未命名')
      }
    }
  }
  const hasOverlap = conflictTitles.length > 0
  return { hasOverlap, conflictTitles: hasOverlap ? Array.from(new Set(conflictTitles)) : [] }
}