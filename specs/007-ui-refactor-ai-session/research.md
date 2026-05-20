# Research: 界面重构及AI助手会话优化

**Feature**: 007-ui-refactor-ai-session
**Date**: 2026-05-16 (v1), 2026-05-17 (v2 — 新增 R7~R10)

## 1. 快捷方式解析策略

**Decision**: 在 Intent Engine 输入预处理阶段实现两层匹配：先匹配 `/domain:action` 长格式，再匹配 `/action` 短别名。

**Rationale**: 长格式 `/domain:action` 是规范名（无歧义），短别名 `/action` 需要全局唯一性校验。两层匹配确保长格式始终优先，短别名作为便捷补充。匹配在 Intent Engine Phase A 之前完成，匹配成功则跳过 Phase A 以 confidence=1.0 直接进入 Phase B。

**Alternatives considered**:
- 正则统一匹配：虽然可以一次匹配，但无法区分长格式和短别名的优先级
- 在 Registry 层解析：与 Registry 的"被动数据提供者"角色不符

**Key implementation points**:
- 短别名唯一性校验在 Registry 初始化时执行（manifest 加载阶段）
- 冲突时抛出 `ShortcutConflictError`，阻止系统启动
- 匹配函数：`matchShortcut(rawInput: string) → { domainId, action, confidence } | undefined`

## 2. Markdown 解析策略

**Decision**: 参照 `template-parser.ts` 的字段映射模式，为每个支持 `template_markdown` 的 action 定义 Markdown 分区→字段的映射关系。MVP 仅支持单 Domain 单 action 解析。

**Rationale**: 复用现有 template_form 的字段定义（manifest block E 的 `required_fields`），Markdown 解析器将 Markdown 结构的 section/key-value 映射为 `StructuredIntent.fields`。跨 Domain 批处理复杂度过高，延后到 post-MVP。

**Alternatives considered**:
- 纯 AI 解析（无结构化映射）：准确度不可控，无法保证确定性
- 全功能 Markdown 解析器（支持多 Domain）：MVP 不需要，过度设计

## 3. 会话续接状态合并机制

**Decision**: 双层状态合并：(1) 从 `state_snapshot` 加载快照；(2) 从 Repository 读取 `referenced_object_ids` 当前实际状态；(3) 对比差异生成系统消息。

**Rationale**: 快照提供创建/上次继续时的基线，实时查询提供当前真实状态。差异对比让 AI 明确知晓"世界发生了什么变化"。

## 4. LLM 配置加密存储

**Decision**: 使用 Web Crypto API (`SubtleCrypto`) 进行客户端加密。加密后的 API Key 通过 `IUserSettingsRepository.upsert()` 存入 `user_settings.llm_config` JSONB 列。

**Rationale**: 不通过服务端中转 API Key，避免服务端日志泄露。Web Crypto API 是浏览器原生 API，无需额外依赖。

## 5. 主显示区分裂视图状态管理

**Decision**: 使用 `MainViewState` 联合类型管理主显示区状态，`splitWith` 字段控制分裂视图。状态切换遵循"自动保存当前视图再切换"原则。

**Rationale**: 联合类型确保状态互斥（schedule | conversation | action），编译期即可防止非法状态组合。

## 6. 文件上传处理策略

**Decision**: 支持 `.md` / `.txt` / `.csv` / `.xlsx` / `.xls` 五种格式。`.md` 和 `.txt` 直接文本提取，`.csv` 解析为表格，`.xlsx`/`.xls` 使用 SheetJS 解析为结构化数据后注入 AI 上下文。

---

## v2 新增研究 (2026-05-17)

以下研究项对应需求补充 S1（LLM 配置统一）和 S2（成长领域菜单执行链接）。

## 7. LLM 提供商配置从硬编码迁移到 .env

**Decision**: 将 `config.ts` 中的 `PROVIDERS` 常量替换为从环境变量动态构建的配置。新增 Next.js Server Action 暴露非敏感配置（提供商名称、模型列表）给前端。

