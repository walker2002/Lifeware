# Quickstart: AI Runtime 架构升级

**Branch**: `009-ai-runtime-upgrade` | **Date**: 2026-05-23

## 概览

本升级将 AI 调用从各模块直接使用 OpenAI SDK 迁移到统一的 AIRuntime 入口。3 个 Sprint，每个 Sprint 有明确的验证标准。

## 前置条件

- Node.js 环境已配置
- PostgreSQL 已启动（`docker-compose up -d`）
- 至少一个 LLM Provider 的 API Key 已配置（推荐 DashScope）
- 现有系统正常运行（`npm run dev` 可启动）

## Sprint 1: AI Runtime 核心（~2-3 周）

### 验证目标
所有 LLM 调用走统一入口，Intent Engine 迁移后解析结果一致。

### 实施步骤

1. **创建 AIRuntime 骨架**
   ```
   frontend/src/nexus/ai-runtime/
   ├── index.ts          # createAIRuntime()
   ├── types.ts          # 核心接口定义
   └── llm-gateway/
       ├── index.ts      # LLMGateway 实现
       ├── providers/
       │   └── openai-compatible.ts  # 包装现有 /lib/llm/
       └── config.ts     # 默认路由表
   ```

2. **实现 TokenBudgetManager + ResponseCache**
   - `token-budget/index.ts`: record() + getDailySummary()
   - `cache/index.ts`: L1 精确匹配缓存

3. **迁移 Intent Engine**
   - 修改 `ai-parser.ts`: 注入 `aiRuntime`，替换 `chat()` 调用
   - 验证：相同输入 → 相同输出

4. **定义 CN-UI 类型**
   - `cnui/types.ts`: CnuiComponentType, CnuiSurfaceStatus 等

### 验证命令
```bash
# 启动开发服务器
cd frontend && npm run dev

# 在对话中输入自然语言指令，验证 Intent Engine 解析结果
# 检查控制台日志确认调用链路通过 LLMGateway
```

## Sprint 2: Session + Memory L1 + CN-UI 基础（~2 周）

### 验证目标
Session 生命周期可用，Handler 迁移到 onGenerate，FieldCompletionCard 渲染。

### 实施步骤

1. **实现 Memory L1 + AISessionManager**
   ```
   frontend/src/nexus/ai-runtime/
   ├── session/index.ts           # AISessionManager
   └── memory/
       ├── index.ts               # MemoryFramework
       └── layers/l1-session.ts   # L1 Session Layer
   ```

2. **扩展 ai_sessions 表**
   - 新增 domain_id, action, session_mode 列
   - 扩展 status enum

3. **迁移 Handler: handle() → onGenerate()**
   - 修改 `scheduling-handler.ts`: 新增 `onGenerate()`
   - 修改 Orchestrator: 注入 `aiRuntime` 到 Handler

4. **实现 CN-UI 基础**
   - `cnui/catalog.ts`, `surface-store.ts`, `event-bus.ts`, `manager.ts`
   - 实现 FieldCompletionCard (habit-creation-card)

### 验证命令
```bash
# 测试 Session 创建/归档生命周期
# 测试 SchedulingHandler.onGenerate()
# 测试 FieldCompletionCard 渲染
```

## Sprint 3: 端到端 CN-UI + 完整场景（~2 周）

### 验证目标
时间盒场景端到端跑通，多轮修订可用，Memory L2 摘要就绪。

### 实施步骤

1. **TimeboxList CN-UI 组件**
   - 安装 `@dnd-kit/core` + `@dnd-kit/sortable`
   - 实现 TimeboxList.tsx（拖拽 + 冲突检测）

2. **多轮修订 (request_ai_revise)**
   - 扩展 GenerationRequest
   - 实现 Session 历史注入
   - 实现 Surface 原地更新

3. **Memory L2 摘要沉淀**
   - 新建 memory_episodes 表
   - 实现 `memory/layers/l2-episode.ts`
   - archive() 触发摘要生成

4. **端到端验证**
   - 用户输入 → Intent Engine → Handler → CN-UI → 确认 → StateMachine

### 验证命令
```bash
# 完整时间盒流程：
# 1. 输入"生成今日时间盒计划"
# 2. 拖拽调整时间块
# 3. 输入"把下午深度工作缩短到1小时"（多轮修订）
# 4. 点击确认 → timebox 写入数据库
# 5. 检查 memory_episodes 表有摘要记录
```

## 关键依赖安装

```bash
cd frontend

# Sprint 1
npm install ai @ai-sdk/anthropic @ai-sdk/openai

# Sprint 3
npm install @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

## 回退策略

每个 Sprint 独立验证。如果某 Sprint 验证失败：
- Sprint 1 失败：Intent Engine 保持原有 `chat()` 调用，AIRuntime 不上线
- Sprint 2 失败：Sprint 1 成果保留（LLMGateway 可用），Session/CN-UI 不上线
- Sprint 3 失败：Sprint 1-2 成果保留，TimeboxList 拖拽和多轮修订延后
