import { eq, desc } from 'drizzle-orm'
import { db } from '../index'
import * as s from '../schema'
import type { IActionSurfaceRepository } from '../../../usom/interfaces/irepository'
import type { ActionSurface } from '../../../usom/types/process'
import type { USOM_ID } from '../../../usom/types/primitives'
import { actionSurfaceToRow } from './mappers'

export class ActionSurfaceRepository implements IActionSurfaceRepository {
  async findLatest(userId: USOM_ID): Promise<ActionSurface | null> {
    const rows = await db.select().from(s.actionSurfaces)
      .where(eq(s.actionSurfaces.userId, userId))
      .orderBy(desc(s.actionSurfaces.generatedAt))
      .limit(1)
    if (!rows[0]) return null
    const r = rows[0] as any
    return {
      id: r.id,
      userId: r.user_id,
      snapshotId: r.snapshot_id,
      generatedAt: r.generated_at.toISOString(),
      guide: r.guide ?? [],
      tiles: r.tiles ?? [],
      cues: r.cues ?? [],
    } as ActionSurface
  }

  async save(surface: ActionSurface, userId: USOM_ID): Promise<void> {
    await db.insert(s.actionSurfaces).values(actionSurfaceToRow(surface, userId))
  }
}
