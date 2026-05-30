# AI 助手 Session 管理优化设计

**日期**: 2026-05-29
**状态**: 待实施
**关联**: mydocs/dev/当前开发内容.md #013

## 问题

当前 AI 助手的对话 session 管理存在四个缺陷：

| 问题 | 现状 | 影响 |
|------|------|------|
| 无持久化 | 前端 `useState` 管理 sessions/messages，刷新即丢失 | 用户无法回顾历史对话 |
| 标题硬编码 | 所有新对话标题固定为 `'新对话'` | 列表中无法区分不同对话 |
| 无法删除 | session 列表无删除入口 | 无用对话堆积 |
| 无法继续 | 页面加载时不加载历史 session | 每次都是空白对话 |

数据库层 `ai_sessions` 表和 `AISessionRepository` 已完整实现，但前端完全没有调用。同时 Nexus 内存 session 管理器（`ai-runtime/session/index.ts`）与 DB Repository 互不连通，形成双轨。

Constitution（Principle III Single-Writer Invariant）要求 "All session message writes MUST go through Memory Framework's API"，当前实现未满足此约束。

## 目标

1. 对话过程持久化保存，刷新/重开页面后消息不丢失
2. 对话名称根据意图内容自动生成
3. 允许用户删除对话（软删除 + 保留期）
4. 允许用户继续上次未完成的对话（自动恢复 + 列表置顶）

## 架构决策

**方案：分层桥接（Repository + Memory Framework L1）**

- `ai_sessions` 表（Repository）管 session 元数据：id、title、status、createdAt、updatedAt
- `l1_messages` 表（Memory Framework L1 独占）管消息内容
- 消息写入必须通过 Memory Framework L1 API，满足 Constitution III 约束

## 数据模型

### 新建表：l1_messages

```sql
CREATE TABLE l1_messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id    UUID NOT NULL REFERENCES ai_sessions(id) ON DELETE CASCADE,
  user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role          TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content       TEXT NOT NULL,
  intent_ref    TEXT,
  cnui_surface  JSONB,
  deleted_at    TIMESTAMPTZ,              -- 软删除标记
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_l1_messages_session ON l1_messages(session_id, created_at);
CREATE INDEX idx_l1_messages_user ON l1_messages(user_id);
CREATE INDEX idx_l1_messages_cleanup ON l1_messages(deleted_at, created_at);
```

### 修改：ai_sessions

| 变更 | 说明 |
|------|------|
| 新增 `deleted_at TIMESTAMPTZ` | 软删除时间，与 status='deleted' 同步 |
| `messages` jsonb 列 | 保留但标记 deprecated，后续版本移除 |

### 职责边界

| 存储 | 管什么 | 写权限 |
|------|--------|--------|
| `ai_sessions` | 会话元数据 | `AISessionRepository` |
| `l1_messages` | 对话消息 | Memory Framework L1（独占） |

## Memory Framework L1 API

新增 `nexus/ai-runtime/memory/layers/l1-session.ts`：

```
appendMessage(sessionId, userId, message: ChatMessage) → void
  单条消息追加，INSERT 到 l1_messages。

getMessages(sessionId, userId) → ChatMessage[]
  按 created_at 升序返回某 session 全部未删除消息。
  带 userId 校验实现多租户隔离。

softDeleteMessages(sessionId, userId) → void
  批量设置 session 下所有消息的 deleted_at = now()。

hardDeleteExpired(retentionDays: number) → void
  硬删除过期数据：
  - deleted_at < now() - retentionDays 的软删除消息
  - created_at < now() - retentionDays 的所有消息（含正常消息）
```

### 写入时机

| 事件 | 操作 |
|------|------|
| 用户发送消息 | `L1.appendMessage(userMessage)` |
| AI 返回响应 | `L1.appendMessage(assistantMessage)` |
| CN-UI 交互完成 | `L1.appendMessage(interactionSummary)` |

### 与 ai_sessions 协调

```
前端发送消息:
  1. L1.appendMessage(userMsg)
  2. Intent Engine → Nexus 链
  3. L1.appendMessage(assistantMsg)
  4. Repository.updateTimestamp(sessionId)    // 更新 updatedAt 用于列表排序
```

L1 不管 session 状态，`updatedAt` 由 Repository 维护。

## 标题自动生成

### 时机

1. **首次生成**：L1 累积 2 轮对话（1 轮 = 用户消息 + AI 响应，即 4 条消息）时触发
2. **可能更新**：session 归档时，取对话摘要判断标题是否仍准确，必要时覆盖

### 实现

利用现有 Memory Framework L2 Episode Summarizer（`l2-episode.ts`），在 prompt 中要求同时返回：

- `summary`（对话摘要，已有）
- `suggestedTitle`（不超过 15 个字的简洁标题）

L2 摘要生成后，提取 `suggestedTitle`，通过 `Repository.updateTitle()` 写入 `ai_sessions.title`。

### 降级

