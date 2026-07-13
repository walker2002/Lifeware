# Lifeware 代码注释规范

## 1. 规范概述

本规范旨在提高代码的可读性、可维护性和团队协作效率。所有注释必须使用 **简体中文**，遵循项目现有风格。

---

## 2. 文件头部注释

每个 TypeScript/JavaScript 文件开头必须包含文件说明注释：

```typescript
/**
 * @file 文件名（不含扩展名）
 * @brief 文件功能概述
 * @author 作者（可选）
 * @date 创建日期（可选）
 * @see 关联文档/文件（可选）
 */

// 示例：
/**
 * @file intent-engine
 * @brief 意图引擎核心模块，负责解析用户输入为结构化意图
 * @see docs/usom-design.md Section 4.2
 */
```

### 2.1 Codegen 生成的文件（[page-thin] 2026-07-13 约定）

**所有由 `scripts/generate-routes.ts` 自动生成的文件（典型：`app/<route>/page.tsx`）同样需要文件头注释**。这是 CLAUDE.md「每个 TS/JS 文件必须有 `@file/@brief` 头」要求的硬约束（commit `e235be6` requesting-code-review 修复后强制执行）。

`scripts/generate-routes.ts` 的 `AUTO_GENERATED_HEADER` 模板自动发射 JSDoc 头 + ASCII 横幅（`generateRouteFileContent` 内的 `replaceAll` 占位符填充）：

```typescript
// 模板（scripts/generate-routes.ts:93-106）
const AUTO_GENERATED_HEADER = `/**
 * @file app/{url-path}/page
 * @brief 自动生成 thin wrapper — 由 scripts/generate-routes.ts 从 domains/{domain}/manifest.yaml 派生。
 *
 * 渲染 {component-name}。勿手动编辑（修改会被下一次 \`npm run generate:routes\` 覆盖）。
 * 如需调整，编辑对应域的 manifest.yaml view_routes 或 domain 入口组件。
 */
// ---
// Auto-generated from domains/{domain}/manifest.yaml
// DO NOT EDIT MANUALLY
// Generated at: {timestamp}
// ---

`
```

`@file` 用 `app/<url-path>/page` 格式（无 `app/` 前导斜杠）；`@brief` 显式标注「自动生成」身份 + 警告「勿手动编辑」。占位符填充用 `String.replaceAll`（不带 `/g` 标志的 `replace` 仅替换首匹配，会导致 banner 残留字面值 — 见 commit `e235be6` 修复的 TS2440 collision guard 同源问题）。

**新增/修改 codegen 模板时**：确保 `AUTO_GENERATED_HEADER` 始终包含 JSDoc `@file` + `@brief` 块，并测试生成输出含这两个标签（`generate-routes.test.ts` 现有 case 应扩到 JSDoc 头断言）。

---

## 3. 模块分隔注释

使用统一的分隔线样式划分文件内的逻辑模块：

```typescript
// ─── 模块名称 ───────────────────────────────────────────────────

// 示例：
// ─── 类型定义 ───────────────────────────────────────────────────
interface IntentResult {
  success: boolean;
}

// ─── 辅助函数 ───────────────────────────────────────────────────
function formatResult(result: IntentResult): string {
  // ...
}

// ─── 导出函数 ───────────────────────────────────────────────────
export function parseIntent(input: string): IntentResult {
  // ...
}
```

---

## 4. 接口与类型注释

### 4.1 接口注释

```typescript
/**
 * 意图提交结果
 * 
 * @property success - 提交是否成功
 * @property timeboxes - 最新的时间盒列表（供前端刷新）
 * @property actionSurface - 动作面（Action Surface Engine 生成）
 * @property error - 错误信息
 * @property warnings - 规则引擎的警告
 * @property needsConfirmation - 是否需要用户确认
 * @property confirmationMessage - 确认提示消息
 * @property traceSession - 追踪会话（仅当 TraceConfig.enabled 时）
 */
export interface IntentSubmissionResult {
  success: boolean;
  timeboxes: TimeboxSummary[];
  actionSurface?: ActionSurface;
  error?: string;
  warnings?: string[];
  needsConfirmation?: boolean;
  confirmationMessage?: string;
  traceSession?: TraceSession;
}
```

### 4.2 类型别名注释

```typescript
/**
 * 输入模式类型：AI 对话或表单填写
 */
type InputMode = "ai" | "form";

/**
 * 主视图类型：日程、习惯、模板、OKR
 */
type MainView = "schedule" | "habits" | "templates" | "okrs";
```

---

## 5. 函数与方法注释

### 5.1 普通函数

```typescript
/**
 * 根据视图模式计算日期范围
 * 
 * @param mode - 日期视图模式（日/周/月）
 * @param date - 基准日期
 * @returns 包含开始和结束日期的对象
 */
function getDateRange(mode: DateViewMode, date: Date): { start: Date; end: Date } {
  // ...
}
```

### 5.2 异步函数

```typescript
/**
 * 提交自然语言意图
 * 
 * @param rawInput - 用户原始输入文本
 * @param confirmed - 是否已确认（用于二次确认场景）
 * @param traceEnabled - 是否启用追踪日志
 * @returns 意图提交结果
 * @throws {Error} 当网络或解析失败时
 */
export async function submitIntent(
  rawInput: string,
  confirmed?: boolean,
  traceEnabled?: boolean,
): Promise<IntentSubmissionResult> {
  // ...
}
```

