# AI 助手 Session 管理优化 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 AI 助手对话 session 从纯内存管理升级为持久化存储，支持标题自动生成、对话删除和上次对话恢复。

**Architecture:** Repository 负责 `ai_sessions` 元数据，Memory Framework L1 独占 `l1_messages` 消息存储。前端通过 server actions 桥接，消息写入严格走 Memory Framework API。

**Tech Stack:** TypeScript, Drizzle ORM, PostgreSQL, React 19, Vitest

---

### Task 1: 数据库 Schema 更新与迁移

**Files:**
- Modify: `frontend/src/lib/db/schema.ts`（新增 l1_messages 表，ai_sessions 新增 deleted_at）
- Create: `frontend/src/lib/db/migrations/0011_l1_messages.sql`

- [ ] **Step 1: 在 schema.ts 中新增 l1_messages 表定义**

在 `aiSessions` 定义之后（约第 593 行）插入：

```typescript
// ─── 8.1b l1_messages (Memory Framework L1) ─────────────────

export const l1Messages = pgTable('l1_messages', {
  id:          uuid('id').primaryKey().defaultRandom(),
  sessionId:   uuid('session_id').notNull().references(() => aiSessions.id, { onDelete: 'cascade' }),
  userId:      uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  role:        text('role', { enum: ['user', 'assistant', 'system'] }).notNull(),
  content:     text('content').notNull(),
  intentRef:   text('intent_ref'),
  cnuiSurface: jsonb('cnui_surface').$type<Record<string, unknown>>(),
  deletedAt:   timestamp('deleted_at', { withTimezone: true }),
  createdAt:   timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  index('idx_l1_messages_session').on(table.sessionId, table.createdAt),
  index('idx_l1_messages_user').on(table.userId),
  index('idx_l1_messages_cleanup').on(table.deletedAt, table.createdAt),
])
```

- [ ] **Step 2: 在 ai_sessions 的 export 前追加 deleted_at 字段**

在 `archivedAt` 行（第 589 行）之后添加：

```typescript
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
```

- [ ] **Step 3: 生成 Drizzle 迁移文件**

```bash
cd frontend && npm run db:generate
```

这会自动生成迁移 SQL。验证生成的 SQL 包含：
- `CREATE TABLE l1_messages (...)` 
- `ALTER TABLE ai_sessions ADD COLUMN deleted_at ...`

- [ ] **Step 4: 手动创建补充 SQL（如需）**

如果 Drizzle 生成的索引名不符合预期，在 `0011_l1_messages.sql` 中手动补全索引。

- [ ] **Step 5: 运行迁移**

```bash
cd frontend && npm run db:migrate
```

验证：`psql -c "\d l1_messages"` 确认表已创建。

- [ ] **Step 6: 提交**

```bash
git add frontend/src/lib/db/schema.ts frontend/src/lib/db/migrations/
git commit -m "feat: 新增 l1_messages 表和 ai_sessions.deleted_at 字段"
```

---

### Task 2: 更新 USOM 类型定义与 Repository 接口

**Files:**
- Modify: `frontend/src/usom/types/objects.ts`（ChatMessage 类型扩展、AISession 新增 deletedAt）
- Modify: `frontend/src/usom/interfaces/irepository.ts`（IAISessionRepository 新增方法、新增 IL1MessageRepository）

- [ ] **Step 1: 扩展 ChatMessage 类型**

在 `ChatMessage` 接口（约第 390 行）中新增 `id` 和 `cnuiSurface` 字段：

```typescript
export interface ChatMessage {
  id?: string                    // L1 消息 ID（持久化后分配）
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Timestamp
  intentRef?: string
  cnuiSurface?: CnuiSurfaceRef  // 已有字段，确认存在
}
```

- [ ] **Step 2: 更新 AISession 类型**

在 `AISession` 接口中添加 `deletedAt`：

```typescript
export interface AISession {
  // ... 现有字段
  archivedAt?: Timestamp
  deletedAt?: Timestamp          // 新增
}
```

- [ ] **Step 3: 更新 IAISessionRepository 接口**

在 `irepository.ts` 的 `IAISessionRepository` 接口中新增方法，替换 `delete` 语义：

```typescript
export interface IAISessionRepository {
  findById(id: USOM_ID, userId: USOM_ID): Promise<AISession | null>
  findByUserId(userId: USOM_ID): Promise<AISessionSummary[]>
  create(session: Omit<AISession, 'id' | 'createdAt' | 'updatedAt'>, userId: USOM_ID): Promise<AISession>
  updateMessages(id: USOM_ID, messages: AISession['messages'], userId: USOM_ID): Promise<void>
  updateStateSnapshot(id: USOM_ID, snapshot: AISession['stateSnapshot'], userId: USOM_ID): Promise<void>
  updateTitle(id: USOM_ID, title: string, userId: USOM_ID): Promise<void>
  updateTimestamp(id: USOM_ID, userId: USOM_ID): Promise<void>       // 新增
  archive(id: USOM_ID, userId: USOM_ID): Promise<void>
  restore(id: USOM_ID, userId: USOM_ID): Promise<void>
  softDelete(id: USOM_ID, userId: USOM_ID): Promise<void>            // 新增：设置 status='deleted', deleted_at=now()
  hardDeleteExpired(retentionDays: number): Promise<number>          // 新增：硬删除过期 session
  // delete 方法移除，由 softDelete 替代
}
```

- [ ] **Step 4: 新增 IL1MessageRepository 接口**

在同文件末尾新增：

