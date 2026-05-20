# Data Model: 界面重构及AI助手会话优化

**Feature**: 007-ui-refactor-ai-session  
**Date**: 2026-05-16

## Entity Overview

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   UserSettings  │     │    AISession     │     │  DomainManifest │
│   (新增表)       │     │    (新增表)       │     │  (扩展现有)      │
├─────────────────┤     ├──────────────────┤     ├─────────────────┤
│ id              │     │ id               │     │ + shortcut      │
│ user_id ────────┼─────┼ user_id          │     │ + view_routes   │
│ timezone        │     │ title            │     │ + templates.    │
│ llm_config(JSONB)│    │ status           │     │   markdown      │
│ ui_prefs(JSONB) │     │ messages(JSONB)  │     │                 │
└─────────────────┘     │ state_snapshot   │     └─────────────────┘
                        │   (JSONB)        │
                        │ referenced_object│
                        │   _ids(JSONB)    │
                        │ created_at       │
                        │ updated_at       │
                        │ archived_at      │
                        └──────────────────┘
```

## 1. AISession (新增 USOM 对象 + DB 表)

### USOM 定义

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | USOM_ID | PK, NOT NULL | 会话唯一标识 |
| userId | string | NOT NULL, FK→users | 多租户隔离 |
| title | string | NOT NULL, DEFAULT '新对话' | 首条消息自动生成 |
| status | AISessionStatus | NOT NULL, DEFAULT 'active' | `active` → `archived` → `deleted` |
| messages | ChatMessage[] | NOT NULL, JSONB, DEFAULT '[]' | 嵌入式文档（JSONB 许可） |
| stateSnapshot | Record<string, unknown> | NOT NULL, JSONB, DEFAULT '{}' | 关联对象的状态快照（JSONB 许可） |
| referencedObjectIds | USOM_ID[] | NOT NULL, JSONB, DEFAULT '[]' | 会话引用的对象 ID 列表 |
| createdAt | Timestamp | NOT NULL | 创建时间 |
| updatedAt | Timestamp | NOT NULL | 最后更新时间 |
| archivedAt | Timestamp | nullable | 归档时间 |

### ChatMessage 嵌套类型

| 字段 | 类型 | 说明 |
|---|---|---|
| role | 'user' \| 'assistant' \| 'system' | 消息角色 |
| content | string | 消息内容 |
| timestamp | Timestamp | 消息时间戳 |
| intentRef? | string | 关联的 StructuredIntent ID（可选） |

### 生命周期

```
创建 → active ──归档→ archived ──删除→ deleted (不可逆)
        ↑                    │
        └──── 恢复 ──────────┘
```

- **创建**: 用户点击"新对话"，创建 sessionId，status=active
- **归档**: 用户归档，设置 archivedAt，status=archived，从活动列表移除
- **恢复**: 从 archived 恢复为 active（清除 archivedAt）
- **删除**: 从 archived 彻底删除（不可逆），清除全部消息数据

### 数据库 Schema

```sql
CREATE TABLE ai_sessions (
  id                    TEXT PRIMARY KEY,
  user_id               TEXT NOT NULL REFERENCES users(id),
  title                 TEXT NOT NULL DEFAULT '新对话',
  status                TEXT NOT NULL DEFAULT 'active',
  messages              JSONB NOT NULL DEFAULT '[]',
  state_snapshot        JSONB NOT NULL DEFAULT '{}',
  referenced_object_ids JSONB NOT NULL DEFAULT '[]',
  created_at            TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMP NOT NULL DEFAULT NOW(),
  archived_at           TIMESTAMP
);

CREATE INDEX idx_ai_sessions_user_status ON ai_sessions(user_id, status);
CREATE INDEX idx_ai_sessions_updated ON ai_sessions(updated_at DESC);
```

### JSONB 合规

| 字段 | JSONB 类别 | 合规依据 |
|---|---|---|
| messages | 嵌入式文档 | ChatMessage[] 是可变长度的内嵌实体列表 |
| state_snapshot | 快照/配置 | 键值对形式的状态快照，非查询目标 |
| referenced_object_ids | 引用列表 | USOM_ID[] 是关联引用，非外键约束 |

## 2. UserSettings (新增 USOM 对象 + DB 表)

### USOM 定义

| 字段 | 类型 | 约束 | 说明 |
|---|---|---|---|
| id | USOM_ID | PK, NOT NULL | 设置唯一标识 |
| userId | string | NOT NULL, UNIQUE, FK→users | 每个用户一条记录 |
| timezone | string | NOT NULL, DEFAULT 'Asia/Shanghai' | IANA 时区标识 |
| llmConfig | LLMConfig | nullable, JSONB | LLM 配置（JSONB 许可） |
| uiPrefs | Record<string, unknown> | nullable, JSONB | UI 偏好（分割线位置等） |

### LLMConfig 嵌套类型

| 字段 | 类型 | 说明 |
|---|---|---|
| provider | string | 从 `.env` 可用提供商列表中选择 |
| baseUrl | string | 覆盖默认端点地址（可选，默认从 `.env` 读取） |
| apiKey | string | 用户 API 密钥，加密存储（Web Crypto API） |
| defaultModel | string | 默认模型（从 `.env` 提供商配置中选择） |

**配置来源关系（S1）**:
- `.env.local` 定义系统级配置：可用提供商列表、每个提供商的模型映射、默认 baseURL
- 用户级配置（API 密钥、选定提供商/模型）存储在 `user_settings.llm_config`
- 前端通过 Server Action 读取 `.env` 中的提供商列表，用户在 UI 中选择并输入密钥

### 数据库 Schema

```sql
CREATE TABLE user_settings (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL UNIQUE REFERENCES users(id),
  timezone    TEXT NOT NULL DEFAULT 'Asia/Shanghai',
  llm_config  JSONB,
  ui_prefs    JSONB,
  created_at  TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMP NOT NULL DEFAULT NOW()
);
```

### JSONB 合规

| 字段 | JSONB 类别 | 合规依据 |
|---|---|---|
| llm_config | 配置/元数据 | 可变结构的配置对象，非查询目标 |
| ui_prefs | 配置/元数据 | 键值对形式的用户偏好 |

## 3. DomainManifest (扩展现有)

### 新增字段

#### intent_triggers 条目扩展

```yaml
intent_triggers:
  - action: createHabit
    shortcut: /createHabit          # 新增
    description: 创建新习惯
    # ... 现有字段不变
