# Data Model: AI Runtime 架构升级

**Branch**: `009-ai-runtime-upgrade` | **Date**: 2026-05-23

## 实体定义

### 1. AIRuntime（运行时对象，无持久化）

AIRuntime 是统一 AI 调用入口的根对象，持有所有子模块实例。

| 属性 | 类型 | 说明 |
|------|------|------|
| gateway | LLMGateway | Provider 路由和调用 |
| budget | TokenBudgetManager | Token 使用量追踪 |
| cache | ResponseCache | L1 精确匹配缓存 |
| sessions | AISessionManager | Session 生命周期管理 |

### 2. LLMGateway（运行时对象）

根据 taskType 将请求路由到对应 Provider。

| 属性 | 类型 | 说明 |
|------|------|------|
| routing | Record<AITaskType, ProviderRoute> | 任务类型到 Provider 的映射 |
| providers | Map<string, ProviderAdapter> | 已注册的 Provider 适配器 |

**方法**:
- `route(taskType: AITaskType): ProviderRoute` — 返回对应 Provider 配置
- `call(providerName: string, request: LLMRequest): Promise<LLMResponse>` — 调用指定 Provider

### 3. AITaskType（枚举）

| 值 | 说明 |
|----|------|
| intent_routing | Intent Engine Phase A 路由 |
| field_extraction | Intent Engine Phase B 字段提取 |
| content_generation | Handler 内容生成 |
| summary | Session 归档摘要 |
| cn_ui_revision | CN-UI 多轮修订 |

### 4. AIGenerateRequest

| 属性 | 类型 | 必填 | 说明 |
|------|------|------|------|
| domainId | DomainId | 是 | 发起调用的 Domain |
| action | string | 是 | 具体动作名称 |
| sessionId | USOM_ID | 否 | 关联的 Session ID |
| systemPrompt | string | 是 | 系统提示词 |
| messages | ChatMessage[] | 是 | 对话消息列表 |
| taskType | AITaskType | 是 | 任务类型，决定路由 |
| maxTokens | number | 否 | 最大生成 token 数 |
| temperature | number | 否 | 温度参数 |
| structuredOutput | ZodSchema | 否 | 结构化输出 Schema |
| stream | boolean | 否 | 是否流式（默认 false） |

### 5. AIGenerateResponse

| 属性 | 类型 | 说明 |
|------|------|------|
| content | string \| Record<string, unknown> | 生成内容 |
| tokenUsage | TokenUsage | Token 使用量 |
| model | string | 实际使用的模型 |
| cached | boolean | 是否命中缓存 |
| sessionId | USOM_ID | 关联的 Session ID |

### 6. TokenUsage

| 属性 | 类型 | 说明 |
|------|------|------|
| promptTokens | number | 输入 token 数 |
| completionTokens | number | 输出 token 数 |
| totalTokens | number | 总 token 数 |

### 7. TokenBudgetRecord（运行时对象，可选持久化）

| 属性 | 类型 | 说明 |
|------|------|------|
| taskType | AITaskType | 任务类型 |
| model | string | 使用模型 |
| usage | TokenUsage | 使用量 |
| timestamp | Timestamp | 记录时间 |
| domainId | DomainId | 来源 Domain |
| action | string | 具体动作 |

### 8. ResponseCache（运行时对象，内存 Map）

| 属性 | 类型 | 说明 |
|------|------|------|
| key | string | hash(systemPrompt + messages + taskType) |
| value | AIGenerateResponse | 缓存的响应 |
| expiresAt | Timestamp | 过期时间 |

### 9. AI Session（持久化，扩展 ai_sessions 表）

现有 `ai_sessions` 表扩展：

| 属性 | 类型 | 现有/新增 | 说明 |
|------|------|----------|------|
| id | uuid | 现有 | 主键 |
| userId | uuid | 现有 | 用户 ID |
| title | text | 现有 | 对话标题 |
| status | enum | **扩展** | 新增 created/completing/closed |
| messages | jsonb | 现有 | 消息列表 |
| stateSnapshot | jsonb | 现有 | 状态快照 |
| referencedObjectIds | jsonb | 现有 | 关联对象 |
| domainId | text | **新增** | 关联 Domain |
| action | text | **新增** | 关联动作 |
| sessionMode | enum | **新增** | single_shot / conversational |
| createdAt | timestamptz | 现有 | 创建时间 |
| updatedAt | timestamptz | 现有 | 更新时间 |
| archivedAt | timestamptz | 现有 | 归档时间 |

**Session 状态机**:
```
created → active → completing → archived
                  ↘ closed
```

### 10. SessionMode（枚举）

| 值 | 说明 |
|----|------|
| single_shot | 单次交互，无上下文保持 |
| conversational | 多轮对话，保持上下文 |