**Rationale**:
- `config.ts` 当前是客户端代码（`'use client'` 兼容），无法直接读取服务端环境变量
- 需要通过 Server Action 或 API Route 桥接：`.env.local` → 服务端读取 → Server Action → 前端消费
- 用户 API 密钥仍由前端 UI 输入，与 R4 加密存储方案一致

**环境变量结构**:
```bash
LLM_PROVIDERS=dashscope,deepseek,openai,zhipu

LLM_DASHSCOPE_DEFAULT_MODEL=qwen-plus
LLM_DASHSCOPE_THINKING_MODEL=qwen3-235b-a22b
LLM_DASHSCOPE_QUICK_MODEL=qwen-turbo

LLM_DEEPSEEK_DEFAULT_MODEL=deepseek-chat
# ... 每个提供商类似
```

**config.ts 重构要点**:
- 移除 `PROVIDERS` 硬编码对象
- 新增 `buildProviderConfig(providerId: string): ProviderConfig`，从 `process.env` 读取
- 新增 `getAvailableProviderIds(): string[]`，解析 `LLM_PROVIDERS` 逗号列表
- Server Action `getLLMProviders()` 暴露提供商列表和模型名（不含密钥）

**Alternatives considered**:
1. 完全前端配置（JSON 文件）— 无法利用 Next.js 环境变量安全性
2. 数据库存储提供商列表 — 每次启动需要 DB 查询，增加启动依赖

## 8. 动态表单组件映射方案

**Decision**: 创建 `DynamicForm` 组件，根据 manifest `FieldPrompt[]` 动态渲染 shadcn/ui 表单控件。

**Rationale**:
- Manifest schema 已定义 8 种字段类型，映射关系稳定
- shadcn/ui 提供了对应的组件，映射表是固定的 UI 框架知识（非 manifest 内容硬编码）
- 组件映射表属于 Presentation Layer 内部实现，不违反 Manifest Runtime Consumption 约束

**字段类型到 UI 组件映射**:

| FieldPrompt.type | shadcn/ui 组件 | 备注 |
|---|---|---|
| text | Input | 默认类型 |
| textarea | Textarea | 多行文本 |
| number | Input[type=number] | 数字输入 |
| date | Popover + Calendar | 日期选择 |
| time | Input[type=time] | 时间选择 |
| select | Select | FieldPrompt.options 提供选项 |
| multiselect | MultiSelect | 多选，FieldPrompt.options |
| toggle | Switch | 开关 |

**Alternatives considered**:
1. React JSON Schema Form (RJSF) — 过重，引入新依赖，与 shadcn/ui 样式冲突
2. 自定义 schema 编译器 — 过度工程化

## 9. 动态表单到 StructuredIntent 的映射

**Decision**: 泛化现有 `parseTemplateForm()` 为 `parseDynamicForm()`，接受 `FieldPrompt[]` 和用户输入值，输出 StructuredIntent。

**Rationale**:
- 现有 `parseTemplateForm()` 硬编码了 title/startTime/duration
- StructuredIntent.fields 是 `Record<string, unknown>`，天然支持动态字段
- confidence=1.0, resolvedBy='template_form' 保持不变
- 复用现有 `executePipeline()` 管道

**数据流**:
```
DynamicForm 提交 → { [fieldName]: value }
→ parseDynamicForm(domainId, action, fields, intentionId)
→ StructuredIntent { targetDomain, action, fields, confidence: 1.0, resolvedBy: 'template_form' }
→ executePipeline(structuredIntent)
→ Orchestrator → onValidate → State Machine
```

## 10. 非创建类 Action 确认界面

**Decision**: 创建 `ActionConfirm` 组件，展示目标对象摘要 + 确认/取消按钮。提交时构造状态变更 StructuredIntent（fields 包含目标对象 ID）。

**Rationale**:
- 非创建类 action 不需要填写表单，但需要用户确认
- 用户需看到操作对象的信息以避免误操作
- 提交仍走 StructuredIntent 路径，保持架构一致性

**组件数据来源**:
- 对象摘要：通过 Repository 读取目标对象当前状态
- 操作说明：从 manifest `intent_triggers` 读取 action 的 description

**Alternatives considered**:
1. window.confirm() — 不符合应用 UI 风格
2. 每个 action 独立实现确认组件 — 违反 DRY
