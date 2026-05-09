import { eq } from 'drizzle-orm'
import { db } from '../index'
import * as s from '../schema'
import type { IUserCalibrationRepository } from '../../../usom/interfaces/irepository'
import type { UserCalibration } from '../../../usom/types/objects'
import type { USOM_ID } from '../../../usom/types/primitives'
import { userCalibrationRowToUSOM, userCalibrationUSOMToRow } from './mappers'

export class UserCalibrationRepository implements IUserCalibrationRepository {
  async findByUserId(userId: USOM_ID): Promise<UserCalibration | null> {
    const rows = await db.select().from(s.userCalibration).where(eq(s.userCalibration.userId, userId))
    return rows[0] ? userCalibrationRowToUSOM(rows[0] as any) : null
  }

  async save(calibration: UserCalibration): Promise<void> {
    const row = userCalibrationUSOMToRow(calibration)
    await db.insert(s.userCalibration).values(row).onConflictDoUpdate({
      target: s.userCalibration.userId,
      set: row,
    })
  }

  async initializeDefaults(userId: USOM_ID): Promise<UserCalibration> {
    const row = { userId: userId }
    await db.insert(s.userCalibration).values(row).onConflictDoNothing()
    const result = await db.select().from(s.userCalibration).where(eq(s.userCalibration.userId, userId))
    return userCalibrationRowToUSOM(result[0] as any)
  }
}
