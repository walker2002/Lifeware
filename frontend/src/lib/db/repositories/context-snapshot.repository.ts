import { eq, desc } from 'drizzle-orm'
import { db } from '../index'
import * as s from '../schema'
import type { IContextSnapshotRepository } from '../../../usom/interfaces/irepository'
import type { ContextSnapshot } from '../../../usom/types/process'
import type { USOM_ID } from '../../../usom/types/primitives'
import { contextSnapshotToRow } from './mappers'

export class ContextSnapshotRepository implements IContextSnapshotRepository {
  async findLatest(userId: USOM_ID): Promise<ContextSnapshot | null> {
    const rows = await db.select().from(s.contextSnapshots)
      .where(eq(s.contextSnapshots.userId, userId))
      .orderBy(desc(s.contextSnapshots.generatedAt))
      .limit(1)
    if (!rows[0]) return null
    const r = rows[0] as any
    return {
      snapshotId: r.id,
      userId: r.user_id,
      generatedAt: r.generated_at.toISOString(),
      generatedBy: 'state_machine',
      currentTime: r.current_time.toISOString(),
      currentDate: r.current_date,
      dayOfWeek: r.day_of_week,
      timeOfDay: r.time_of_day,
      energyState: r.energy_state,
      activeObjectives: r.active_objectives ?? [],
      activeKeyResults: r.active_key_results ?? [],
      activeTasks: r.active_tasks ?? [],
      pendingHabits: r.pending_habits ?? [],
      currentTimebox: r.current_timebox ?? undefined,
      upcomingTimeboxes: r.upcoming_timeboxes ?? [],
      pendingIntentions: r.pending_intentions ?? [],
    } as ContextSnapshot
  }

  async save(snapshot: ContextSnapshot, userId: USOM_ID): Promise<void> {
    await db.insert(s.contextSnapshots).values(contextSnapshotToRow(snapshot, userId))
  }
}
