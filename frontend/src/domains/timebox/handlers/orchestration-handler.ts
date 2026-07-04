/**
 * @file orchestration-handler
 * @brief 智能时间盒编排 Handler
 * 
 * Handler + Context Engine 双轨架构中的 Handler 组件
 * 接收 GenerationRequest（意图 + 组装好的上下文数据），产出 GenerationResult
 * 
 * 约束：
 * - 不直接访问 Repository
 * - 不写入状态、不触发事件
 * - 纯函数式：input → output
 */

import type {
  DomainHandler,
  GenerationRequest,
  GenerationResult,
  GeneratedProposal,
  ProposalSet,
  Warning,
  PresentationPayload,
} from '@/usom/types/process'
import type { TaskSummary, HabitSummary, TimeboxSummary } from '@/usom/types/summaries'
import type { AIRuntime } from '@/nexus/ai-runtime'
import type { EnergyCurve } from '@/usom/types/primitives'
import { DEFAULT_ENERGY_CURVE } from '@/nexus/context-engine/energy-state-manager'

// ─── 从 contexts 提取的强类型材料 ──────────────────────────────

/**
 * 时间盒项
 */
interface ScheduleItem {
  /** ID */
  id: string
  /** 标题 */
  title: string
  /** 来源类型 */
  sourceType: GeneratedProposal['sourceType']
  /** 优先级 */
  priority: string
  /** 持续时间（分钟） */
  durationMinutes: number
  /** 所需能量 */
  energyRequired?: string
  /** 关联对象 ID */
  relatedObjectId: string
}

/**
 * 时间槽
 */
interface TimeSlot {
  /** 开始小时 */
  startHour: number
  /** 开始分钟 */
  startMinute: number
  /** 结束小时 */
  endHour: number
  /** 结束分钟 */
  endMinute: number
}

// ─── 优先级排序权重 ──────────────────────────────────────────

/** 优先级权重映射 */
const PRIORITY_WEIGHT: Record<string, number> = {
  P0: 0,
  critical: 0,
  P1: 1,
  high: 1,
  P2: 2,
  medium: 2,
  P3: 3,
  low: 3,
}

/** 来源权重映射 */
const SOURCE_WEIGHT: Record<string, number> = {
  planned: 0,
  habit: 1,
  task: 2,
  adhoc: 3,
}

// ─── Handler 实现 ─────────────────────────────────────────────

export class TimeboxOrchestrationHandler implements DomainHandler {
  async handle(request: GenerationRequest): Promise<GenerationResult> {
    const date = this.resolveDate(request)
    const materials = this.collectMaterials(request.contexts)
    const items = this.buildScheduleItems(materials)
    const sorted = this.sortItems(items)
    const occupied = this.extractOccupiedSlots(materials.existingTimeboxes)
    const proposals = this.generateProposals(sorted, occupied, materials.energyCurve, date)
    const warnings = this.detectConflicts(proposals, materials.existingTimeboxes)
    const presentation = this.renderMarkdown(proposals, date)

    return {
      proposalSet: {
        id: crypto.randomUUID(),
        label: `${date} 智能编排方案`,
        proposals,
        tags: ['auto-schedule', 'smart'],
      },
      presentation,
      warnings,
    }
  }

  async onGenerate(request: GenerationRequest, aiRuntime: AIRuntime): Promise<GenerationResult> {
    const baseResult = await this.handle(request)

    const response = await aiRuntime.generate({
      domainId: request.intent.targetDomain,
      action: request.intent.action,
      systemPrompt: '你是智能时间编排助手。根据已有的编排方案，优化时间分配建议。',
      messages: [
        { role: 'user', content: JSON.stringify(baseResult.proposalSet) },
      ],
      taskType: 'content_generation',
      temperature: 0.5,
    })

    if (response.content) {
      const aiContent = typeof response.content === 'string'
        ? response.content
        : JSON.stringify(response.content)

      return {
        ...baseResult,
        presentation: {
          type: 'markdown',
          content: (baseResult.presentation?.content ?? '') + '\n\n---\n### AI 优化建议\n' + aiContent,
        },
      }
    }

    return baseResult
  }

  // ─── collectMaterials: 从通用 contexts 提取类型化数据 ──────

