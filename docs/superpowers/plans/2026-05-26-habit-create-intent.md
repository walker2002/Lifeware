# 习惯创建意图优化 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 统一习惯创建的两个入口（成长领域 + AI 助手）到 HabitListPage 内嵌面板，修复 AI 时间解析错误，调整默认值。

**Architecture:** 移除不存在的 HabitFormPage 路由声明，在 VIEW_PAGE_COMPONENTS 中注册 createHabit → HabitListPage。新增仅解析的 Server Action 供 AI 助手路径使用（解析后不执行，而是将字段传回前端填入表单）。

**Tech Stack:** Next.js Server Actions, React state, Vitest 单元测试

---

## File Structure

| File | Action | Responsibility |
|------|--------|---------------|
| `frontend/src/domains/habits/manifest.yaml` | Modify | 移除 createHabit 的 view_routes 声明 |
| `frontend/src/domains/habits/habit-defaults.ts` | Modify | minDuration = defaultDuration |
| `frontend/src/domains/habits/components/habit-form.tsx` | Modify | autoComplete 中 minDuration 改为 defaultDuration |
| `frontend/src/domains/habits/components/habit-list.tsx` | Modify | 支持接收并传递 initialFields |
| `frontend/src/domains/habits/pages/HabitListPage.tsx` | Modify | 新增 props (autoOpenCreate, initialFields) |
| `frontend/src/nexus/core/intent-engine/ai-parser.ts` | Modify | 优化 HABIT_SYSTEM_PROMPT |
| `frontend/src/app/actions/intent.ts` | Modify | 新增 parseHabitIntent Server Action |
| `frontend/src/app/page.tsx` | Modify | 注册路由 + AI 路径跳转 + view 渲染传 props |
| `frontend/src/components/layout/main-view-state.ts` | Modify | MainViewState view 类型增加 initialFields |
| `frontend/src/nexus/core/intent-engine/__tests__/habit-defaults.test.ts` | Modify | 更新 minDuration 预期值 |

---

### Task 1: 修改 minDuration 默认值逻辑

**Files:**
- Modify: `frontend/src/domains/habits/habit-defaults.ts:35`
- Modify: `frontend/src/domains/habits/components/habit-form.tsx:60`
- Test: `frontend/src/nexus/core/intent-engine/__tests__/habit-defaults.test.ts`

- [ ] **Step 1: 更新测试预期值**

修改 `frontend/src/nexus/core/intent-engine/__tests__/habit-defaults.test.ts`：

```typescript
// 测试 "根据 defaultTime 和 defaultDuration 计算时间窗口"（第 7 行）
// 改 expect(result.minDuration).toBe(15) 为：
    expect(result.minDuration).toBe(30)

// 测试 "defaultDuration=60 → minDuration=30"（第 13 行）
// 改 expect(result.minDuration).toBe(30) 为：
    expect(result.minDuration).toBe(60)

// 测试 "defaultDuration=15 → minDuration=5 (最低 5 分钟)"（第 19 行）
// 改 expect(result.minDuration).toBe(5) 为：
    expect(result.minDuration).toBe(15)
```

- [ ] **Step 2: 运行测试确认失败**

Run: `cd /home/walker/lifeware/frontend && npx vitest run src/nexus/core/intent-engine/__tests__/habit-defaults.test.ts`
Expected: FAIL — minDuration 预期值不匹配

- [ ] **Step 3: 修改 habit-defaults.ts**

修改 `frontend/src/domains/habits/habit-defaults.ts` 第 35 行：

```typescript
// 改前：
  const minDur = Math.max(5, Math.floor((defaultDuration * 0.5) / 5) * 5)
// 改后：
  const minDur = defaultDuration
```

- [ ] **Step 4: 修改 habit-form.tsx autoComplete 函数**

修改 `frontend/src/domains/habits/components/habit-form.tsx` 第 59-60 行：

