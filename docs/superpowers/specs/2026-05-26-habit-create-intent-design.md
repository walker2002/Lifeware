# 习惯创建意图优化设计

## 背景

习惯创建有两个入口存在问题：
1. **途径1（成长领域入口）**：manifest 声明 `createHabit` 使用 `HabitFormPage`，但该文件不存在
2. **途径2（AI 助手）**：输入 "添加一个晚上读书的习惯，晚上22:00开始，半小时" 报错 "AI 解析失败：Invalid time value"

## 设计目标

- 统一两个入口到 HabitListPage 的内嵌编辑面板
- AI 助手创建习惯时自动填入已识别字段
- 修复时间格式解析问题
- 调整默认值逻辑

## 设计方案

### 1. Manifest 修复

**文件**：`frontend/src/domains/habits/manifest.yaml`

移除 `view_routes` 中的 `createHabit` 声明（HabitFormPage 不存在，创建功能已内嵌在 HabitListPage）。

删除：
```yaml
  createHabit:
    component: domains/habits/pages/HabitFormPage
    url: /habits/new
    params:
      mode: create
```

同步删除 `app/habits/new/` 自动生成的路由文件（如果存在）。

### 2. AI Prompt 优化

**文件**：`frontend/src/nexus/core/intent-engine/ai-parser.ts`

在 `HABIT_SYSTEM_PROMPT` 中增加格式规则和示例：

```
格式规则（严格遵守）：
- defaultTime 必须是 "HH:MM" 格式的24小时制字符串
- defaultDuration 必须是整数分钟数：半小时 → 30，1小时 → 60，1个半小时 → 90
- 时间转换：晚上10点 → 22:00，下午3点半 → 15:30，上午9点 → 09:00
```

新增示例：
```
- "添加一个晚上读书的习惯，晚上22:00开始，半小时" → defaultTime="22:00", defaultDuration=30
- "每天早上7点运动1小时" → defaultTime="07:00", defaultDuration=60
```

### 3. 统一入口跳转 + HabitListPage 增强

#### 3a. 路由注册

**文件**：`frontend/src/app/page.tsx`

在 `VIEW_PAGE_COMPONENTS` 中注册 `createHabit` 指向 HabitListPage：

```typescript
const VIEW_PAGE_COMPONENTS = {
  habits: {
    view_list: HabitListPage,
    view_templates: HabitTemplatePage,
    createHabit: HabitListPage,
  },
}
```

`mainViewState` 类型扩展，支持 `initialFields`：

```typescript
// 当 action === 'createHabit' 时传递 props
const props = action === 'createHabit'
  ? { autoOpenCreate: true, initialFields: mainViewState.initialFields }
  : {}
return <ViewComponent {...props} />
```

#### 3b. HabitListPage 增强

**文件**：`frontend/src/domains/habits/pages/HabitListPage.tsx`

新增 props：

```typescript
interface HabitListPageProps {
  initialFields?: Partial<HabitFormFields>
  autoOpenCreate?: boolean
}
```

行为：
- `autoOpenCreate=true` → 自动设置面板为创建模式
- `initialFields` → 传递给 HabitForm 作为初始值

#### 3c. AI 助手路径

**文件**：`frontend/src/app/page.tsx`

在 `handleConversationSend` 中，当 `submitIntent` 返回成功且解析出 `createHabit` action 时，导航到 HabitListPage 并传递 AI 识别的字段。

### 4. 默认值与频率处理

**文件**：`frontend/src/domains/habits/components/habit-form.tsx`

**改动**：`autoComplete` 函数中 `minDuration` 计算逻辑：

```typescript
// 当前：minDuration = floor(defaultDuration * 0.5 / 5) * 5
// 改为：minDuration = defaultDuration
```

其他默认值无需改动（已正确）：
- 最早开始 = 默认时间 - 30分钟
- 最迟开始 = 默认时间 + 30分钟
- 频率默认 daily
- 开始日期默认今天
- 结束日期默认空
- 每天频率时 daysOfWeek 不提交

## 改动文件清单

| 文件 | 改动类型 |
|------|---------|
| `manifest.yaml` | 删除 createHabit view_route |
| `ai-parser.ts` | 优化 HABIT_SYSTEM_PROMPT |
| `page.tsx` | 注册路由 + AI路径跳转 + initialFields 支持 |
| `HabitListPage.tsx` | 新增 props 支持 |
| `habit-form.tsx` | minDuration 默认值调整 |
| `habit-list.tsx` | 传递 initialFields 到 HabitForm |

## 风险与注意事项

- URL 参数不暴露敏感数据（都是用户自己输入的内容）
- HabitForm 的 `initial` prop 已支持部分字段填充，无需修改组件核心逻辑
- AI 解析失败时，仍然导航到 HabitListPage 但不自动填入字段，用户手动创建