L2 不可用或 AI 调用失败时，标题设为带时间戳的默认值 `'M月D日对话'`（如 `'5月29日对话'`），而非 `'新对话'`。

### Session 列表显示

每个 session 项双行显示：
- 主行：标题（15 字内）
- 副行：灰色小字时间戳（格式 `M月D日 HH:mm`）

## 继续上次未完成对话

### 页面加载流程

```
1. fetchSessions(userId) → sessions[]
2. 筛选 status='active'，按 updatedAt 降序取第一条
3. 若存在：
   - setActiveSessionId(session.id)
   - L1.getMessages(session.id, userId) → setMessages
   - mainViewState → { type: 'conversation', sessionId: session.id }
4. 若不存在（首次使用或全部已归档）：
   - 显示空对话状态
```

### 列表行为

- active session 不额外标记（自动恢复已覆盖"继续"需求）
- 归档 session 在列表底部折叠显示，用分隔线区分

## 删除与数据保留

### 软删除

| 操作 | 效果 |
|------|------|
| 用户删除 | session: `status→'deleted'`, `deleted_at=now()`；l1_messages: 对应行 `deleted_at=now()` |
| 60 天内恢复 | session: `status→'active'`, `deleted_at=NULL`；l1_messages: `deleted_at=NULL` |

### 硬删除清理

保留期通过环境变量 `MESSAGE_RETENTION_DAYS` 配置，默认 60 天。

清理条件（一刀切）：
```
DELETE FROM l1_messages WHERE
  deleted_at < now() - interval '60 days'     -- 软删除超期
  OR created_at < now() - interval '60 days';  -- 正常消息超期

DELETE FROM ai_sessions WHERE
  status = 'deleted' AND deleted_at < now() - interval '60 days';
```

### 清理触发

MVP 阶段：惰性触发。每次加载 session 列表时，由 cleanup 函数协调执行：先 `L1.hardDeleteExpired()` 清理消息，再 `Repository.hardDeleteExpired()` 清理 session 元数据。不保证实时精确。

后续可演进为 cron job。

## 前端集成

### 数据流变化

**现状：** page.tsx 纯 `useState` 管理 sessions/messages，零持久化。

**改为：**

```
页面加载
  ├─ fetchSessions(userId) → setSessions
  ├─ findLastActive(sessions) → auto-restore
  │   └─ L1.getMessages(sessionId, userId) → setMessages
  └─ cleanupExpired()

发送消息
  ├─ L1.appendMessage(userMsg)
  ├─ Intent Engine → Nexus chain
  ├─ L1.appendMessage(assistantMsg)
  ├─ Repository.updateTimestamp(sessionId)
  └─ (2轮后) 触发标题生成

删除会话
  ├─ Repository.softDelete(sessionId)
  ├─ L1.softDeleteMessages(sessionId, userId)
  └─ setSessions(prev => prev.filter(...))
```

### 组件改动

| 组件 | 改动 |
|------|------|
| `page.tsx` | 新增 `fetchSessions`、`loadMessages`、auto-restore；去掉纯内存管理 |
| `session-list.tsx` | 双行显示（标题 + 时间戳）；hover 显示删除图标；归档区折叠 |
| `conversation-view.tsx` | 无需大改，消息来源从内存改为加载 |
| 新增 `confirm-delete-dialog.tsx` | shadcn/ui AlertDialog |

### Server Actions

```
fetchSessions(userId) → AISessionSummary[]
loadSessionMessages(sessionId, userId) → ChatMessage[]
```

## 迁移计划

1. 生成迁移文件，创建 `l1_messages` 表 + `ai_sessions` 新增 `deleted_at`
2. 部署期间 `ai_sessions.messages` 保留不删，给回滚留窗口
3. 下个版本移除此列

## 改动文件清单

| 层 | 文件 | 操作 |
|------|------|------|
| DB | `lib/db/schema.ts` | 新增 l1_messages 表定义；ai_sessions 新增 deleted_at |
| DB | 新迁移文件 | 建表 + 改表 |
| Repository | `lib/db/repositories/session.repository.ts` | 新增 softDelete（允许直接软删除，不需先归档）、restore、updateTimestamp；修改现有 delete 约束 |
| Memory L1 | `nexus/ai-runtime/memory/layers/l1-session.ts` | 新建，实现消息 CRUD + 清理 |
| Memory L2 | `nexus/ai-runtime/memory/layers/l2-episode.ts` | 扩展 prompt，返回 suggestedTitle |
| 前端 | `app/page.tsx` | 接入持久化：fetchSessions、loadMessages、auto-restore |
| 前端 | `components/layout/session-list.tsx` | 双行显示、删除按钮、归档折叠 |
| 前端 | `components/layout/conversation-view.tsx` | 微小调整 |
| 前端 | `components/layout/confirm-delete-dialog.tsx` | 新建 |
| Server | `app/actions/session.ts` | 新建 server actions |
| Config | `.env.local` | 新增 `MESSAGE_RETENTION_DAYS` |