```typescript
// 改前：
  // minDuration = floor(defaultDuration * 0.5 / 5) * 5
  const minDur = Math.max(5, Math.floor((defaultDuration * 0.5) / 5) * 5)
// 改后：
  const minDur = defaultDuration
```

- [ ] **Step 5: 运行测试确认通过**

Run: `cd /home/walker/lifeware/frontend && npx vitest run src/nexus/core/intent-engine/__tests__/habit-defaults.test.ts`
Expected: PASS

- [ ] **Step 6: 提交**

```bash
cd /home/walker/lifeware/frontend
git add src/domains/habits/habit-defaults.ts src/domains/habits/components/habit-form.tsx src/nexus/core/intent-engine/__tests__/habit-defaults.test.ts
git commit -m "fix(habits): minDuration 默认值改为等于 defaultDuration"
```

---

### Task 2: 移除 createHabit view_routes 声明

**Files:**
- Modify: `frontend/src/domains/habits/manifest.yaml:199-204`

- [ ] **Step 1: 编辑 manifest.yaml**

删除 `frontend/src/domains/habits/manifest.yaml` 中 view_routes 下的 createHabit 块（第 200-204 行）。改后 view_routes 应为：

```yaml
view_routes:
  view_list:
    component: domains/habits/pages/HabitListPage
    url: /habits
  view_templates:
    component: domains/habits/pages/HabitTemplatePage
    url: /habits/templates
```

- [ ] **Step 2: 重新生成路由并确认无残留**

Run: `cd /home/walker/lifeware/frontend && npm run generate:routes -- --force`
Expected: 不再生成 `app/habits/new/` 路由

Run: `find src/app -path "*/habits/new*" -type f`
Expected: 无输出

- [ ] **Step 3: 提交**

```bash
cd /home/walker/lifeware/frontend
git add src/domains/habits/manifest.yaml
git commit -m "fix(habits): 移除不存在的 HabitFormPage view_route 声明"
```

---

### Task 3: 优化 AI Prompt 时间格式要求

**Files:**
- Modify: `frontend/src/nexus/core/intent-engine/ai-parser.ts:61-127`

- [ ] **Step 1: 修改 HABIT_SYSTEM_PROMPT**

在 `frontend/src/nexus/core/intent-engine/ai-parser.ts` 中，替换 HABIT_SYSTEM_PROMPT 函数体（第 61-127 行）：

```typescript
const HABIT_SYSTEM_PROMPT = (now: Date) => `
你是 Lifeware 习惯意图解析器。将用户的自然语言输入解析为习惯相关结构化意图。

