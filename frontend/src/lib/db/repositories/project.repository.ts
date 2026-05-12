import { eq, and, inArray } from 'drizzle-orm'
import { db } from '../index'
import * as s from '../schema'
import type { IProjectRepository, CreateProjectInput, UpdateProjectInput, ProjectFilters } from '../../../usom/interfaces/irepository'
import type { Project, ProjectTemplate } from '../../../usom/types/objects'
import type { USOM_ID, ProjectStatus } from '../../../usom/types/primitives'
import { projectRowToUSOM, projectUSOMToRow, projectTemplateRowToUSOM } from './mappers'
import { v4 } from 'uuid'

export class ProjectRepository implements IProjectRepository {
  async findById(id: USOM_ID, userId: USOM_ID): Promise<Project | null> {
    const rows = await db.select().from(s.projects)
      .where(and(eq(s.projects.id, id), eq(s.projects.userId, userId)))
    return rows[0] ? projectRowToUSOM(rows[0]) : null
  }

  async findByUserId(userId: USOM_ID, filters?: ProjectFilters): Promise<Project[]> {
    const conditions = [eq(s.projects.userId, userId)]
    if (filters?.status) {
      const statuses = Array.isArray(filters.status) ? filters.status : [filters.status]
      conditions.push(inArray(s.projects.status, statuses))
    }
    const rows = await db.select().from(s.projects).where(and(...conditions))
    return rows.map(r => projectRowToUSOM(r))
  }

  async findByStatus(status: ProjectStatus, userId: USOM_ID): Promise<Project[]> {
    const rows = await db.select().from(s.projects)
      .where(and(eq(s.projects.status, status), eq(s.projects.userId, userId)))
    return rows.map(r => projectRowToUSOM(r))
  }

  async create(input: CreateProjectInput, userId: USOM_ID): Promise<Project> {
    const id = v4()
    const now = new Date()
    await db.insert(s.projects).values({
      id,
      userId,
      name: input.name,
      description: input.description ?? null,
      status: 'planning',
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      priority: input.priority ?? null,
      color: input.color ?? null,
      tags: input.tags ?? [],
      createdAt: now,
      updatedAt: now,
    })
    const created = await this.findById(id, userId)
    return created!
  }

  async update(id: USOM_ID, input: UpdateProjectInput, userId: USOM_ID): Promise<Project> {
    await db.update(s.projects)
      .set({ ...input, updatedAt: new Date() })
      .where(and(eq(s.projects.id, id), eq(s.projects.userId, userId)))
    return (await this.findById(id, userId))!
  }

  async updateStatus(id: USOM_ID, status: ProjectStatus, userId: USOM_ID): Promise<Project> {
    const updates: Record<string, unknown> = { status, updatedAt: new Date() }
    if (status === 'completed') updates.completedAt = new Date()
    if (status === 'archived') updates.archivedAt = new Date()
    await db.update(s.projects).set(updates)
      .where(and(eq(s.projects.id, id), eq(s.projects.userId, userId)))
    return (await this.findById(id, userId))!
  }

  async saveAsTemplate(id: USOM_ID, userId: USOM_ID): Promise<ProjectTemplate> {
    return db.transaction(async (tx) => {
      const project = await this.findById(id, userId)
      if (!project) throw new Error('Project not found')

      // 加载项目的所有任务
      const taskRows = await tx.select().from(s.tasks)
        .where(and(eq(s.tasks.projectId, id), eq(s.tasks.userId, userId)))

      const templateId = v4()
      const now = new Date()
      await tx.insert(s.projectTemplates).values({
        id: templateId,
        userId,
        name: project.name,
        description: project.description ?? null,
        priority: project.priority ?? null,
        color: project.color ?? null,
        tags: project.tags,
        createdAt: now,
        updatedAt: now,
      })

      // 两遍创建任务模板：第一遍创建顶级任务，建立 ID 映射
      const idMap = new Map<string, string>() // taskId → templateTaskId
      let sortOrder = 0

      for (const t of taskRows) {
        if (!t.parentId) {
          const ttId = v4()
          idMap.set(t.id, ttId)
          await tx.insert(s.taskTemplates).values({
            id: ttId,
            projectTemplateId: templateId,
            parentTemplateId: null,
            title: t.title,
            description: t.description ?? null,
            priority: t.priority ?? null,
            energyRequired: t.energyRequired ?? null,
            estimatedDuration: t.estimatedDuration ?? null,
            frequencyType: t.frequencyType ?? null,
            sortOrder: sortOrder++,
            createdAt: now,
          })
        }
      }

      // 第二遍：创建子任务模板，用映射表替换 parentId → parentTemplateId
      for (const t of taskRows) {
        if (t.parentId) {
          const parentTemplateId = idMap.get(t.parentId)
          if (!parentTemplateId) continue
          await tx.insert(s.taskTemplates).values({
            id: v4(),
            projectTemplateId: templateId,
            parentTemplateId,
            title: t.title,
            description: t.description ?? null,
            priority: t.priority ?? null,
            energyRequired: t.energyRequired ?? null,
            estimatedDuration: t.estimatedDuration ?? null,
            frequencyType: t.frequencyType ?? null,
            sortOrder: sortOrder++,
            createdAt: now,
          })
        }
      }

      return (await tx.select().from(s.projectTemplates)
        .where(eq(s.projectTemplates.id, templateId))
        .then(rows => projectTemplateRowToUSOM(rows[0])))!
    })
  }

  async archive(id: USOM_ID, userId: USOM_ID): Promise<void> {
    await this.updateStatus(id, 'archived', userId)
  }

  async delete(id: USOM_ID, userId: USOM_ID): Promise<void> {
    await db.delete(s.projects)
      .where(and(eq(s.projects.id, id), eq(s.projects.userId, userId)))
  }
}