### 5.3 Hook 函数

```typescript
/**
 * 自动触发时间盒状态转换的 Hook
 * 
 * @param timeboxes - 当前时间盒列表
 * @param onTransition - 状态转换回调函数
 * @returns void
 */
export function useAutoTrigger({
  timeboxes,
  onTransition,
}: {
  timeboxes: TimeboxSummary[];
  onTransition: (id: string, action: string) => Promise<void>;
}): void {
  // ...
}
```

---

## 6. React 组件注释

### 6.1 组件注释

```typescript
/**
 * 意图输入组件（AI 对话模式）
 * 
 * @param onSubmit - 提交回调，接收用户输入文本
 * @param isLoading - 是否正在加载
 * @param error - 错误信息
 */
export function IntentInput({
  onSubmit,
  isLoading,
  error,
}: {
  onSubmit: (input: string, confirmed?: boolean) => void;
  isLoading: boolean;
  error?: string;
}) {
  // ...
}
```

### 6.2 Props 类型注释

```typescript
/**
 * AppShell 组件属性
 */
interface AppShellProps {
  /** 顶部导航内容 */
  topNav?: React.ReactNode;
  /** AI 面板内容 */
  aiPanel?: React.ReactNode;
  /** 主内容区 */
  mainContent: React.ReactNode;
  /** 追踪面板 */
  tracePanel?: React.ReactNode;
  /** 设置按钮点击事件 */
  onSettingsClick?: () => void;
}
```

---

## 7. 行内注释

### 7.1 必要时使用

```typescript
// 检测执行意图关键词
const isExecutionIntent = (input: string): boolean => {
  return /^(开始|结束|取消|记录|复盘|启动|完成|停止)/.test(input.trim());
};

// 计算时间差（毫秒转分钟）
const duration = Math.floor((endTime - startTime) / 60000);
```

### 7.2 避免冗余注释

**错误示例**（明显的代码不需要注释）：
```typescript
// 设置加载状态为 true
setIsLoading(true);  // ❌ 冗余
```

**正确示例**：
```typescript
setIsLoading(true);  // ✅ 无需注释
```

---

## 8. 特殊注释标记

### 8.1 TODO

标记待完成的任务：

```typescript
// TODO: 后续需要支持多用户会话
const userId = MVP_USER_ID;

// TODO: 优化性能 - 考虑使用 memo 缓存计算结果
function computeScore(items: Item[]): number {
  // ...
}
```

### 8.2 FIXME

标记已知的 bug 或问题：

```typescript
// FIXME: 边界条件处理不完善，当时间盒数量为 0 时可能报错
function getNextTimebox(timeboxes: Timebox[]): Timebox | undefined {
  // ...
}
```

### 8.3 NOTE

提供重要说明或注意事项：

```typescript
// NOTE: 此函数返回的时间戳为 UTC 格式，调用方需注意时区转换
function getTimestamp(): number {
  return Date.now();
}
```

### 8.4 HACK

标记临时解决方案或不太优雅的实现：

```typescript
// HACK: 临时使用 MVP 用户 ID，待认证模块完善后移除
const MVP_USER_ID = "00000000-0000-0000-0000-000000000001";
```

---

## 9. 注释风格统一规则

### 9.1 格式要求

- 使用 `//` 进行单行注释
- 使用 `/** */` 进行多行文档注释
- 注释与代码之间至少空一行（模块分隔注释除外）
- 注释结尾不需要标点符号

### 9.2 语言规范

- **必须使用简体中文**
- 语言简洁明了，避免冗长
- 使用专业术语保持一致性

### 9.3 注释更新

- 代码修改时，相关注释必须同步更新
- 删除无用代码时，相关注释也应删除
- 确保注释与代码逻辑一致

---

## 10. 注释覆盖率建议

| 文件类型 | 建议注释覆盖率 | 说明 |
|----------|----------------|------|
| USOM 类型定义 | 100% | 核心数据结构必须完整注释 |
| Nexus 引擎模块 | 80%+ | 复杂业务逻辑需要详细注释 |
| Domain 插件 | 70%+ | 领域规则和事件处理需要注释 |
| UI 组件 | 60%+ | Props 和关键逻辑需要注释 |
| 测试文件 | 40%+ | 测试场景和断言需要注释 |

---

## 附录：项目现有注释模式参考

项目中已使用的优秀注释示例：

```typescript
// 来源：src/usom/types/objects.ts
// ─── 3.4 StructuredIntent ──────────────────────────────────────
export interface StructuredIntent {
  id: USOM_ID
  intentionId: USOM_ID
  targetDomain: string
  action: string
  fields: Record<string, unknown>
  confidence: number
  resolvedBy: 'ai' | 'template_form'
  pathType?: 'contract' | 'generative' | 'query'
  createdAt: Timestamp
}

// 来源：src/app/actions/intent.ts
/** 创建并执行 Orchestrator 管道（提取公共逻辑） */
async function executePipeline(
  rawInput: string,
  intentSupplier: () => Promise<{ success: boolean; intent?: any; error?: string }>,
  confirmed?: boolean,
  traceEnabled?: boolean,
): Promise<IntentSubmissionResult> {
  // ...
}
```

---

**实施说明**：本规范适用于 Lifeware 项目的所有 TypeScript/JavaScript 文件。团队成员在编写代码时应严格遵守此规范，确保代码的可维护性和协作效率。