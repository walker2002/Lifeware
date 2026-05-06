# Intent Submission Contract

**Feature**: 001-align-foundation (Timebox 切片)
**Date**: 2026-05-03

## 概述

意图提交是系统唯一的写入入口（Constitution Principle I）。用户通过自然语言或表单输入，系统将其转化为 StructuredIntent 并进入 Nexus 管道。

## 接口定义

### Server Action: `submitIntent`

```typescript
// frontend/src/app/actions/intent.ts

interface IntentSubmissionResult {
  success: boolean
  timebox?: TimeboxSummary      // 创建成功时返回
  actionSurface?: ActionSurface // Action Surface 结果
  errors?: string[]             // 失败时的错误信息
  warnings?: string[]           // Rule Engine 警告
  needsConfirmation?: {         // Rule Engine 要求确认
    message: string
    proposal: StateProposal
  }
}

// 自然语言模式
async function submitIntent(rawInput: string): Promise<IntentSubmissionResult>

// 表单模式
async function submitTemplateIntent(
  fields: { title: string; startTime: string; duration: number }
): Promise<IntentSubmissionResult>
```

### 数据流

```
submitIntent(rawInput)
  │
  ├─ 构造 Intention { rawInput, status: 'captured', inputMode: 'natural_language' }
  │
  ├─ Intent Engine 解析 → StructuredIntent
  │   ├─ AI 模式: chat(rawInput, systemPrompt) → JSON → validate
  │   └─ 失败 fallback: 返回 errors，前端切换到表单模式
  │
  ├─ Orchestrator.execute(structuredIntent, userId)
  │   ├─ Rule Engine.evaluate(intent, snapshot)
  │   │   └─ TimeboxDomain.onValidate(intent, snapshot)
  │   ├─ 通过: 生成 StateProposal
  │   └─ 需确认: 返回 needsConfirmation
  │
  ├─ State Machine.execute(proposal)
  │   ├─ 创建 Timebox { status: 'planned', ... }
  │   └─ 刷新 ContextSnapshot
  │
  ├─ Event Bus.publish(TimeboxCreated)
  │
  ├─ Action Surface Engine.generate(snapshot)
  │   └─ TimeboxDomain.onActionSurfaceRequest(snapshot, signals)
  │
  └─ 返回 IntentSubmissionResult
```

### AI Prompt 规范

```typescript
const TIMEBOX_SYSTEM_PROMPT = `
你是 Lifeware 时间盒意图解析器。将用户的自然语言输入解析为结构化意图。

输出 JSON 格式：
{
  "targetDomain": "timebox",
  "action": "create_timebox",
  "fields": {
    "title": "string",       // 时间盒标题
    "startTime": "ISO 8601", // 开始时间（今天/明天的绝对时间）
    "duration": number       // 持续分钟数
  },
  "confidence": 0-1          // 解析置信度
}

规则：
- "今天" → 当天日期
- "2小时" → 120 分钟
- "上午9点" → 当天 09:00
- 缺少必需字段时 confidence 设低
- 只处理时间盒相关意图，其他意图返回 confidence < 0.5
`
```

### Template-Form 模式

表单直接构造 StructuredIntent，跳过 AI：

```typescript
function parseTemplateForm(fields: {
  title: string
  startTime: string  // datetime-local input 值
  duration: number   // 分钟
}): StructuredIntent {
  return {
    id: generateId(),
    intentionId: '', // 由调用方填充
    targetDomain: 'timebox',
    action: 'create_timebox',
    fields: {
      title: fields.title,
      startTime: new Date(fields.startTime).toISOString(),
      duration: fields.duration,
    },
    confidence: 1.0,
    resolvedBy: 'template_form',
    createdAt: new Date().toISOString(),
  }
}
```

## 错误处理

| 场景 | 处理方式 |
|---|---|
| AI 解析失败 | 返回 errors，前端切换到表单模式 |
| 缺少必需字段 | 返回 errors，列出缺失字段 |
| 规则校验失败 | 返回 warnings + needsConfirmation |
| 时间重叠 | Rule Engine 返回 `confirm`，等待用户确认 |
| Repository 错误 | 抛出异常，Server Action 捕获并返回通用错误 |