```

#### view_routes 块（新增 G 块）

```yaml
view_routes:
  createHabit:
    component: domains/habits/pages/HabitFormPage
    params:
      mode: create
```

#### templates.markdown 块（新增）

```yaml
templates:
  markdown:
    createHabit:
      template_file: "markdown_templates/create_habit.md"
      description: "批量创建习惯时使用的 Markdown 模板"
      output_action: "createHabit"
      max_objects: 1
```

### 约束

- `shortcut` 在全局范围内唯一，Registry 初始化时校验
- `view_routes` 的 `component` 指向实际存在的页面组件
- `templates.markdown` 的 `template_file` 指向实际存在的模板文件

## 5. 动态表单数据流 (S2 — 非 DB 实体)

动态表单不引入新的持久化实体，而是基于 manifest `required_fields` 运行时生成。

### 表单数据流

```
manifest.yaml (required_fields)
  → Registry.getRequiredFields(domainId, action) → FieldPrompt[]
  → DynamicForm 组件渲染
  → 用户填写 → { [fieldName]: value }
  → parseDynamicForm(domainId, action, fields, intentionId)
  → StructuredIntent { fields: Record<string, unknown> }
  → executePipeline → Orchestrator → onValidate → State Machine
```

### FieldPrompt 到 StructuredIntent.fields 映射

| FieldPrompt 属性 | StructuredIntent.fields 映射 |
|---|---|
| name | key 名 |
| type | 值类型转换（text→string, number→number, time→string ISO 等） |
| required | 校验规则，缺失时阻止提交 |
| options | 限制取值范围 |
| default_value | 表单初始值 |

### 非创建类 Action 确认界面数据流

```
manifest.yaml (intent_triggers[action].description)
  → 显示操作说明
  → Repository.findById(targetObjectId) → USOM 对象摘要
  → ActionConfirm 展示摘要 + 确认/取消
  → 确认 → parseDynamicForm(domainId, action, { targetId }, intentionId)
  → StructuredIntent → executePipeline
```

## 4. Repository 接口

### ISessionRepository

| 方法 | 签名 | 说明 |
|---|---|---|
| findById | (id: USOM_ID) → AISession \| null | 按 ID 查询 |
| findByUserId | (userId: string) → AISessionSummary[] | 按用户查询摘要列表 |
| create | (session: AISession) → void | 创建会话 |
| updateMessages | (id: USOM_ID, messages: ChatMessage[]) → void | 更新消息列表 |
| updateStateSnapshot | (id: USOM_ID, snapshot: object, refIds: USOM_ID[]) → void | 更新快照和引用 |
| archive | (id: USOM_ID) → void | 归档（设置 archivedAt，status=archived） |
| restore | (id: USOM_ID) → void | 恢复为 active |
| delete | (id: USOM_ID) → void | 彻底删除（仅 archived 状态可删除） |

### IUserSettingsRepository

| 方法 | 签名 | 说明 |
|---|---|---|
| findByUserId | (userId: string) → UserSettings \| null | 按用户查询 |
| upsert | (settings: UserSettings) → void | 创建或更新 |

## 6. Registry 新增方法 (S2)

| 方法 | 签名 | 说明 |
|---|---|---|
| getRequiredFields | (domainId: string, action: string) → FieldPrompt[] | 从 manifest 运行时读取表单字段定义 |
| getActionDescription | (domainId: string, action: string) → string | 读取 action 的描述文本（确认界面使用） |
| hasRequiredFields | (domainId: string, action: string) → boolean | 判断 action 是否有表单定义（区分表单/确认界面） |
| getAvailableProviders | () → ProviderSummary[] | 返回 .env 中配置的提供商列表（不含密钥） |

### ProviderSummary 类型

| 字段 | 类型 | 说明 |
|---|---|---|
| id | string | 提供商标识（dashscope/deepseek/openai/zhipu） |
| name | string | 显示名称 |
| models | { default: string, thinking: string, quick: string } | 可用模型列表 |