  private collectMaterials(contexts: Record<string, unknown>) {
    const pendingHabits = (contexts.pendingHabits ?? []) as HabitSummary[]
    const activeTasks = (contexts.activeTasks ?? []) as TaskSummary[]
    const existingTimeboxes = (contexts.existingTimeboxes ?? []) as TimeboxSummary[]
    const energyCurve = (contexts.energyCurve ?? DEFAULT_ENERGY_CURVE) as EnergyCurve

    return { pendingHabits, activeTasks, existingTimeboxes, energyCurve }
  }

  // ─── buildScheduleItems: 将 4 个来源统一为 ScheduleItem ────

  private buildScheduleItems(materials: ReturnType<typeof this.collectMaterials>): ScheduleItem[] {
    const items: ScheduleItem[] = []

    // 来源 1: pendingHabits
    for (const habit of materials.pendingHabits) {
      if (habit.todayLogged) continue

      items.push({
        id: crypto.randomUUID(),
        title: habit.title,
        sourceType: 'habit',
        priority: 'P1',
        durationMinutes: 30,
        energyRequired: 'low',
        relatedObjectId: habit.id,
      })
    }

    // 来源 2: activeTasks
    for (const task of materials.activeTasks) {
      items.push({
        id: crypto.randomUUID(),
        title: task.title,
        sourceType: 'task',
        priority: this.normalizePriority(task.priority),
        durationMinutes: 60,
        energyRequired: task.energyRequired,
        relatedObjectId: task.id,
      })
    }

    return items
  }

  // ─── sortItems: 按优先级 + sourceType 排序 ─────────────────

  private sortItems(items: ScheduleItem[]): ScheduleItem[] {
    return [...items].sort((a, b) => {
      const pa = PRIORITY_WEIGHT[a.priority] ?? 9
      const pb = PRIORITY_WEIGHT[b.priority] ?? 9
      if (pa !== pb) return pa - pb
      const sa = SOURCE_WEIGHT[a.sourceType] ?? 9
      const sb = SOURCE_WEIGHT[b.sourceType] ?? 9
      return sa - sb
    })
  }

  // ─── extractOccupiedSlots: 提取已有 timebox 的时间区间 ─────

  private extractOccupiedSlots(timeboxes: TimeboxSummary[]): TimeSlot[] {
    return timeboxes.map(tb => {
      const start = new Date(tb.startTime)
      const end = new Date(tb.endTime)
      return {
        startHour: start.getHours(),
        startMinute: start.getMinutes(),
        endHour: end.getHours(),
        endMinute: end.getMinutes(),
      }
    })
  }

  // ─── generateProposals: 分配时间槽，生成提案 ───────────────

  private generateProposals(
    items: ScheduleItem[],
    occupied: TimeSlot[],
    energyCurve: EnergyCurve,
    date: string,
  ): GeneratedProposal[] {
    const proposals: GeneratedProposal[] = []
    let cursorHour = 8  // 从 08:00 开始
    let cursorMinute = 0

    for (const item of items) {
      // 向前移动游标，跳过被占用的时段
      while (this.isSlotOccupied(cursorHour, cursorMinute, item.durationMinutes, occupied)) {
        const overlap = this.findOccupyingSlot(cursorHour, cursorMinute, occupied)
        if (overlap) {
          cursorHour = overlap.endHour
          cursorMinute = overlap.endMinute
        } else {
          // 安全回退：前进 30 分钟
          cursorMinute += 30
          if (cursorMinute >= 60) {
            cursorHour += Math.floor(cursorMinute / 60)
            cursorMinute = cursorMinute % 60
          }
        }
      }

      const endTotalMin = cursorHour * 60 + cursorMinute + item.durationMinutes
      const endHour = Math.floor(endTotalMin / 60) % 24
      const endMinute = endTotalMin % 60

      const energyMatch = this.computeEnergyMatch(
        cursorHour,
        item.energyRequired,
        energyCurve,
      )

      proposals.push({
        id: crypto.randomUUID(),
        action: 'createTimebox',
        payload: {
          title: item.title,
          date,
          startTime: this.formatTime(cursorHour, cursorMinute),
          endTime: this.formatTime(endHour, endMinute),
          duration: item.durationMinutes,
          sourceObjectId: item.relatedObjectId,
        },
        sourceType: item.sourceType,
        priority: item.priority,
        energyMatch,
      })

      cursorHour = endHour
      cursorMinute = endMinute

      // 一天最多编排到 22:00
      if (cursorHour >= 22) break
    }

    return proposals
  }

  // ─── detectConflicts: 检测提案与已有 timebox 的时间重叠 ────

