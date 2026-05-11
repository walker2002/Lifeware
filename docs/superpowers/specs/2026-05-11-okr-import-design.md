# OKR 文件导入功能设计

> 日期: 2026-05-11
> 状态: 已批准
> 依赖: OKR 核心管理 (2026-05-10)、OKR 增强 (2026-05-11)

## 1. 概述

在 OKR 管理中增加从文件读取并智能生成 OKR 的功能。用户上传文件（Markdown/Excel/Word/TXT），AI 自动识别并提取 OKR 元素，生成规范 Markdown，用户在线编辑后保存为草稿。

### 核心决策

| 决策项 | 选择 |
|--------|------|
| AI 服务 | DashScope qwen-plus（已有配置） |
| 文件处理 | 前端预处理（解析文件格式）+ LLM 提取 |
| 编辑器 | Markdown 代码 + 预览模式 |
| 批量策略 | 单次单文件，逐个确认 |
| 报告展示 | 编辑器内嵌 Banner |
| 架构方案 | 服务端 AI 流水线（Server Actions） |

## 2. 用户流程

```
1. 点击"文件导入"按钮 → 弹出文件选择器（支持 .md/.xlsx/.docx/.txt）
2. 前端解析文件内容为纯文本/结构化数据
3. 调用 Server Action 将内容发给 LLM
4. LLM 返回：结构化 OKR 数据 + 提取报告
5. 右侧 OKRPanel 切换到导入编辑视图：
   - 顶部：提取报告 Banner
   - 主体：Markdown 编辑器（代码 + 预览切换），显示完整的含所有 OKR 的 Markdown 文本
   - 底部：操作栏（上一个/下一个 OKR 跳转定位、保存全部）
6. 用户编辑全部确认后点"保存" → 解析 Markdown 中所有 OKR → 校验 → 逐个调用 createObjective + createKeyResult → 状态为 draft
7. 用户逐个激活
```

## 3. Markdown 模板

```markdown
# OKR 导入模板

> **字段说明**
> - **类型**: `承诺型`（完成型目标）| `愿景型`（挑战型目标）
> - **优先级**: `P0`（必须完成）| `P1`（应该完成，默认）| `P2`（有余力则做）
> - **周期类型**: `周` | `月` | `季` | `半年` | `年`
> - **周期格式**: `<type>标识` 或 `起始日期 ~ 结束日期`
>   - 年: `2026` 或 `2026-01-01 ~ 2026-12-31`
>   - 半年: `2026-H1` 或 `2026-H2`
>   - 季: `2026-Q1` ~ `2026-Q4`
>   - 月: `2026-M01` ~ `2026-M12`
>   - 周: `2026-W01` ~ `2026-W52`

---

## Objective: 提升产品质量
<!-- 类型: 承诺型 | 愿景型 -->
<!-- 优先级: P0 | P1 | P2 -->
- **类型**: 承诺型
- **优先级**: P1
- **周期类型**: 季
- **周期**: 2026-Q2 (2026-04-01 ~ 2026-06-30)
- **描述**: 通过系统化质量管理提升产品整体质量

### KR 1: 代码覆盖率提升至 85%
- **目标值**: 85
- **单位**: %
- **截止日期**: 2026-06-30

### KR 2: 客户满意度评分达到 4.5
- **目标值**: 4.5
- **单位**: 分
- **截止日期**: 2026-06-30

---
```

### 枚举值映射（模板中文 → 系统英文）

| 模板值 | 系统值 | 字段 |
|--------|--------|------|
| 承诺型 | committed | okrType |
| 愿景型 | visionary | okrType |
| 周 | weekly | periodType |
| 月 | monthly | periodType |
| 季 | quarterly | periodType |
| 半年 | semi_annual | periodType |
| 年 | annual | periodType |
| P0/P1/P2 | P0/P1/P2 | priority（不变） |

## 4. 前端组件

### 新增文件

```
components/okr/
├── okr-import-panel.tsx       (导入编辑视图)
├── okr-import-dialog.tsx      (文件上传对话框)
```

### 修改文件

| 文件 | 变更 |
|------|------|
| `okr-directory.tsx` | 新增"文件导入"和"模板下载"按钮 |
| `okr-panel.tsx` | PanelMode 新增 `import` 模式，渲染 OKRImportPanel |
| `okr-workspace.tsx` | 新增 mode 状态 `import`，传递导入相关回调 |

### 导入编辑视图（OKRImportPanel）布局

```
┌─────────────────────────────────────────┐
│  ⚠ 提取报告：识别到 2 个目标、5 个 KR    │  ← ImportReportBanner
│  缺失信息：目标2 缺少周期信息              │
├─────────────────────────────────────────┤
│  [代码] [预览]                           │  ← 模式切换
│  ┌──────────────────────────────────┐   │
│  │ # OKR 导入                        │   │  ← MarkdownEditor（完整内容）
│  │                                   │   │
│  │ ## Objective: 提升产品质量         │   │
│  │ - **类型**: 承诺型                 │   │
│  │ ...                               │   │
│  │ ## Objective: 建立用户增长体系      │   │
│  │ ...                               │   │
│  └──────────────────────────────────┘   │
├─────────────────────────────────────────┤
│  ← 上一个目标    [1/2]         保存全部  │  ← ImportActions
└─────────────────────────────────────────┘
```