```typescript
// ─── L1Message ──────────────────────────────────────────────────
export interface IL1MessageRepository {
  append(message: { sessionId: string; userId: string; role: string; content: string; intentRef?: string; cnuiSurface?: Record<string, unknown> }): Promise<void>
  findBySessionId(sessionId: string, userId: string): Promise<ChatMessage[]>
  softDeleteBySessionId(sessionId: string, userId: string): Promise<void>
  restoreBySessionId(sessionId: string, userId: string): Promise<void>
  hardDeleteExpired(retentionDays: number): Promise<number>
}
```

- [ ] **Step 5: 提交**

```bash
git add frontend/src/usom/types/objects.ts frontend/src/usom/interfaces/irepository.ts
git commit -m "feat: 扩展 USOM 类型和 Repository 接口以支持 L1 消息存储"
```

---

### Task 3: 实现 L1MessageRepository

**Files:**
- Create: `frontend/src/lib/db/repositories/l1-message.repository.ts`
- Create: `frontend/src/lib/db/repositories/__tests__/l1-message.repository.test.ts`

- [ ] **Step 1: 写测试**

创建 `l1-message.repository.test.ts`：

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('../../index', () => ({
  db: {
    insert: vi.fn(() => ({ values: vi.fn() })),
    select: vi.fn(() => ({ from: vi.fn(() => ({ where: vi.fn(() => ({ orderBy: vi.fn(() => Promise.resolve([])) })) })) })),
    update: vi.fn(() => ({ set: vi.fn(() => ({ where: vi.fn(() => Promise.resolve()) })) })),
    delete: vi.fn(() => ({ where: vi.fn(() => Promise.resolve(0)) })),
  },
}))