  private detectConflicts(
    proposals: GeneratedProposal[],
    existingTimeboxes: TimeboxSummary[],
  ): Warning[] {
    const warnings: Warning[] = []

    for (const proposal of proposals) {
      const payload = proposal.payload
      const pStart = this.timeToMinutes(payload.startTime as string)
      const pEnd = this.timeToMinutes(payload.endTime as string)

      for (const tb of existingTimeboxes) {
        const tbStart = new Date(tb.startTime)
        const tbEnd = new Date(tb.endTime)
        const tStart = tbStart.getHours() * 60 + tbStart.getMinutes()
        const tEnd = tbEnd.getHours() * 60 + tbEnd.getMinutes()

        if (pStart < tEnd && pEnd > tStart) {
          warnings.push({
            code: 'SCHEDULE_OVERLAP',
            message: `"${payload.title}" 与已有时间盒 "${tb.title}" (${this.formatTime(tbStart.getHours(), tbStart.getMinutes())}-${this.formatTime(tbEnd.getHours(), tbEnd.getMinutes())}) 存在时间重叠`,
            severity: 'warn',
            affectedProposalIds: [proposal.id],
          })
        }
      }
    }

    return warnings
  }

  // ─── renderMarkdown: 将提案转为可读 Markdown ──────────────

  private renderMarkdown(proposals: GeneratedProposal[], date: string): PresentationPayload {
    const lines: string[] = []
    lines.push(`# ${date} 智能编排方案`)
    lines.push('')

    if (proposals.length === 0) {
      lines.push('> 当前无可编排项目')
    } else {
      for (const p of proposals) {
        const start = p.payload.startTime as string
        const end = p.payload.endTime as string
        const title = p.payload.title as string
        lines.push(`## ${start}-${end} ${title} [${p.sourceType}] ${p.priority}`)

        if (p.energyMatch) {
          lines.push(`能量匹配: ${p.energyMatch.required}需求/${p.energyMatch.actual}实际 (${p.energyMatch.score.toFixed(1)})`)
        }
        lines.push('')
      }
    }

    return {
      type: 'markdown',
      content: lines.join('\n'),
    }
  }

  // ─── 工具方法 ───────────────────────────────────────────────

  private resolveDate(request: GenerationRequest): string {
    const date = request.intent.fields.date
    if (typeof date === 'string' && date) return date
    return new Date().toISOString().slice(0, 10)
  }

  private normalizePriority(priority: string): string {
    if (priority in PRIORITY_WEIGHT) return priority
    const lower = priority.toLowerCase()
    for (const key of Object.keys(PRIORITY_WEIGHT)) {
      if (key.toLowerCase() === lower) return key
    }
    return 'P2'
  }

  private computeEnergyMatch(
    hour: number,
    energyRequired: string | undefined,
    energyCurve: EnergyCurve,
  ): GeneratedProposal['energyMatch'] {
    const required = energyRequired ?? 'medium'
    const isPeak = energyCurve.peakHours.includes(hour)
    const isLow = energyCurve.lowHours.includes(hour)

    let actual: string
    let score: number

    if (isPeak) {
      actual = 'high'
      score = required === 'high' ? 0.9 : required === 'medium' ? 0.7 : 0.5
    } else if (isLow) {
      actual = 'low'
      score = required === 'low' ? 0.8 : required === 'medium' ? 0.4 : 0.2
    } else {
      actual = 'medium'
      score = 0.6
    }

    return { required, actual, score }
  }

  private isSlotOccupied(
    startHour: number,
    startMinute: number,
    durationMinutes: number,
    occupied: TimeSlot[],
  ): boolean {
    const sStart = startHour * 60 + startMinute
    const sEnd = sStart + durationMinutes

    for (const slot of occupied) {
      const oStart = slot.startHour * 60 + slot.startMinute
      const oEnd = slot.endHour * 60 + slot.endMinute
      if (sStart < oEnd && sEnd > oStart) return true
    }
    return false
  }

  private findOccupyingSlot(
    startHour: number,
    startMinute: number,
    occupied: TimeSlot[],
  ): TimeSlot | undefined {
    const sStart = startHour * 60 + startMinute
    for (const slot of occupied) {
      const oStart = slot.startHour * 60 + slot.startMinute
      const oEnd = slot.endHour * 60 + slot.endMinute
      if (sStart >= oStart && sStart < oEnd) return slot
    }
    return undefined
  }

  private formatTime(hour: number, minute: number): string {
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  }

  private timeToMinutes(time: string): number {
    const [h, m] = time.split(':').map(Number)
    return h * 60 + (m ?? 0)
  }
}
