import { eq } from 'drizzle-orm'
import { db } from '../index'
import * as s from '../schema'
import type { IUserRepository } from '../../../usom/interfaces/irepository'
import type { User } from '../../../usom/types/objects'
import type { USOM_ID } from '../../../usom/types/primitives'
import { userRowToUSOM, userUSOMToRow } from './mappers'

export class UserRepository implements IUserRepository {
  async findById(id: USOM_ID): Promise<User | null> {
    const rows = await db.select().from(s.users).where(eq(s.users.id, id))
    return rows[0] ? userRowToUSOM(rows[0] as any) : null
  }

  async findByEmail(email: string): Promise<User | null> {
    const rows = await db.select().from(s.users).where(eq(s.users.email, email))
    return rows[0] ? userRowToUSOM(rows[0] as any) : null
  }

  async save(user: User): Promise<void> {
    await db.insert(s.users).values(userUSOMToRow(user)).onConflictDoUpdate({
      target: s.users.id,
      set: { email: user.email },
    })
  }
}
