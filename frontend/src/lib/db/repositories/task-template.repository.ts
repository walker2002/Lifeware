import { eq, and, isNull } from 'drizzle-orm'
import { db } from '../index'
import * as s from '../schema'
import type { ITaskTemplateRepository } from '../../../usom/interfaces/irepository'
import type { Project, ProjectTemplate, TaskTemplate } from '../../../usom/types/objects'
import type { USOM_ID, DateOnly } from '../../../usom/types/primitives'
import { projectTemplateRowToUSOM, projectTemplateUSOMToRow, taskTemplateRowToUSOM, taskTemplateUSOMToRow, projectRowToUSOM } from './mappers'
import { v4 } from 'uuid'

export class TaskTemplateRepository implements ITaskTemplateRepository {
  async findProjectTemplateById(id: USOM_ID, userId: USOM_ID): Promise<ProjectTemplate | null> {
    const rows = await db.select().from(s.projectTemplates)
      .where(and(eq(s.projectTemplates.id, id), eq(s.projectTemplates.userId, userId)))
    return rows[0] ? projectTemplateRowToUSOM(rows[0]) : null
  }

  async findProjectTemplates(userId: USOM_ID): Promise<ProjectTemplate[]> {
    const rows = await db.select().from(s.projectTemplates)
      .where(eq(s.projectTemplates.userId, userId))
    return rows.map(r => projectTemplateRowToUSOM(r))
  }

  async findTasksByProject(projectTemplateId: USOM_ID): Promise<TaskTemplate[]> {
    const rows = await db.select().from(s.taskTemplates)
      .where(eq(s.taskTemplates.projectTemplateId, projectTemplateId))
      .orderBy(s.taskTemplates.sortOrder)
    return rows.map(r => taskTemplateRowToUSOM(r))
  }

  async saveProjectTemplate(template: ProjectTemplate, userId: USOM_ID): Promise<void> {
    const row = projectTemplateUSOMToRow(template, userId)
    await db.insert(s.projectTemplates).values(row).onConflictDoUpdate({
      target: s.projectTemplates.id,
      set: row,
    })
  }

  async saveTaskTemplate(template: TaskTemplate): Promise<void> {
    const row = taskTemplateUSOMToRow(template)
    await db.insert(s.taskTemplates).values(row).onConflictDoUpdate({
      target: s.taskTemplates.id,
      set: row,
    })
  }

  async createFromTemplate(projectTemplateId: USOM_ID, dates: { startDate?: DateOnly; endDate?: DateOnly }, userId: USOM_ID): Promise<Project> {
    return db.transaction(async (tx) => {
      // 1. 加载模板
      const ptRows = await tx.select().from(s.projectTemplates)
        .where(and(eq(s.projectTemplates.id, projectTemplateId), eq(s.projectTemplates.userId, userId)))
      const pt = ptRows[0]
      if (!pt) throw new Error('Project template not found')

      const ttRows = await tx.select().from(s.taskTemplates)
        .where(eq(s.taskTemplates.projectTemplateId, projectTemplateId))
        .orderBy(s.taskTemplates.sortOrder)

      // 2. 创建 Project 实例
      const projectId = v4()
      const now = new Date()
      await tx.insert(s.projects).values({
        id: projectId,
        userId,
        name: pt.name,
        description: pt.description ?? null,
        status: 'planning',
        startDate: dates.startDate ?? null,
        endDate: dates.endDate ?? null,
        defaultEarliestTime: pt.defaultEarliestTime ?? null,
        defaultLatestStartTime: pt.defaultLatestStartTime ?? null,
        defaultDuration: pt.defaultDuration ?? null,
        priority: pt.priority ?? null,
        color: pt.color ?? null,
        tags: pt.tags ?? [],
        createdAt: now,
        updatedAt: now,
      })

      // 3. 两遍创建任务：第一遍创建顶级任务，建立 ID 映射
      const idMap = new Map<USOM_ID, USOM_ID>() // templateId → newTaskId

      for (const tt of ttRows) {
        if (!tt.parentTemplateId) {
          const taskId = v4()
          idMap.set(tt.id, taskId)
          await tx.insert(s.tasks).values({
            id: taskId,
            userId,
            status: 'active',
            title: tt.title,
            description: tt.description ?? null,
            priority: tt.priority ?? 'medium',
            energyRequired: tt.energyRequired ?? 'medium',
            estimatedDuration: tt.estimatedDuration ?? 30,
            projectId: projectId,
            parentId: null,
            earliestTime: tt.earliestTime ?? null,
            latestStartTime: tt.latestStartTime ?? null,
            defaultTime: tt.defaultTime ?? null,
            defaultDuration: tt.defaultDuration ?? null,
            frequencyType: tt.frequencyType ?? null,
            tags: [],
            recurrence: null,
            notes: null,
            createdAt: now,
            updatedAt: now,
          })
        }
      }

      // 4. 第二遍：创建子任务，用映射表替换 parentTemplateId → parentId
      for (const tt of ttRows) {
        if (tt.parentTemplateId) {
          const parentId = idMap.get(tt.parentTemplateId)
          if (!parentId) continue // 父任务模板不存在则跳过
          const taskId = v4()
          await tx.insert(s.tasks).values({
            id: taskId,
            userId,
            status: 'active',
            title: tt.title,
            description: tt.description ?? null,
            priority: tt.priority ?? 'medium',
            energyRequired: tt.energyRequired ?? 'medium',
            estimatedDuration: tt.estimatedDuration ?? 30,
            projectId: projectId,
            parentId,
            earliestTime: tt.earliestTime ?? null,
            latestStartTime: tt.latestStartTime ?? null,
            defaultTime: tt.defaultTime ?? null,
            defaultDuration: tt.defaultDuration ?? null,
            frequencyType: tt.frequencyType ?? null,
            tags: [],
            recurrence: null,
            notes: null,
            createdAt: now,
            updatedAt: now,
          })
        }
      }

      // 5. 返回创建的 Project
      const created = await tx.select().from(s.projects)
        .where(eq(s.projects.id, projectId))
      return projectRowToUSOM(created[0])
    })
  }

  async deleteProjectTemplate(id: USOM_ID, userId: USOM_ID): Promise<void> {
    await db.delete(s.projectTemplates)
      .where(and(eq(s.projectTemplates.id, id), eq(s.projectTemplates.userId, userId)))
  }
}
