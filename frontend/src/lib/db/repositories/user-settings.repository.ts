import { eq } from 'drizzle-orm'
import { db } from '../index'
import * as s from '../schema'
import type { IUserSettingsRepository } from '../../../usom/interfaces/irepository'
import type { UserSettings } from '../../../usom/types/objects'
import type { USOM_ID } from '../../../usom/types/primitives'

export class UserSettingsRepository implements IUserSettingsRepository {
  async findByUserId(userId: USOM_ID): Promise<UserSettings | null> {
    const rows = await db.select().from(s.userSettings)
      .where(eq(s.userSettings.userId, userId))
    if (rows.length === 0) return null
    const row = rows[0]
    return {
      id: row.id,
      userId: row.userId,
      timezone: row.timezone,
      llmConfig: row.llmConfig as UserSettings['llmConfig'],
      uiPrefs: row.uiPrefs as UserSettings['uiPrefs'],
    }
  }

  async upsert(settings: Omit<UserSettings, 'id'>, userId: USOM_ID): Promise<UserSettings> {
    const existing = await this.findByUserId(userId)
    if (existing) {
      await db.update(s.userSettings).set({
        timezone: settings.timezone,
        llmConfig: settings.llmConfig ?? null,
        uiPrefs: settings.uiPrefs ?? null,
        updatedAt: new Date(),
      }).where(eq(s.userSettings.userId, userId))
      return { ...existing, ...settings }
    }
    const [inserted] = await db.insert(s.userSettings).values({
      userId,
      timezone: settings.timezone,
      llmConfig: settings.llmConfig ?? null,
      uiPrefs: settings.uiPrefs ?? null,
    }).returning()
    return {
      id: inserted.id,
      userId: inserted.userId,
      timezone: inserted.timezone,
      llmConfig: inserted.llmConfig as UserSettings['llmConfig'],
      uiPrefs: inserted.uiPrefs as UserSettings['uiPrefs'],
    }
  }
}