describe('L1MessageRepository', () => {
  let repo: any

  beforeEach(async () => {
    vi.clearAllMocks()
    const { L1MessageRepository } = await import('../l1-message.repository')
    repo = new L1MessageRepository()
  })

  it('append 插入一条消息', async () => {
    const { db } = await import('../../index')
    await repo.append({ sessionId: 's1', userId: 'u1', role: 'user', content: 'hello' })
    expect(db.insert).toHaveBeenCalled()
  })

  it('findBySessionId 返回按时间排序的消息列表', async () => {
    const { db } = await import('../../index')
    const mockMsgs = [
      { id: '1', session_id: 's1', role: 'user', content: 'hi', created_at: new Date(), deleted_at: null },
    ]
    const mockOrderBy = vi.fn(() => Promise.resolve(mockMsgs))
    const mockWhere = vi.fn(() => ({ orderBy: mockOrderBy }))
    ;(db.select as any).mockReturnValue({ from: vi.fn(() => ({ where: mockWhere })) })
    
    const msgs = await repo.findBySessionId('s1', 'u1')
    expect(msgs).toHaveLength(1)
    expect(msgs[0].role).toBe('user')
  })

  it('softDeleteBySessionId 设置 deleted_at', async () => {
    await repo.softDeleteBySessionId('s1', 'u1')
    const { db } = await import('../../index')
    expect(db.update).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 运行测试验证失败**

```bash
cd frontend && npx vitest run src/lib/db/repositories/__tests__/l1-message.repository.test.ts
```

预期：模块未找到错误。

- [ ] **Step 3: 实现 L1MessageRepository**

创建 `l1-message.repository.ts`：

```typescript
import { eq, and, isNull, or, lt } from 'drizzle-orm'
import { db } from '../index'
import * as s from '../schema'
import type { IL1MessageRepository } from '../../../usom/interfaces/irepository'
import type { ChatMessage } from '../../../usom/types/objects'

export class L1MessageRepository implements IL1MessageRepository {
  async append(message: {
    sessionId: string; userId: string; role: string; content: string
    intentRef?: string; cnuiSurface?: Record<string, unknown>
  }): Promise<void> {
    await db.insert(s.l1Messages).values({
      sessionId: message.sessionId,
      userId: message.userId,
      role: message.role as 'user' | 'assistant' | 'system',
      content: message.content,
      intentRef: message.intentRef ?? null,
      cnuiSurface: message.cnuiSurface ?? null,
    })
  }

  async findBySessionId(sessionId: string, userId: string): Promise<ChatMessage[]> {
    const rows = await db.select()
      .from(s.l1Messages)
      .where(and(
        eq(s.l1Messages.sessionId, sessionId),
        eq(s.l1Messages.userId, userId),
        isNull(s.l1Messages.deletedAt),
      ))
      .orderBy(s.l1Messages.createdAt)

    return rows.map(r => ({
      id: r.id,
      role: r.role as ChatMessage['role'],
      content: r.content,
      timestamp: r.createdAt.toISOString(),
      intentRef: r.intentRef ?? undefined,
      cnuiSurface: r.cnuiSurface as ChatMessage['cnuiSurface'],
    }))
  }

  async softDeleteBySessionId(sessionId: string, userId: string): Promise<void> {
    await db.update(s.l1Messages)
      .set({ deletedAt: new Date() })
      .where(and(
        eq(s.l1Messages.sessionId, sessionId),
        eq(s.l1Messages.userId, userId),
        isNull(s.l1Messages.deletedAt),
      ))
  }

  async restoreBySessionId(sessionId: string, userId: string): Promise<void> {
    await db.update(s.l1Messages)
      .set({ deletedAt: null })
      .where(and(
        eq(s.l1Messages.sessionId, sessionId),
        eq(s.l1Messages.userId, userId),
      ))
  }

  async hardDeleteExpired(retentionDays: number): Promise<number> {
    const now = new Date()
    const cutoff = new Date(now.getTime() - retentionDays * 86400000)

    const results = await db.delete(s.l1Messages).where(
      or(
        lt(s.l1Messages.deletedAt ?? new Date(0), cutoff),   // 软删除超期
        lt(s.l1Messages.createdAt ?? new Date(0), cutoff),    // 正常消息超期
      )!
    ).returning({ id: s.l1Messages.id })

    return results.length
  }
}
```

- [ ] **Step 4: 运行测试验证通过**

```bash
cd frontend && npx vitest run src/lib/db/repositories/__tests__/l1-message.repository.test.ts
```

预期：全部 PASS。

- [ ] **Step 5: 提交**

```bash
git add frontend/src/lib/db/repositories/l1-message.repository.ts frontend/src/lib/db/repositories/__tests__/
git commit -m "feat: 实现 L1MessageRepository"
```

---

### Task 4: 更新 AISessionRepository

**Files:**
- Modify: `frontend/src/lib/db/repositories/session.repository.ts`
- Modify: `frontend/src/lib/db/repositories/mappers.ts`
- Modify: `frontend/src/lib/db/repositories/__tests__/session.repository.test.ts`

- [ ] **Step 1: 更新 mapper 函数**

在 `aiSessionRowToUSOM` 中添加 `deletedAt`：

```typescript
export function aiSessionRowToUSOM(row: any): AISession {
  return {
    // ... 现有字段不变
    archivedAt: (row.archivedAt ?? row.archived_at)?.toISOString() as Timestamp ?? undefined,
    deletedAt: (row.deletedAt ?? row.deleted_at)?.toISOString() as Timestamp ?? undefined,  // 新增
  }
}
```

在 `aiSessionUSOMToRow` 中添加 `deletedAt`：

```typescript
export function aiSessionUSOMToRow(session: Omit<AISession, 'id' | 'createdAt' | 'updatedAt'>) {
  return {
    // ... 现有字段不变
    archivedAt: session.archivedAt ? new Date(session.archivedAt) : null,
    deletedAt: session.deletedAt ? new Date(session.deletedAt) : null,  // 新增
  }
}
```

- [ ] **Step 2: 新增 Repository 方法**

在 `session.repository.ts` 中新增三个方法。替换 `delete` 方法：

```typescript
  async updateTimestamp(id: USOM_ID, userId: USOM_ID): Promise<void> {
    await db.update(s.aiSessions).set({
      updatedAt: new Date(),
    }).where(and(eq(s.aiSessions.id, id), eq(s.aiSessions.userId, userId)))
  }

  async softDelete(id: USOM_ID, userId: USOM_ID): Promise<void> {
    await db.update(s.aiSessions).set({
      status: 'deleted',
      deletedAt: new Date(),
      updatedAt: new Date(),
    }).where(and(eq(s.aiSessions.id, id), eq(s.aiSessions.userId, userId)))
  }

  async hardDeleteExpired(retentionDays: number): Promise<number> {
    const now = new Date()
    const cutoff = new Date(now.getTime() - retentionDays * 86400000)

    const results = await db.delete(s.aiSessions).where(
      and(eq(s.aiSessions.status, 'deleted'), lt(s.aiSessions.deletedAt ?? new Date(0), cutoff))
    ).returning({ id: s.aiSessions.id })

    return results.length
  }
```

**移除原有 `delete` 方法**（硬删除已由 `softDelete` + 惰性 `hardDeleteExpired` 替代）。

- [ ] **Step 3: 更新 findByUserId 排除已删除 session**

在 `findByUserId` 中添加状态过滤：

```typescript
  async findByUserId(userId: USOM_ID): Promise<AISessionSummary[]> {
    const rows = await db.select({
      id: s.aiSessions.id,
      title: s.aiSessions.title,
      status: s.aiSessions.status,
      createdAt: s.aiSessions.createdAt,
      updatedAt: s.aiSessions.updatedAt,
    }).from(s.aiSessions)
      .where(and(
        eq(s.aiSessions.userId, userId),
        // 排除已删除
        eq(s.aiSessions.status, 'active'),
        // ...
      ))
    // 需要返回 active + archived，但排除 deleted
  }
```

实际修改为使用 `not('deleted')` 逻辑：

```typescript
    const rows = await db.select({ /* ... */ }).from(s.aiSessions)
      .where(and(
        eq(s.aiSessions.userId, userId),
      ))
      .orderBy(desc(s.aiSessions.updatedAt))
    
    // 过滤掉已删除的 session（MVP 阶段在应用层过滤）
    return rows
      .filter(r => r.status !== 'deleted')
      .map(r => ({ /* ... 现有映射不变 */ }))
```

- [ ] **Step 4: 补充测试**

在测试文件中新增：

```typescript
  describe('softDelete', () => {
    it('should set status to deleted and set deleted_at', async () => {
      const { db } = await import('../../index')
      // Mock findById 返回 active session
      await repo.softDelete('session-1', userId)
      expect(db.update).toHaveBeenCalled()
    })
  })

  describe('updateTimestamp', () => {
    it('should update updated_at', async () => {
      const { db } = await import('../../index')
      await repo.updateTimestamp('session-1', userId)
      expect(db.update).toHaveBeenCalled()
    })
  })
```

- [ ] **Step 5: 运行测试**

```bash
cd frontend && npx vitest run src/lib/db/repositories/__tests__/session.repository.test.ts
```

- [ ] **Step 6: 提交**

```bash
git add frontend/src/lib/db/repositories/session.repository.ts frontend/src/lib/db/repositories/mappers.ts frontend/src/lib/db/repositories/__tests__/
git commit -m "feat: AISessionRepository 新增 softDelete、updateTimestamp、hardDeleteExpired"
```

---

### Task 5: Memory Framework L1（DB 持久化实现）

**Files:**
- Create: `frontend/src/nexus/ai-runtime/memory/layers/l1-session.ts`
- Modify: `frontend/src/nexus/ai-runtime/memory/types.ts`
- Modify: `frontend/src/nexus/ai-runtime/memory/index.ts`

- [ ] **Step 1: 更新 MemoryL1Session 接口**

修改 `types.ts`：

```typescript
export interface ChatMessageInput {
  role: 'user' | 'assistant' | 'system'
  content: string
  intentRef?: string
  cnuiSurface?: Record<string, unknown>
}

export interface MemoryL1Session {
  appendMessage(sessionId: string, userId: string, message: ChatMessageInput): Promise<void>
  getMessages(sessionId: string, userId: string): Promise<Array<{ role: string; content: string; timestamp: string }>>
  softDeleteMessages(sessionId: string, userId: string): Promise<void>
  restoreMessages(sessionId: string, userId: string): Promise<void>
  hardDeleteExpired(retentionDays: number): Promise<number>
}

export interface MemoryFramework {
  readonly l1: MemoryL1Session
  readonly l2: import('./layers/l2-episode').MemoryL2Episode
}
```

- [ ] **Step 2: 实现 DB-backed L1**

创建 `l1-session.ts`：

```typescript
import type { L1MessageRepository } from '@/lib/db/repositories/l1-message.repository'
import type { MemoryL1Session, ChatMessageInput } from '../types'

export function createMemoryL1(repo: L1MessageRepository): MemoryL1Session {
  return {
    async appendMessage(sessionId, userId, message) {
      await repo.append({
        sessionId,
        userId,
        role: message.role,
        content: message.content,
        intentRef: message.intentRef,
        cnuiSurface: message.cnuiSurface,
      })
    },

    async getMessages(sessionId, userId) {
      return repo.findBySessionId(sessionId, userId)
    },

    async softDeleteMessages(sessionId, userId) {
      await repo.softDeleteBySessionId(sessionId, userId)
    },

    async restoreMessages(sessionId, userId) {
      await repo.restoreBySessionId(sessionId, userId)
    },

    async hardDeleteExpired(retentionDays) {
      return repo.hardDeleteExpired(retentionDays)
    },
  }
}
```

- [ ] **Step 3: 更新 Memory Framework 入口**

修改 `index.ts`，替换内存实现为 DB 实现：

```typescript
import type { MemoryFramework, MemoryL1Session } from './types'
import type { MemoryL2Episode } from './layers/l2-episode'
import { createMemoryL1 } from './layers/l1-session'
import { createMemoryL2 } from './layers/l2-episode'
import { L1MessageRepository } from '@/lib/db/repositories/l1-message.repository'

let instance: MemoryFramework | null = null

export function createMemoryFramework(): MemoryFramework {
  if (instance) return instance

  const l1Repo = new L1MessageRepository()
  const l1 = createMemoryL1(l1Repo)
  const l2 = createMemoryL2()

  instance = { l1, l2 }
  return instance
}

// 暴露用于测试和清理
export function resetMemoryFramework(): void {
  instance = null
}

export type { MemoryFramework, MemoryL1Session } from './types'
export type { MemoryL2Episode, EpisodeData, EpisodeResult } from './layers/l2-episode'
export type { ChatMessageInput } from './types'
```

- [ ] **Step 4: 运行现有测试确认未被破坏**

```bash
cd frontend && npx vitest run src/nexus/ai-runtime/__tests__/phase7-memory.test.ts
```

- [ ] **Step 5: 提交**

```bash
git add frontend/src/nexus/ai-runtime/memory/
git commit -m "feat: Memory Framework L1 从内存实现迁移到 DB 持久化"
```

---

### Task 6: L2 Episode 标题生成扩展

**Files:**
- Modify: `frontend/src/nexus/ai-runtime/memory/layers/l2-episode.ts`

- [ ] **Step 1: 扩展 EpisodeData 和 EpisodeResult**

```typescript
export interface EpisodeData {
  userId: string
  sessionId: string
  domainId: string
  action: string
  messages: Array<{ role: string; content: string }>
  metadata?: Record<string, unknown>
  generateTitle?: boolean  // 新增：是否生成标题
}

export interface EpisodeResult {
  summary: string
  suggestedTitle?: string  // 新增
  metadata: Record<string, unknown>
}
```

- [ ] **Step 2: 扩展 prompt 和解析逻辑**

修改 `generateSummary` 方法：

```typescript
export function createMemoryL2(): MemoryL2Episode {
  return {
    async generateSummary(data, aiRuntime) {
      const messageSummary = data.messages
        .map(m => `${m.role}: ${typeof m.content === 'string' ? m.content.slice(0, 200) : JSON.stringify(m.content).slice(0, 200)}`)
        .join('\n')

      const hashedSessionId = data.sessionId.slice(0, 8)

      const systemPrompt = data.generateTitle
        ? `你是一个对话分析器。根据对话历史完成两项任务：
1. 生成一句话摘要（不超过 50 字）
2. 生成对话标题（不超过 15 个字），标题应概括用户的核心意图

请以 JSON 格式回复：
{
  "summary": "摘要内容",
  "suggestedTitle": "标题"
}

只输出 JSON，不要其他内容。`
        : '你是一个对话摘要生成器。根据以下对话历史，生成一句话摘要（不超过 50 字）。只输出摘要文本，不要其他内容。'

      const response = await aiRuntime.generate({
        domainId: data.domainId,
        action: 'generateSummary',
        systemPrompt,
        messages: [{ role: 'user', content: messageSummary }],
        taskType: 'summary',
        temperature: 0.3,
      })

      const rawContent = typeof response.content === 'string'
        ? response.content.trim()
        : JSON.stringify(response.content)

      let summary: string
      let suggestedTitle: string | undefined

      if (data.generateTitle) {
        try {
          const parsed = JSON.parse(rawContent)
          summary = parsed.summary || `${data.domainId}/${data.action} Session`
          suggestedTitle = parsed.suggestedTitle
        } catch {
          // JSON 解析失败，将整段文本作为摘要
          summary = rawContent
        }
      } else {
        summary = rawContent
      }

      return {
        summary: summary || `${data.domainId}/${data.action} Session ${hashedSessionId}`,
        suggestedTitle,
        metadata: {
          ...data.metadata,
          messageCount: data.messages.length,
          generateTitle: data.generateTitle ?? false,
          model: response.model,
        },
      }
    },
  }
}
```

- [ ] **Step 3: 提交**

```bash
git add frontend/src/nexus/ai-runtime/memory/layers/l2-episode.ts
git commit -m "feat: L2 Episode Summarizer 支持标题自动生成"
```

---

### Task 7: Server Actions（对话持久化 API）

**Files:**
- Create: `frontend/src/app/actions/session.ts`

- [ ] **Step 1: 创建 session server actions**

```typescript
'use server'

import { AISessionRepository } from '@/lib/db/repositories/session.repository'
import { L1MessageRepository } from '@/lib/db/repositories/l1-message.repository'
import { createMemoryFramework } from '@/nexus/ai-runtime/memory'
import type { AISessionSummary, ChatMessage } from '@/usom/types/objects'

const MVP_USER_ID = '00000000-0000-0000-0000-000000000001'
const sessionRepo = new AISessionRepository()
const RETENTION_DAYS = parseInt(process.env.MESSAGE_RETENTION_DAYS || '60', 10)

/** 加载用户所有 session 列表，同时惰性清理过期数据 */
export async function fetchSessions(): Promise<AISessionSummary[]> {
  // 惰性清理
  try {
    const mf = createMemoryFramework()
    await mf.l1.hardDeleteExpired(RETENTION_DAYS)
    await sessionRepo.hardDeleteExpired(RETENTION_DAYS)
  } catch {
    // 清理失败不影响正常流程
  }
  
  return sessionRepo.findByUserId(MVP_USER_ID)
}

/** 加载某个 session 的全部消息 */
export async function loadSessionMessages(sessionId: string): Promise<ChatMessage[]> {
  const mf = createMemoryFramework()
  return mf.l1.getMessages(sessionId, MVP_USER_ID) as Promise<ChatMessage[]>
}

/** 创建新 session */
export async function createSession(title?: string): Promise<{ id: string; title: string }> {
  const now = new Date().toISOString()
  const defaultTitle = `${now.slice(5, 7)}月${now.slice(8, 10)}日对话`
  
  const session = await sessionRepo.create({
    userId: MVP_USER_ID,
    title: title || defaultTitle,
    status: 'active',
    messages: [],
    stateSnapshot: {},
    referencedObjectIds: [],
  }, MVP_USER_ID)

  return { id: session.id, title: session.title }
}

/** 持久化一条消息到 Memory Framework L1 */
export async function saveMessage(sessionId: string, message: {
  role: 'user' | 'assistant' | 'system'
  content: string
  intentRef?: string
  cnuiSurface?: Record<string, unknown>
}): Promise<void> {
  const mf = createMemoryFramework()
  await mf.l1.appendMessage(sessionId, MVP_USER_ID, message)
  await sessionRepo.updateTimestamp(sessionId, MVP_USER_ID)
}

/** 软删除 session */
export async function deleteSession(sessionId: string): Promise<void> {
  const mf = createMemoryFramework()
  await sessionRepo.softDelete(sessionId, MVP_USER_ID)
  await mf.l1.softDeleteMessages(sessionId, MVP_USER_ID)
}

/** 恢复已删除 session（60 天内） */
export async function restoreSession(sessionId: string): Promise<void> {
  const mf = createMemoryFramework()
  await sessionRepo.restore(sessionId, MVP_USER_ID)
  await mf.l1.restoreMessages(sessionId, MVP_USER_ID)
}

/** 获取 session 消息计数 */
export async function getMessageCount(sessionId: string): Promise<number> {
  const mf = createMemoryFramework()
  const messages = await mf.l1.getMessages(sessionId, MVP_USER_ID)
  return messages.length
}
```

- [ ] **Step 2: 提交**

```bash
git add frontend/src/app/actions/session.ts
git commit -m "feat: 新增 session 持久化 server actions"
```

---

### Task 8: Frontend — page.tsx 集成持久化

**Files:**
- Modify: `frontend/src/app/page.tsx`

- [ ] **Step 1: 新增 import**

在文件顶部新增：

```typescript
import { fetchSessions, loadSessionMessages, createSession, saveMessage, deleteSession } from './actions/session'
```

- [ ] **Step 2: 新增 session 加载 useEffect**

在现有 `useEffect` 块附近新增页面加载逻辑。在 `const [activeSessionId, setActiveSessionId] = useState<string | undefined>()` 之后添加：

```typescript
  const [sessionsLoaded, setSessionsLoaded] = useState(false)

  // 页面加载：拉取 session 列表 + 自动恢复上次活跃对话
  useEffect(() => {
    fetchSessions()
      .then(data => {
        setSessions(data)
        // 自动恢复：找到最近活跃 session
        const lastActive = data.find(s => s.status === 'active')
        if (lastActive) {
          setActiveSessionId(lastActive.id)
          setMainViewState({ type: 'conversation', sessionId: lastActive.id })
          return loadSessionMessages(lastActive.id)
        }
        return [] as ChatMessage[]
      })
      .then(msgs => {
        if (msgs.length > 0) setConversationMessages(msgs)
      })
      .catch(err => console.error('[fetchSessions] 加载失败:', err))
      .finally(() => setSessionsLoaded(true))
  }, [])
```

- [ ] **Step 3: 修改 handleNewSession — 使用 server action 创建**

```typescript
  const handleNewSession = useCallback(async () => {
    const hasSubstantialMessages = conversationMessages.some(
      m => m.role === 'user' || (m.role === 'assistant' && m.content.trim().length > 0)
    )
    if (!hasSubstantialMessages && mainViewState.type === 'conversation') {
      setConversationMessages([])
      return
    }

    setConversationMessages([])
    
    try {
      const { id, title } = await createSession()
      setSessions(prev => [{
        id, title, status: 'active',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      }, ...prev])
      setActiveSessionId(id)
      setMainViewState({ type: 'conversation', sessionId: id })
    } catch (err) {
      console.error('[createSession] 创建失败:', err)
      // 降级：本地创建
      const newId = crypto.randomUUID()
      setSessions(prev => [{
        id: newId, title: '新对话', status: 'active',
        createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
      }, ...prev])
      setActiveSessionId(newId)
      setMainViewState({ type: 'conversation', sessionId: newId })
    }
  }, [conversationMessages, mainViewState])
```

- [ ] **Step 4: 新增 addChatMessage 辅助函数，统一消息推送 + 持久化**

在 `handleSelectSession` 附近新增辅助函数，替换所有分散的 `setConversationMessages(prev => [...prev, msg])`：

```typescript
  /** 添加消息到对话列表并持久化到 L1 */
  const addChatMessage = useCallback((msg: ChatMessage) => {
    setConversationMessages(prev => [...prev, msg])
    if (activeSessionId) {
      saveMessage(activeSessionId, {
        role: msg.role,
        content: msg.content,
        cnuiSurface: msg.cnuiSurface,
        intentRef: msg.intentRef,
      }).catch(err => console.error('[saveMessage] 持久化失败:', err))
    }
  }, [activeSessionId])
```

- [ ] **Step 5: 全局替换 setConversationMessages 模式为 addChatMessage**

将 `handleConversationSend` 及其余所有回调（`handleGrowthAction`、`handleCnuiConfirm`、`ensureConversationView` 等）中所有 `setConversationMessages(prev => [...prev, <msg>])` 替换为 `addChatMessage(<msg>)`。

替换覆盖范围（在 page.tsx 中搜索 `setConversationMessages`，逐一替换）：
- `handleConversationSend` 中的 user/assistant/system 消息（约 10+ 处）
- `handleGrowthAction` 中的 cnui surface 消息（2 处）
- `handleCnuiConfirm` 中的成功/失败/网络错误消息（3 处）
- `ensureConversationView` 中对空消息的 set（保留 `setConversationMessages([])` 不动，仅替换 append 模式）
- `handleNewSession` 中的 `setConversationMessages([])`（不动，这是清空不是追加）
- `handleSelectSession` 中的加载消息，使用 `setConversationMessages(msgs)`（完整替换，不是追加，不动）

VSCode 正则替换：搜索 `setConversationMessages\(prev => \[\.\.\.prev, (.+)\]\)` 替换为 `addChatMessage($1)`。

- [ ] **Step 6: 新增 handleDeleteSession**

```typescript
  const handleDeleteSession = useCallback(async (sessionId: string) => {
    try {
      await deleteSession(sessionId)
      setSessions(prev => prev.filter(s => s.id !== sessionId))
      if (activeSessionId === sessionId) {
        setActiveSessionId(undefined)
        setConversationMessages([])
        setMainViewState({ type: 'schedule', date: new Date(), viewMode: dateMode })
      }
    } catch (err) {
      console.error('[deleteSession] 删除失败:', err)
    }
  }, [activeSessionId, dateMode])
```

- [ ] **Step 7: 将 handleDeleteSession 传入 SessionList**

找到 `<SessionList .../>` 用法的位置，添加 `onDeleteSession`：

```typescript
    <SessionList
      sessions={sessions}
      activeSessionId={activeSessionId}
      onSelectSession={handleSelectSession}
      onNewSession={handleNewSession}
      onDeleteSession={handleDeleteSession}
    />
```

- [ ] **Step 8: handleSelectSession 改为加载历史消息**

```typescript
  const handleSelectSession = useCallback(async (sessionId: string) => {
    saveCurrentConversation()
    setMainViewState({ type: 'conversation', sessionId })
    setActiveSessionId(sessionId)
    try {
      const msgs = await loadSessionMessages(sessionId)
      setConversationMessages(msgs)
    } catch (err) {
      console.error('[loadSessionMessages] 加载失败:', err)
    }
  }, [saveCurrentConversation])
```

- [ ] **Step 9: 移除 saveCurrentConversation 的旧逻辑**

原函数只更新内存中的 `updatedAt`，现在不再需要（由 `saveMessage` 负责）。删除函数体或改为空实现：

```typescript
  const saveCurrentConversation = useCallback(() => {
    // 持久化已由 saveMessage 在每个消息发送时处理
  }, [])
```

- [ ] **Step 10: 提交**

```bash
git add frontend/src/app/page.tsx
git commit -m "feat: 前端接入 session 持久化、自动恢复、删除功能"
```

---

### Task 9: session-list.tsx — UI 更新

**Files:**
- Modify: `frontend/src/components/layout/session-list.tsx`

- [ ] **Step 1: 更新组件，实现双行显示 + 删除按钮 + 归档折叠**

完整替换组件内容：

```typescript
'use client'

import { useState } from 'react'
import type { AISessionSummary } from '@/usom/types/objects'

interface SessionListProps {
  sessions: AISessionSummary[]
  activeSessionId?: string
  onSelectSession: (sessionId: string) => void
  onNewSession: () => void
  onArchiveSession?: (sessionId: string) => void
  onDeleteSession?: (sessionId: string) => void
}

function formatTime(isoString: string): string {
  const d = new Date(isoString)
  const month = d.getMonth() + 1
  const day = d.getDate()
  const hour = d.getHours().toString().padStart(2, '0')
  const min = d.getMinutes().toString().padStart(2, '0')
  return `${month}月${day}日 ${hour}:${min}`
}

function groupByDate(sessions: AISessionSummary[]): { label: string; sessions: AISessionSummary[] }[] {
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yesterday = new Date(today.getTime() - 86400000)

  const activeItems: AISessionSummary[] = []
  const archivedItems: AISessionSummary[] = []

  for (const s of sessions) {
    if (s.status === 'archived') {
      archivedItems.push(s)
    } else {
      activeItems.push(s)
    }
  }

  const groups: { label: string; sessions: AISessionSummary[] }[] = [
    { label: '今天', sessions: [] as AISessionSummary[] },
    { label: '昨天', sessions: [] as AISessionSummary[] },
    { label: '更早', sessions: [] as AISessionSummary[] },
  ]

  for (const session of activeItems) {
    const updated = new Date(session.updatedAt)
    const day = new Date(updated.getFullYear(), updated.getMonth(), updated.getDate())
    if (day.getTime() === today.getTime()) {
      groups[0].sessions.push(session)
    } else if (day.getTime() === yesterday.getTime()) {
      groups[1].sessions.push(session)
    } else {
      groups[2].sessions.push(session)
    }
  }

  const filtered = groups.filter(g => g.sessions.length > 0)

  return { activeGroups: filtered, archivedItems }
}

export function SessionList({ sessions, activeSessionId, onSelectSession, onNewSession, onDeleteSession }: SessionListProps) {
  const [showArchived, setShowArchived] = useState(false)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const { activeGroups, archivedItems } = groupByDate(sessions)

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={onNewSession}
        className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-hairline px-3 py-2 text-sm text-body hover:bg-surface-soft hover:text-ink transition-colors"
      >
        + 新对话
      </button>

      {activeGroups.map(group => (
        <div key={group.label}>
          <div className="px-1 py-1 text-xs font-medium text-body/60">{group.label}</div>
          {group.sessions.map(session => (
            <div
              key={session.id}
              className="relative group"
              onMouseEnter={() => setHoveredId(session.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              <button
                type="button"
                onClick={() => onSelectSession(session.id)}
                className={`flex w-full flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left transition-colors ${
                  session.id === activeSessionId
                    ? 'bg-surface-soft text-ink'
                    : 'text-body hover:bg-surface-soft/50'
                }`}
              >
                <span className="truncate w-full text-sm">{session.title}</span>
                <span className="text-xs text-body/40">{formatTime(session.updatedAt)}</span>
              </button>
              {hoveredId === session.id && onDeleteSession && (
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); onDeleteSession(session.id) }}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded text-body/30 hover:text-red-500 transition-colors"
                  title="删除对话"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      ))}

      {archivedItems.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowArchived(!showArchived)}
            className="flex w-full items-center gap-1 px-1 py-1 text-xs font-medium text-body/40 hover:text-body/60 transition-colors"
          >
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              className={`transition-transform ${showArchived ? 'rotate-90' : ''}`}>
              <path d="M9 18l6-6-6-6" />
            </svg>
            已归档 ({archivedItems.length})
          </button>
          {showArchived && archivedItems.map(session => (
            <div key={session.id} className="relative group"
              onMouseEnter={() => setHoveredId(session.id)}
              onMouseLeave={() => setHoveredId(null)}>
              <button
                type="button"
                onClick={() => onSelectSession(session.id)}
                className="flex w-full flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left text-body/50 hover:bg-surface-soft/50 transition-colors"
              >
                <span className="truncate w-full text-sm">{session.title}</span>
                <span className="text-xs text-body/30">{formatTime(session.updatedAt)}</span>
              </button>
            </div>
          ))}
        </div>
      )}

      {sessions.length === 0 && (
        <p className="py-4 text-center text-xs text-body/40">暂无对话</p>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 提交**

```bash
git add frontend/src/components/layout/session-list.tsx
git commit -m "feat: session 列表支持双行显示、hover 删除、归档折叠"
```

---

### Task 10: confirm-delete-dialog.tsx

**Files:**
- Create: `frontend/src/components/layout/confirm-delete-dialog.tsx`

- [ ] **Step 1: 创建确认对话框组件**

```typescript
'use client'

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'

interface ConfirmDeleteDialogProps {
  open: boolean
  sessionTitle: string
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDeleteDialog({ open, sessionTitle, onConfirm, onCancel }: ConfirmDeleteDialogProps) {
  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) onCancel() }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>删除对话</AlertDialogTitle>
          <AlertDialogDescription>
            确定要删除「{sessionTitle}」吗？删除后的 {process.env.NEXT_PUBLIC_MESSAGE_RETENTION_DAYS || '60'} 天内可以恢复。
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>取消</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} className="bg-red-600 hover:bg-red-700">
            删除
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
```

- [ ] **Step 2: 基础 shadcn/ui alert-dialog 验证**

确认 `@/components/ui/alert-dialog` 存在（shadcn/ui 标准组件）。

- [ ] **Step 3: 提交**

```bash
git add frontend/src/components/layout/confirm-delete-dialog.tsx
git commit -m "feat: 新增对话删除确认对话框"
```

---

### Task 11: 标题自动生成集成

**Files:**
- Modify: `frontend/src/app/actions/session.ts`（追加标题生成 server action）
- Modify: `frontend/src/app/page.tsx`（消息发送后触发标题生成）

- [ ] **Step 1: 新增标题生成 server action**

在 `session.ts` 中追加：

```typescript
import { createAIRuntime } from '@/nexus/ai-runtime'
import type { ChatMessage } from '@/usom/types/objects'

/** 检查并生成标题（在消息数达到阈值时调用） */
export async function tryGenerateTitle(sessionId: string): Promise<string | null> {
  const mf = createMemoryFramework()
  const messages = await mf.l1.getMessages(sessionId, MVP_USER_ID)
  
  // 只在恰好 4 条消息时（2 轮对话）触发标题生成
  if (messages.length !== 4) return null

  const session = await sessionRepo.findById(sessionId, MVP_USER_ID)
  if (!session) return null

  try {
    const aiRuntime = createAIRuntime()
    const result = await mf.l2.generateSummary({
      userId: MVP_USER_ID,
      sessionId,
      domainId: 'system',
      action: 'generateTitle',
      messages: messages.map((m: ChatMessage) => ({ role: m.role, content: m.content })),
      generateTitle: true,
    }, aiRuntime)

    if (result.suggestedTitle) {
      await sessionRepo.updateTitle(sessionId, result.suggestedTitle, MVP_USER_ID)
      return result.suggestedTitle
    }
  } catch (err) {
    console.error('[tryGenerateTitle] 标题生成失败:', err)
  }

  return null
}
```

- [ ] **Step 2: 在 page.tsx 中集成标题生成**

在 `handleConversationSend` 的 AI 消息持久化之后，追加标题生成触发逻辑。

在添加 AI 响应消息到 state 后，判断消息总数触发标题生成：

```typescript
    // 在 AI 消息持久化之后添加：
    getMessageCount(activeSessionId).then(count => {
      if (count === 4) {
        tryGenerateTitle(activeSessionId).then(newTitle => {
          if (newTitle) {
            setSessions(prev => prev.map(s =>
              s.id === activeSessionId ? { ...s, title: newTitle } : s
            ))
          }
        }).catch(() => {})
      }
    }).catch(() => {})
```

- [ ] **Step 3: 提交**

```bash
git add frontend/src/app/actions/session.ts frontend/src/app/page.tsx
git commit -m "feat: 集成 L2 标题自动生成，2 轮对话后触发"
```

---

### Task 12: 环境变量与最终验证

**Files:**
- Modify: `frontend/.env.local`
- (可选) Modify: `frontend/.env.example`

- [ ] **Step 1: 添加环境变量**

在 `.env.local` 中追加：

```
MESSAGE_RETENTION_DAYS=60
```

- [ ] **Step 2: 端到端手动验证**

启动 dev server：

```bash
cd frontend && npm run dev
```

手动测试以下场景：
1. 新建对话 → 发送消息 → **刷新页面** → 确认对话仍在列表中
2. 点击对话 → 确认历史消息正确加载
3. 发送 2 轮对话（4 条消息）→ 确认标题从"X月X日对话"变为 AI 生成标题
4. hover 对话 → 点删除图标 → 确认对话框 → 确认对话从列表消失
5. 关闭页面重新打开 → 确认自动恢复上次活跃对话

- [ ] **Step 3: 运行全部测试**

```bash
cd frontend && npx vitest run
```

确认所有现有测试通过。

- [ ] **Step 4: 提交**

```bash
git add frontend/.env.local
git commit -m "chore: 添加 MESSAGE_RETENTION_DAYS 环境变量"
```

---

## 依赖关系

```
Task 1 (DB Schema)
  ├─ Task 2 (USOM Types) ─┐
  └─ Task 3 (L1MessageRepo) ─┐
                              ├─ Task 5 (Memory L1) ─┐
Task 4 (AISessionRepo update) ────────────────────────┤
                                                       ├─ Task 7 (Server Actions) ─┐
Task 6 (L2 Title Generation) ──────────────────────────┘                          │
                                                                                   ├─ Task 8 (page.tsx) ─┐
                                                                                   │                      ├─ Task 11 (Title Integration)
                                                                                   ├─ Task 9 (session-list)┘
                                                                                   └─ Task 10 (Confirm Dialog)

Task 12 (Env + Validation) — 最后执行
```

Tasks 2/3/4/6 可并行执行。Task 5 依赖 3。Task 7 依赖 4/5/6。Task 8/9/10 依赖 7 可并行。
