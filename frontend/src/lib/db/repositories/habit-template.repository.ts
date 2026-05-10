import { eq, and } from 'drizzle-orm'
import { db } from '../index'
import * as s from '../schema'
import type {
  IHabitTemplateRepository,
  CreateTemplateInput,
  UpdateTemplateInput,
  TemplateHabitOverrides,
} from '../../../usom/interfaces/irepository'
import type { HabitTemplate, TemplateHabitItem } from '../../../usom/types/objects'
import type { USOM_ID, Timestamp } from '../../../usom/types/primitives'
import {
  habitTemplateRowToUSOM,
  habitTemplateUSOMToRow,
  templateHabitItemToRow,
  templateHabitRowToItem,
} from './mappers'

export class HabitTemplateRepository implements IHabitTemplateRepository {
  async findById(id: USOM_ID, userId: USOM_ID): Promise<HabitTemplate | null> {
    const rows = await db.select().from(s.habitTemplates)
      .where(and(eq(s.habitTemplates.id, id), eq(s.habitTemplates.userId, userId)))
    if (!rows[0]) return null

    const habits = await this.loadTemplateHabits(id)
    return habitTemplateRowToUSOM(rows[0] as any, habits)
  }

  async findByUserId(userId: USOM_ID): Promise<HabitTemplate[]> {
    const rows = await db.select().from(s.habitTemplates)
      .where(eq(s.habitTemplates.userId, userId))

    const results: HabitTemplate[] = []
    for (const row of rows) {
      const habits = await this.loadTemplateHabits((row as any).id)
      results.push(habitTemplateRowToUSOM(row as any, habits))
    }
    return results
  }

  async create(data: CreateTemplateInput, userId: USOM_ID): Promise<HabitTemplate> {
    const now = new Date().toISOString() as Timestamp
    const id = crypto.randomUUID() as USOM_ID
    const template: HabitTemplate = {
      id,
      name: data.name,
      description: data.description,
      icon: data.icon,
      status: 'draft',
      applicableDays: data.applicableDays,
      habits: [],
      createdAt: now,
      updatedAt: now,
    }
    const row = habitTemplateUSOMToRow(template, userId)
    await db.insert(s.habitTemplates).values(row)
    return template
  }

  async update(id: USOM_ID, data: UpdateTemplateInput, userId: USOM_ID): Promise<HabitTemplate> {
    const existing = await this.findById(id, userId)
    if (!existing) throw new Error(`HabitTemplate ${id} not found`)

    const updates: Record<string, unknown> = {
      updated_at: new Date(),
    }
    if (data.name !== undefined) updates.name = data.name
    if (data.description !== undefined) updates.description = data.description ?? null
    if (data.icon !== undefined) updates.icon = data.icon ?? null
    if (data.applicableDays !== undefined) updates.applicable_days = data.applicableDays

    await db.update(s.habitTemplates).set(updates)
      .where(and(eq(s.habitTemplates.id, id), eq(s.habitTemplates.userId, userId)))

    return this.findById(id, userId) as Promise<HabitTemplate>
  }

  async delete(id: USOM_ID, userId: USOM_ID): Promise<void> {
    await db.delete(s.habitTemplates)
      .where(and(eq(s.habitTemplates.id, id), eq(s.habitTemplates.userId, userId)))
  }

  async addHabit(
    templateId: USOM_ID,
    habitId: USOM_ID,
    overrides?: TemplateHabitOverrides,
    userId?: USOM_ID,
  ): Promise<void> {
    const item: TemplateHabitItem = {
      habitId,
      sortOrder: overrides?.sortOrder ?? 0,
      timeOverride: overrides?.timeOverride,
      durationOverride: overrides?.durationOverride,
    }
    await db.insert(s.templateHabits).values(templateHabitItemToRow(templateId, item))
  }

  async removeHabit(templateId: USOM_ID, habitId: USOM_ID, _userId: USOM_ID): Promise<void> {
    await db.delete(s.templateHabits)
      .where(and(eq(s.templateHabits.templateId, templateId), eq(s.templateHabits.habitId, habitId)))
  }

  private async loadTemplateHabits(templateId: USOM_ID): Promise<TemplateHabitItem[]> {
    const rows = await db.select().from(s.templateHabits)
      .where(eq(s.templateHabits.templateId, templateId))
    return rows.map(r => templateHabitRowToItem(r as any))
  }
}
