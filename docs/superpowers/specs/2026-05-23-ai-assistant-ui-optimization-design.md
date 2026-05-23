# AI 助手界面优化设计

日期：2026-05-23

## 概述

两个小范围 UI 优化：修复 AI 助手提示的误判问题，以及改进新对话的欢迎页体验。

---

## [001] AI助手提示优化

### 问题

`page.tsx` 中 `llmConfigured` 通过 `localStorage.getItem('lw-llm-config')` 判断，但该 key 从未被任何代码写入，导致值永远为 `false`，"请先配置大语言模型"提示始终显示。

### 修复方案

**判断逻辑**：检查默认供应商的 API Key 和默认模型是否都已配置。

步骤：
1. 获取默认/活跃供应商（`activeProvider`，优先用户偏好 → 回退 `LLM_PROVIDER` 环境变量）
2. 检查该供应商的 API Key 是否存在（`getEnv(apiKeyEnv)`）
3. 检查该供应商的默认模型是否配置（`models.default` 不为空且不为 `'unknown'`）
4. 三个条件全满足 → `llmConfigured = true`，不显示提示

**实现方式**：
- 新建轻量 Server Action `checkLLMConfigured()`，返回 boolean
- `page.tsx` 中用 `useEffect` 调用该 Action 初始化 `llmConfigured` 状态
- 替换当前的 `localStorage.getItem('lw-llm-config')` 逻辑

### 修改文件

- `frontend/src/app/actions/llm-config.ts`：新增 `checkLLMConfigured()` Server Action
- `frontend/src/app/page.tsx`：替换 `llmConfigured` 的初始化逻辑

---

## [002] 新对话欢迎页

### 问题

点击"+新对话"后，主内容区仅显示空白文字"开始新对话"，输入框无自动聚焦，缺少引导。

### 设计方案

采用 ChatGPT 风格的垂直居中布局。当对话视图的 `messages.length === 0` 时显示欢迎页。

### 布局结构

1. **欢迎语**：居中标题"有什么可以帮你的？"
2. **意图快捷按钮**（5个）：横排圆角卡片，显示用户最常用的意图。点击后自动填入输入框并发送
3. **输入框**：居中，`max-w-xl`，自动获取焦点
4. **最近对话**（3个）：输入框下方小列表，点击跳转到对应会话

### 交互细节

- 进入新对话时，输入框自动聚焦
- 快捷按钮点击 = 填充输入框文本 + 自动发送
- 最近对话点击 = 切换到该会话（调用 `handleSelectSession`）
- 用户发送第一条消息后，欢迎页消失，切换为正常对话视图

### 数据来源

- **最常用意图**：从 `sessions` 中统计出现频率最高的意图关键词，取前 5
- **最近对话**：取 `sessions` 数组前 3 条（已按 `updatedAt` 排序）
- 如果 `sessions` 为空（首次使用），快捷按钮显示预设默认意图（创建任务、规划日程、设定目标、添加习惯、能量记录）

### 修改文件

- `frontend/src/components/layout/conversation-view.tsx`：空状态区域替换为欢迎页内容，添加 `useRef` + `useEffect` 实现自动聚焦

---

## 不在范围内

- AI 对话的实际响应逻辑
- 会话持久化到数据库
- 输入框的富文本/Markdown 支持