当前时间：${now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', dateStyle: 'full', timeStyle: 'short' })}
时区：Asia/Shanghai (UTC+8)

支持的动作类型：

1. 创建习惯：
{
  "targetDomain": "habits",
  "action": "createHabit",
  "fields": {
    "title": "string",
    "defaultTime": "HH:MM（24小时制，如 22:00、07:30）",
    "defaultDuration": "整数分钟数（如 30、60、90）",
    "trackable": "boolean",
    "frequencyType": "daily | weekly | custom",
    "daysOfWeek": "number[]（0=日，6=六，可选，weekly/custom 时必填）"
  },
  "confidence": 0-1
}

2. 创建模板：
{
  "targetDomain": "habits",
  "action": "createTemplate",
  "fields": {
    "name": "string（模板名称）",
    "applicableDays": "number[]（适用星期）"
  },
  "confidence": 0-1
}

3. 添加习惯到模板：
{
  "targetDomain": "habits",
  "action": "addHabitToTemplate",
  "fields": {
    "templateName": "string",
    "habitTitle": "string",
    "timeOverride": "HH:MM（可选覆盖时间）"
  },
  "confidence": 0-1
}

4. 应用模板：
{
  "targetDomain": "habits",
  "action": "applyTemplate",
  "fields": {
    "templateName": "string",
    "date": "YYYY-MM-DD 或 today"
  },
  "confidence": 0-1
}

格式规则（严格遵守）：
- defaultTime 必须是 "HH:MM" 格式的24小时制字符串
- defaultDuration 必须是整数分钟数
- 时长转换：半小时/30分钟 → 30，1小时 → 60，1个半小时/90分钟 → 90，2小时 → 120
- 时间转换：晚上10点 → "22:00"，下午3点半 → "15:30"，上午9点 → "09:00"，中午12点 → "12:00"，凌晨2点 → "02:00"

推断规则：
- "添加一个晚上读书的习惯，晚上22:00开始，半小时" → createHabit, title="读书", defaultTime="22:00", defaultDuration=30, trackable=true, frequencyType="daily"
- "每天早上7点运动1小时" → createHabit, title="运动", defaultTime="07:00", defaultDuration=60, trackable=true, frequencyType="daily"
- "午餐12点，1小时" → createHabit, title="午餐", defaultTime="12:00", defaultDuration=60, trackable=false（用餐关键词）, frequencyType="daily"
- "工作日晚上10点复盘15分钟" → createHabit, title="复盘", defaultTime="22:00", defaultDuration=15, trackable=true, frequencyType="weekly", daysOfWeek=[1,2,3,4,5]
- 用餐/睡眠/午休类习惯 → trackable=false
- 运动冥想阅读学习类 → trackable=true
- "工作日" → daysOfWeek=[1,2,3,4,5]
- "周末" → daysOfWeek=[0,6]
- 只处理习惯相关意图，其他意图返回 confidence < 0.5
`
```

- [ ] **Step 2: 验证编译通过**

Run: `cd /home/walker/lifeware/frontend && npx tsc --noEmit --pretty 2>&1 | tail -5`
Expected: 无错误

- [ ] **Step 3: 提交**

```bash
cd /home/walker/lifeware/frontend
git add src/nexus/core/intent-engine/ai-parser.ts
git commit -m "fix(habits): 优化 AI prompt 时间和时长格式要求"
```

---

### Task 4: 新增仅解析的 Server Action

**Files:**
- Modify: `frontend/src/app/actions/intent.ts`

- [ ] **Step 1: 添加 import 和 Server Action**

在 `frontend/src/app/actions/intent.ts` 中：

1. 在文件顶部的 import 区域（第 16 行附近），添加导入：

```typescript
import { parseHabitWithAI } from "../../nexus/core/intent-engine/ai-parser";
```

2. 在文件末尾（`fetchActionData` 函数之后）添加新的 Server Action：

```typescript
// ─── 习惯意图仅解析（不执行）Server Action ────────────────────────

export interface HabitParseResult {
  success: boolean;
  action?: string;
  fields?: Record<string, unknown>;
  error?: string;
}

/** 仅解析习惯意图，不执行管道。供 AI 助手路径使用。 */
export async function parseHabitIntentOnly(rawInput: string): Promise<HabitParseResult> {
  try {
    const intentionId = crypto.randomUUID();
    const aiRuntime = createAIRuntime();
    const parseResult = await parseHabitWithAI(rawInput, intentionId as any, aiRuntime);

    if (!parseResult.success || !parseResult.intent) {
      return { success: false, error: parseResult.error ?? "解析失败" };
    }

    return {
      success: true,
      action: parseResult.intent.action,
      fields: parseResult.intent.fields as Record<string, unknown>,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "解析失败";
    return { success: false, error: message };
  }
}
```

- [ ] **Step 2: 验证编译通过**

Run: `cd /home/walker/lifeware/frontend && npx tsc --noEmit --pretty 2>&1 | tail -5`
Expected: 无错误

- [ ] **Step 3: 提交**

```bash
cd /home/walker/lifeware/frontend
git add src/app/actions/intent.ts
git commit -m "feat(habits): 新增 parseHabitIntentOnly 仅解析 Server Action"
```

---

### Task 5: 扩展 MainViewState 类型

**Files:**
- Modify: `frontend/src/components/layout/main-view-state.ts`

- [ ] **Step 1: 修改 view 状态类型**

在 `frontend/src/components/layout/main-view-state.ts` 中，给 view 状态增加可选的 initialFields：

```typescript
export type MainViewState =
  | { type: 'schedule'; date: Date; viewMode: DateViewMode }
  | { type: 'conversation'; sessionId: string }
  | { type: 'action'; domainId: string; action: string }
  | { type: 'settings'; section?: 'general' | 'llm' | 'timezone' | 'templates' }
  | { type: 'view'; domainId: string; action: string; initialFields?: Record<string, unknown> }
```

- [ ] **Step 2: 验证编译通过**

Run: `cd /home/walker/lifeware/frontend && npx tsc --noEmit --pretty 2>&1 | tail -5`
Expected: 无错误（view 状态原来不带 initialFields 的用法仍然兼容，因为 initialFields 是可选的）

- [ ] **Step 3: 提交**

```bash
cd /home/walker/lifeware/frontend
git add src/components/layout/main-view-state.ts
git commit -m "feat(habits): MainViewState view 类型增加 initialFields"
```

---

### Task 6: HabitListPage 支持自动打开创建面板 + 传递初始值

**Files:**
- Modify: `frontend/src/domains/habits/pages/HabitListPage.tsx`
- Modify: `frontend/src/domains/habits/components/habit-list.tsx`

- [ ] **Step 1: 修改 HabitListPage.tsx — 添加 props**

修改 `frontend/src/domains/habits/pages/HabitListPage.tsx`：

1. 在文件顶部类型定义区域（HabitItem interface 之后、组件函数之前），添加 props 接口：

```typescript
interface HabitListPageProps {
  autoOpenCreate?: boolean
  initialFields?: Partial<HabitFormFields>
}
```

2. 修改组件签名，从无参变为接收 props：

```typescript
// 改前：
export function HabitListPage() {
// 改后：
export function HabitListPage({ autoOpenCreate, initialFields }: HabitListPageProps) {
```

3. 将 autoOpenCreate 和 initialFields 传递给 HabitList 组件（在 JSX 中，约第 251 行）：

```tsx
      <HabitList
        habits={habitItems}
        onCreate={handleCreate}
        onStatusChange={handleStatusChange}
        onUpdateHabit={handleUpdateHabit}
        onRefresh={loadHabits}
        autoOpenCreate={autoOpenCreate}
        initialFields={initialFields}
      />
```

- [ ] **Step 2: 修改 habit-list.tsx — 添加 props 并自动打开面板**

修改 `frontend/src/domains/habits/components/habit-list.tsx`：

1. 在 HabitListProps 接口中添加两个可选属性：

```typescript
interface HabitListProps {
  habits: HabitItem[]
  onCreate: (fields: HabitFormFields) => Promise<{ success: boolean; error?: string }>
  onStatusChange: (id: string, action: string) => void
  onUpdateHabit: (id: string, fields: HabitFormFields) => Promise<{ success: boolean; error?: string }>
  onRefresh: () => Promise<void>
  autoOpenCreate?: boolean
  initialFields?: Partial<HabitFormFields>
}
```

2. 修改组件签名：

```typescript
// 改前：
export function HabitList({ habits, onCreate, onStatusChange, onUpdateHabit, onRefresh }: HabitListProps) {
// 改后：
export function HabitList({ habits, onCreate, onStatusChange, onUpdateHabit, onRefresh, autoOpenCreate, initialFields }: HabitListProps) {
```

3. 在 panelMode 状态初始化后，添加 useEffect 自动打开创建面板：

```typescript
import { useState, useCallback, useEffect } from "react"
```

（确认 useEffect 已在 import 中，如果没有则添加）

在 `const [panelMode, setPanelMode] = useState<PanelMode>(null)` 之后添加：

```typescript
  useEffect(() => {
    if (autoOpenCreate && panelMode === null) {
      setPanelMode("create")
    }
  }, [autoOpenCreate])
```

4. 修改 HabitForm 渲染，传递 initialFields。找到创建模式的 HabitForm（约第 226 行），改为：

```tsx
          <HabitForm
            key={panelMode}
            initial={panelMode === "create" ? initialFields : editInitial}
            onSubmit={panelMode === "create" ? handleCreateSave : handleEditSave}
            onCancel={handlePanelClose}
            isLoading={isSubmitting}
          />
```

注意：当 `panelMode === "create"` 时，优先使用传入的 `initialFields`（可能来自 AI 解析）；当编辑模式时，使用 `editInitial`（从习惯数据映射）。

- [ ] **Step 3: 验证编译通过**

Run: `cd /home/walker/lifeware/frontend && npx tsc --noEmit --pretty 2>&1 | tail -5`
Expected: 无错误

- [ ] **Step 4: 提交**

```bash
cd /home/walker/lifeware/frontend
git add src/domains/habits/pages/HabitListPage.tsx src/domains/habits/components/habit-list.tsx
git commit -m "feat(habits): HabitListPage 支持自动打开创建面板和初始值填充"
```

---

### Task 7: page.tsx 注册路由 + AI 路径跳转 + view 渲染传 props

**Files:**
- Modify: `frontend/src/app/page.tsx`

- [ ] **Step 1: 注册 createHabit 到 VIEW_PAGE_COMPONENTS**

在 `frontend/src/app/page.tsx` 中，修改 `VIEW_PAGE_COMPONENTS`（第 45-50 行）：

```typescript
const VIEW_PAGE_COMPONENTS: Record<string, Record<string, React.ComponentType<any>>> = {
  habits: {
    view_list: HabitListPage,
    view_templates: HabitTemplatePage,
    createHabit: HabitListPage,
  },
};
```

注意：类型从 `React.ComponentType` 改为 `React.ComponentType<any>` 以支持 props 传递。

- [ ] **Step 2: 修改 view 渲染，传递 props**

在 `renderMainContent` 函数中，找到 view 分支（约第 464-475 行），修改为：

```typescript
    if (mainViewState.type === 'view') {
      const { domainId, action, initialFields } = mainViewState
      const ViewComponent = VIEW_PAGE_COMPONENTS[domainId]?.[action]
      if (ViewComponent) {
        const props = action === 'createHabit'
          ? { autoOpenCreate: true, initialFields: initialFields as any }
          : {}
        return (
          <div className="flex-1 overflow-y-auto">
            <ViewComponent {...props} />
          </div>
        )
      }
      return <div className="p-4"><p className="text-sm text-body">页面未找到</p></div>
    }
```

- [ ] **Step 3: 添加 parseHabitIntentOnly 导入**

在文件顶部的 import 区域（第 25 行的 import 末尾），将 `parseHabitIntentOnly` 添加到导入列表：

```typescript
import { submitIntent, submitTemplateIntent, getTimeboxesByRange, transitionTimebox, submitExecutionIntent, submitBatchIntent, resolveShortcut, fetchDomainActions, submitDynamicIntent, fetchActionData, parseHabitIntentOnly } from "./actions/intent"
```

- [ ] **Step 4: 修改 handleConversationSend — AI 习惯创建路径**

在 `handleConversationSend` 函数中，找到 `submitIntent` 调用（约第 363 行），在其后增加习惯创建的特殊处理：

```typescript
    setIsLoading(true)
    try {
      // 习惯创建意图 → 仅解析不执行，导航到 HabitListPage 填入字段
      const habitParse = await parseHabitIntentOnly(content)
      if (habitParse.success && habitParse.action === 'createHabit' && habitParse.fields) {
        setMainViewState({
          type: 'view',
          domainId: 'habits',
          action: 'createHabit',
          initialFields: habitParse.fields,
        })
        const navMsg: ChatMessage = {
          role: 'assistant',
          content: '已识别习惯创建意图，请在右侧面板中确认并创建。',
          timestamp: new Date().toISOString(),
        }
        setConversationMessages(prev => [...prev, navMsg])
        setIsLoading(false)
        return
      }

      // 非习惯创建：走原有 submitIntent 管道
      const result = await submitIntent(content, false, traceEnabled)
      setTimeboxes(result.timeboxes)

      // 如果 AI 解析出 StructuredIntent，触发分裂视图
      if (result.success && result.actionSurface) {
        const intent = result.actionSurface
        // MVP: 简单判断是否为创建意图 → 触发表单分裂
        if (content.includes('创建') || content.includes('新建')) {
          setSplitWith({
            mode: 'form',
            domainId: 'timebox',
            action: 'create_timebox',
            fields: {},
          })
        }
      }

      // 习惯解析失败但可能是习惯相关 → 提示用户
      if (!habitParse.success && (content.includes('习惯') || content.includes('habit'))) {
        const aiMsg: ChatMessage = {
          role: 'assistant',
          content: `未能识别习惯创建意图：${habitParse.error}。请尝试更具体的描述，或使用左侧「成长领域」→「创建一个新习惯」。`,
          timestamp: new Date().toISOString(),
        }
        setConversationMessages(prev => [...prev, aiMsg])
        setIsLoading(false)
        return
      }

      const aiMsg: ChatMessage = {
        role: 'assistant',
        content: result.success ? '已处理你的请求。' : (result.error ?? '处理失败'),
        timestamp: new Date().toISOString(),
      }
      setConversationMessages(prev => [...prev, aiMsg])
    } catch {
```

注意：这段替换了原有的 `try { const result = await submitIntent(...)` 块（第 362-389 行）。`catch` 块和 `finally` 块保持不变。

- [ ] **Step 5: 验证编译通过**

Run: `cd /home/walker/lifeware/frontend && npx tsc --noEmit --pretty 2>&1 | tail -10`
Expected: 无错误

- [ ] **Step 6: 提交**

```bash
cd /home/walker/lifeware/frontend
git add src/app/page.tsx
git commit -m "feat(habits): AI 助手习惯创建 → 导航到 HabitListPage 填入字段"
```

---

### Task 8: 端到端验证

- [ ] **Step 1: 运行完整测试套件**

Run: `cd /home/walker/lifeware/frontend && npx vitest run 2>&1 | tail -20`
Expected: 所有测试通过

- [ ] **Step 2: 启动开发服务器**

Run: `cd /home/walker/lifeware/frontend && npm run dev`
Expected: 编译成功，无错误

- [ ] **Step 3: 手动验证途径1**

1. 打开浏览器，进入主页
2. 点击左侧面板的「成长领域」标签
3. 找到「习惯」→「创建一个新习惯」
4. 验证：主内容区显示 HabitListPage，右侧自动打开「新建习惯」面板

- [ ] **Step 4: 手动验证途径2**

1. 点击左侧面板的「AI 助手」标签
2. 输入："添加一个晚上读书的习惯，晚上22:00开始，半小时"
3. 验证：
   - AI 助手回复"已识别习惯创建意图"
   - 主内容区跳转到 HabitListPage
   - 右侧「新建习惯」面板自动打开
   - 表单中标题=读书，默认时间=22:00，默认时长=30

- [ ] **Step 5: 验证默认值**

1. 在新建习惯面板中，确认以下默认值正确：
   - 最早开始 = 21:30（默认时间 - 30分钟）
   - 最迟开始 = 22:30（默认时间 + 30分钟）
   - 最短时长 = 30（等于默认时长）
   - 频率 = 每天
   - 开始日期 = 今天
   - 结束日期 = 空

- [ ] **Step 6: 最终提交（如有 lint 修复等）**

```bash
cd /home/walker/lifeware/frontend
npm run lint -- --fix
git add -A
git commit -m "chore: lint 修复"
```