### 11. CnuiSurface（运行时对象，内存 Map）

| 属性 | 类型 | 说明 |
|------|------|------|
| cnuiSurfaceId | string | Surface 唯一 ID |
| cnuiSurfaceType | CnuiComponentType | 组件类型 |
| sessionId | string | 关联 Session |
| dataModel | Record<string, unknown> | 数据模型 |
| status | CnuiSurfaceStatus | Surface 状态 |

### 12. CnuiSurfaceStatus（枚举）

| 值 | 说明 |
|----|------|
| rendering | 渲染中 |
| interacting | 用户交互中 |
| completed | 已完成 |
| closed | 已关闭 |

### 13. CnuiComponentType（联合类型）

**基础组件**: text-input | textarea | select | time-picker | date-picker | slider | toggle | button | text | divider

**域组件**: habit-creation-card | timebox-list | okr-board-card | task-card | energy-curve | event-timeline

### 14. CnuiEvent

| 属性 | 类型 | 说明 |
|------|------|------|
| type | 'input_change' \| 'button_click' | 事件类型 |
| cnuiSurfaceId | string | 来源 Surface |
| data | Record<string, unknown> | 事件数据 |
| action | string | 按钮 action（confirm/cancel/modify） |

### 15. MemoryEpisode（持久化，新表 memory_episodes）

| 属性 | 类型 | 说明 |
|------|------|------|
| id | uuid | 主键 |
| userId | uuid | 用户 ID (FK → users) |
| sessionId | uuid | 来源 Session (FK → ai_sessions) |
| domainId | text | 关联 Domain |
| action | text | 关联动作 |
| episodeType | text | 摘要类型（默认 ai_session_summary） |
| summary | text | LLM 生成的一句话摘要 |
| metadata | jsonb | 结构化数据 (proposalCount, reviseCount, finalAccepted 等) |
| createdAt | timestamptz | 创建时间 |

### 16. GenerationRequest（扩展）

在现有 GenerationRequest 基础上新增：

| 属性 | 类型 | 说明 |
|------|------|------|
| sessionId | USOM_ID | 关联 Session |
| sessionHistory | ChatMessage[] | Session 历史消息 |
| reviseTarget | ReviseTarget | 修订目标（多轮修订时） |
| previousProposals | ProposalSet[] | 之前的提案（多轮修订时） |

### 17. CnuiSurfaceMessage（扩展 ChatMessage）

| 属性 | 类型 | 说明 |
|------|------|------|
| role | 'assistant' | 助手消息 |
| type | 'cnui_surface' | CN-UI 消息标记 |
| cnuiSurfaceId | string | 关联 Surface |
| cnuiSurfaceType | string | Surface 类型 |
| action | 'created' \| 'updated' \| 'completed' \| 'cancelled' | 动作 |
| dataSnapshot | Record<string, unknown> | 数据快照 |

## 实体关系

```
AIRuntime ── owns ──→ LLMGateway
          ── owns ──→ TokenBudgetManager
          ── owns ──→ ResponseCache
          ── owns ──→ AISessionManager

AISessionManager ── manages ──→ AI Session
               ── uses ──→ MemoryL1Session
               ── uses ──→ MemoryL2Episode

AI Session ── has many ──→ ChatMessage
           ── referenced by ──→ MemoryEpisode
           ── associated with ──→ CnuiSurface

CnuiSurface ── belongs to ──→ AI Session
            ── receives ──→ CnuiEvent
            ── typed by ──→ CnuiComponentType (via Catalog)

LLMGateway ── routes via ──→ AITaskType
           ── dispatches to ──→ ProviderAdapter
```

## 数据库变更

### 新增表: memory_episodes

```sql
CREATE TABLE memory_episodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id uuid REFERENCES ai_sessions(id) ON DELETE SET NULL,
  domain_id text NOT NULL,
  action text NOT NULL,
  episode_type text NOT NULL DEFAULT 'ai_session_summary',
  summary text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_memory_episodes_user ON memory_episodes(user_id, created_at);
CREATE INDEX idx_memory_episodes_session ON memory_episodes(session_id);
```

### 扩展表: ai_sessions

```sql
-- 新增列
ALTER TABLE ai_sessions ADD COLUMN domain_id text;
ALTER TABLE ai_sessions ADD COLUMN action text;
ALTER TABLE ai_sessions ADD COLUMN session_mode text NOT NULL DEFAULT 'single_shot';

-- 扩展 status enum（需根据 Drizzle 的 enum 管理方式调整）
```

### Drizzle Schema 变更

在 `frontend/src/lib/db/schema.ts` 中新增 `memoryEpisodes` 表定义，扩展 `aiSessions` 表定义。