编辑器显示完整 Markdown 文本（含所有 OKR），"上一个/下一个"按钮用于跳转定位到各个 Objective 标题位置。用户一次编辑所有内容后统一保存。

### OKRPanel mode 扩展

现有: `empty | detail | edit | create`
新增: `import`

## 5. 服务端逻辑

### 文件处理流水线

```
1. 前端解析文件
   ├── .md / .txt → 直接读取文本内容
   ├── .xlsx → 使用 xlsx 库解析为 JSON，转为文本摘要
   └── .docx → 使用 mammoth 库提取纯文本

2. Server Action: importOKRFromFile(fileContent, fileName)
   ├── 构造 Prompt（含模板格式说明 + 枚举映射）
   ├── 调用 DashScope qwen-plus（通过 createClient()）
   ├── LLM 返回结构化 JSON + 提取报告
   └── 将结构化数据渲染为规范 Markdown 文本

3. 返回给前端
   ├── markdown: 规范化的 Markdown 文本
   ├── report: { totalObjectives, totalKRs, missingFields[], warnings[] }
   └── parsedOKRs: ParsedOKR[]（用于后续逐个保存）
```

### LLM Prompt 结构

1. **系统指令**：你是 OKR 提取助手，从用户提供的文本中提取 OKR 信息
2. **输出格式要求**：返回 JSON，包含 `objectives[]` 和 `report`
3. **枚举映射说明**：中文 → 英文对应关系
4. **用户内容**：文件文本

### 保存逻辑

```typescript
// Server Action: saveImportedOKRs
// 一次性保存所有导入的 OKR
async function saveImportedOKRs(okrs: ParsedObjective[]) {
  // 1. 校验所有 OKR 的关键字段（任一缺失则全部拒绝）
  const criticalErrors: string[] = []
  for (const [idx, okr] of okrs.entries()) {
    if (!okr.title) criticalErrors.push(`目标${idx + 1} 缺少标题`)
    if (!okr.periodStart || !okr.periodEnd) criticalErrors.push(`目标${idx + 1} 缺少周期信息`)
  }
  if (criticalErrors.length > 0) {
    return { success: false, error: criticalErrors.join('; ') }
  }

  // 2. 逐个保存，填充非关键字段默认值
  const saved: Objective[] = []
  for (const okr of okrs) {
    const objective = await createObjective({
      title: okr.title,
      description: okr.description,
      okrType: okr.okrType ?? 'committed',
      priority: okr.priority ?? 'P1',
      periodType: okr.periodType ?? 'quarterly',
      periodStart: okr.periodStart,
      periodEnd: okr.periodEnd,
    })
    for (const kr of okr.keyResults) {
      await createKeyResult(objective.id!, {
        title: kr.title,
        description: kr.description,
        targetValue: kr.targetValue ?? 100,
        unit: kr.unit ?? '个',
      })
    }
    saved.push(objective)
  }
  return { success: true, data: saved }
}
```

### 保存验证规则

**关键性字段**（缺失则拒绝所有保存）：
- Objective: `title`（目标标题）、`period`（周期）

**非关键性字段**（缺失时提示，可填默认值保存）：
- `okrType` → 默认 `committed`
- `priority` → 默认 `P1`
- `description` → 留空
- KR `targetValue` → 默认 `100`
- KR `unit` → 默认 `个`
- KR `dueDate` → 继承 Objective 周期结束日期

验证时机：保存时解析 Markdown 中所有 OKR，检查关键字段，任一 OKR 缺失则阻止全部保存并高亮问题位置。修复后重新点击保存。

## 6. 依赖库

| 库 | 用途 | 大小 |
|---|---|---|
| `xlsx` | 解析 Excel (.xlsx) 文件 | ~2MB |
| `mammoth` | 解析 Word (.docx) 文件 | ~200KB |
| `react-simple-code-editor` + `prismjs` | 轻量 Markdown 代码编辑器 | ~100KB |

Markdown 预览使用 `react-markdown`（已有）。

## 7. 错误处理

| 场景 | 处理 |
|---|---|
| 文件格式不支持 | 前端校验，Toast 提示 |
| 文件为空或内容过少 | 前端校验，Toast 提示 |
| LLM 调用失败 | Server Action 返回错误，Toast 提示 |
| LLM 无法提取任何 OKR | 返回报告标记"识别失败"，提示补充信息 |
| 文件过大（>5MB） | 前端 + 服务端双重校验 |
| 保存时关键信息缺失 | 阻止保存，Banner 高亮缺失字段 |

### 性能考虑

- LLM 调用设 30s 超时
- 文件大小限制 5MB
- Markdown 预览仅在切换时渲染

## 8. 数据类型定义

```typescript
// 导入结果（LLM 返回）
interface ImportResult {
  objectives: ParsedObjective[]
  report: ImportReport
}

interface ParsedObjective {
  title: string
  description?: string
  okrType?: 'committed' | 'visionary'
  priority?: 'P0' | 'P1' | 'P2'
  periodType?: string
  periodStart?: string
  periodEnd?: string
  keyResults: ParsedKeyResult[]
}

interface ParsedKeyResult {
  title: string
  description?: string
  targetValue?: number
  unit?: string
  dueDate?: string
}

interface ImportReport {
  totalObjectives: number
  totalKRs: number
  missingFields: string[]    // 如 "目标2 缺少周期信息"
  warnings: string[]         // 如 "KR3 缺少目标值，将使用默认值100"
  confidence: 'high' | 'medium' | 'low'
}
```
