import { db } from './index';
import * as schema from './schema';
import { eq, desc, and, gte, lte, sql } from 'drizzle-orm';

// Task queries
export class TaskQueries {
  static async findById(id: string) {
    return await db.select().from(schema.tasks).where(eq(schema.tasks.id, id));
  }

  static async findByStatus(status: string) {
    return await db.select().from(schema.tasks).where(eq(schema.tasks.status, status));
  }

  static async findActiveByPriority(priority: string) {
    return await db.select().from(schema.tasks)
      .where(and(
        eq(schema.tasks.status, 'active'),
        eq(schema.tasks.priority, priority)
      ))
      .orderBy(desc(schema.tasks.createdAt));
  }

  static async create(data: typeof schema.tasks.$inferInsert) {
    return await db.insert(schema.tasks).values(data).returning();
  }

  static async update(id: string, data: Partial<typeof schema.tasks.$inferInsert>) {
    return await db.update(schema.tasks)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.tasks.id, id))
      .returning();
  }

  static async delete(id: string) {
    return await db.delete(schema.tasks).where(eq(schema.tasks.id, id));
  }
}

// Habit queries
export class HabitQueries {
  static async findById(id: string) {
    return await db.select().from(schema.habits).where(eq(schema.habits.id, id));
  }

  static async findActive() {
    return await db.select().from(schema.habits).where(eq(schema.habits.status, 'active'));
  }

  static async create(data: typeof schema.habits.$inferInsert) {
    return await db.insert(schema.habits).values(data).returning();
  }

  static async update(id: string, data: Partial<typeof schema.habits.$inferInsert>) {
    return await db.update(schema.habits)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.habits.id, id))
      .returning();
  }
}

// TimeBox queries
export class TimeBoxQueries {
  static async findById(id: string) {
    return await db.select().from(schema.timeboxes).where(eq(schema.timeboxes.id, id));
  }

  static async findRunning() {
    return await db.select().from(schema.timeboxes).where(eq(schema.timeboxes.status, 'running'));
  }

  static async findToday() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    return await db.select().from(schema.timeboxes).where(and(
      gte(schema.timeboxes.startTime, today),
      lte(schema.timeboxes.startTime, tomorrow)
    ));
  }

  static async create(data: typeof schema.timeboxes.$inferInsert) {
    return await db.insert(schema.timeboxes).values(data).returning();
  }

  static async update(id: string, data: Partial<typeof schema.timeboxes.$inferInsert>) {
    return await db.update(schema.timeboxes)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(schema.timeboxes.id, id))
      .returning();
  }
}

// Repository pattern implementation for Nexus layer
export interface ITaskRepository {
  findById(id: string): Promise<any>;
  findByStatus(status: string): Promise<any[]>;
  findByPriority(priority: string): Promise<any[]>;
  save(task: any): Promise<void>;
  delete(id: string): Promise<void>;
}

export class TaskRepository implements ITaskRepository {
  constructor(private db: any) {}

  async findById(id: string) {
    return await TaskQueries.findById(id);
  }

  async findByStatus(status: string) {
    return await TaskQueries.findByStatus(status);
  }

  async findByPriority(priority: string) {
    return await TaskQueries.findActiveByPriority(priority);
  }

  async save(task: any) {
    if (task.id) {
      await TaskQueries.update(task.id, task);
    } else {
      await TaskQueries.create(task);
    }
  }

  async delete(id: string) {
    await TaskQueries.delete(id);
  }
}

// USOM Snapshot repository
export interface IUSOMSnapshot {
  tasks: any[];
  habits: any[];
  timeboxes: any[];
  okrs: any[];
  context: Record<string, any>;
}

export class USOMSnapshot {
  static async build(userId?: string): Promise<IUSOMSnapshot> {
    // This would normally include user-specific filtering
    // For MVP, we'll get all data

    const [tasks, habits, timeboxes, okrs] = await Promise.all([
      db.select().from(schema.tasks),
      db.select().from(schema.habits),
      db.select().from(schema.timeboxes),
      db.select().from(schema.okrs),
    ]);

    return {
      tasks,
      habits,
      timeboxes,
      okrs,
      context: {}, // ContextSnapshot would be built by State Machine
    };
  }
}