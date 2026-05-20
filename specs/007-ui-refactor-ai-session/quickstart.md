# Quickstart: 界面重构及AI助手会话优化

**Feature**: 007-ui-refactor-ai-session
**Date**: 2026-05-17 (v3 含需求补充 S1/S2)

## 开发前准备

```bash
cd frontend
npm install          # 确认依赖就绪
docker-compose up -d # 启动 PostgreSQL
npm run db:generate  # 生成新迁移（ai_sessions, user_settings 表）
npm run db:migrate   # 执行迁移
npm run dev          # 启动开发服务器
```

## 实施顺序

### Phase 0: 回溯修正（最高优先级）

修正实测发现的 5 个问题（R1-R5），每个修正独立可验证：

1. **R1: 左侧面板清除旧内容**
   - 从 `leftPanelContent` 移除 `aiPanelContent`
   - 删除 `InputMode` 状态和 `handleModeToggle`
   - 验证：左侧面板 assistant 标签仅显示 SessionList

2. **R2: 配置按钮导航修复**
   - `handleSettingsClick` → `setMainViewState({ type: 'settings' })`
   - 新增 SettingsPage 视图渲染
   - 验证：点击设置按钮进入配置页面

3. **R3: LLM 提示跳转修复**
   - "前往设置"按钮 → `setMainViewState({ type: 'settings', section: 'llm' })`
   - SettingsPage 接收 section prop 自动定位
   - 验证：LLM 未配置时点击"前往设置"可进入配置页面 LLM 区域

4. **R4: 主显示区标签页移除**
   - 移除 schedule 视图中的 5 个标签页
   - 仅保留 DateNav + 日历视图
   - 验证：主显示区 schedule 视图只有日历，无多余标签

5. **R5: 成长领域数据修复**
   - 检查并修复 `fetchDomainActions()` server action
   - 确保 Registry 返回正确的 action 数据
   - 验证：成长领域标签页显示所有 4 个领域的 action

### Phase 1: 数据层基础（可并行）

6. **Domain Manifest 扩展 + Registry 增强**
   - 编辑各 Domain 的 `manifest.yaml`，增加 `shortcut` 字段
   - 新增 `view_routes` 块（G 块）
   - 新增 `templates.markdown` 块
   - 增强 `domains/registry.ts`：新增 accessor 方法
   - 实现 `nexus/intent-engine/shortcut-matcher.ts`

7. **AI 会话数据模型**
   - 定义 USOM 类型：`AISession`, `ChatMessage`, `UserSettings`, `LLMConfig`
   - 创建 DB Schema：`ai-sessions.ts`, `user-settings.ts`
   - 实现 Repository：`session-repository.ts`, `user-settings-repo.ts`
   - 实现 `lib/crypto/encrypt.ts`（Web Crypto API 加密）

### Phase 2: UI 壳

8. **UI 框架重构**
   - 重写 `left-panel.tsx`：导航面板（Home + 标签页）
   - 新增 `growth-menu.tsx`、`session-list.tsx`
   - 重写 `main-content.tsx`：支持四种视图状态 + 分裂视图
   - 新增 `conversation-view.tsx`、`resizable-splitter.tsx`
   - 重构 `page.tsx`：MainViewState 状态管理
   - 修改 `app-shell.tsx`：新布局结构

### Phase 3: 功能接入（可并行）

9. **S1: LLM 配置统一到 .env**
   - 修改 `.env.local`：添加 `LLM_PROVIDERS` 和每个提供商的模型映射变量
   - 重构 `config.ts`：移除 `PROVIDERS` 硬编码常量，改为从 `process.env` 动态构建
   - 新增 Server Action `getLLMProviders()`：暴露非敏感配置给前端
   - 验证：`LLM_PROVIDERS` 环境变量变更后，前端正确显示可用提供商列表

10. **S2: 成长领域菜单 action 表单加载**
    - 新增 `DynamicForm` 组件：根据 `FieldPrompt[]` 动态渲染表单
    - 新增 `ActionConfirm` 组件：非创建类 action 的确认界面
    - 新增 `parseDynamicForm()`：泛化 `parseTemplateForm()`，支持动态字段映射
    - 修改 `main-content.tsx`：action 视图渲染 DynamicForm 或 ActionConfirm
    - 增强 `Registry`：新增 `getRequiredFields()`, `hasRequiredFields()` 方法
    - 验证：点击"创建习惯" → 显示动态表单；点击"激活习惯" → 显示确认界面

11. **成长领域菜单 + 快捷方式执行**
    - 完成 `growth-menu.tsx`（从 Registry 动态生成）
    - 接入快捷方式解析到 Intent Engine

12. **template_markdown 工作流**
    - 新增 `markdown-editor.tsx`
    - 实现 `nexus/intent-engine/markdown-parser.ts`
    - 新增 `file-uploader.tsx`

13. **配置页面**
    - 新增 `settings-page.tsx`、`llm-settings.tsx`、`timezone-picker.tsx`
    - LLM 设置区域使用 `getLLMProviders()` 读取提供商列表
    - 追踪日志开关从 TopNav 迁入配置页面
    - 集成现有习惯模板管理功能

## 关键文件清单

| 类别 | 文件 | 操作 |
|---|---|---|
| USOM | `usom/types/objects.ts` | 新增类型定义 |
| DB Schema | `lib/db/schema/ai-sessions.ts` | 新增 |
| DB Schema | `lib/db/schema/user-settings.ts` | 新增 |
| Repository | `lib/db/repository/session-repository.ts` | 新增 |
| Repository | `lib/db/repository/user-settings-repo.ts` | 新增 |
| Crypto | `lib/crypto/encrypt.ts` | 新增 |
| Registry | `domains/registry.ts` | 增强 |
| Manifest | `domains/*/manifest.yaml` | 扩展 |
| LLM Config | `lib/llm/config.ts` | 重构：消除硬编码 |
| LLM Action | `app/actions/llm-config.ts` | 新增：Server Action |
| Nexus | `nexus/intent-engine/shortcut-matcher.ts` | 新增 |
| Nexus | `nexus/intent-engine/template-parser.ts` | 修改：泛化为 parseDynamicForm |
| UI Shell | `components/shell/app-shell.tsx` | 修改 |
| UI Panel | `components/panel/left-panel.tsx` | 重写 |
| UI Panel | `components/panel/growth-menu.tsx` | 新增 |
| UI Panel | `components/panel/session-list.tsx` | 新增 |
| UI Main | `components/main/main-content.tsx` | 重写 |
| UI Main | `components/main/conversation-view.tsx` | 新增 |
| UI Main | `components/main/intent-input.tsx` | 修改 |
| UI Main | `components/main/resizable-splitter.tsx` | 新增 |
| UI Editor | `components/editor/dynamic-form.tsx` | **新增 (S2)** |
| UI Editor | `components/editor/action-confirm.tsx` | **新增 (S2)** |
| UI Editor | `components/editor/intent-form.tsx` | 修改 |
| UI Editor | `components/editor/markdown-editor.tsx` | 新增 |
| UI Editor | `components/editor/file-uploader.tsx` | 新增 |
| UI Settings | `components/settings/*.tsx` | 新增 |
| App | `app/page.tsx` | 重构 |
| Env | `.env.local` | 修改：新增 LLM_PROVIDERS 等变量 |

## 验证检查点

- [ ] `npm run build` 编译通过
- [ ] Registry 初始化无 shortcut 冲突
- [ ] 新增表迁移成功执行
- [ ] 左侧面板三个视图正常切换
- [ ] 主显示区状态切换无数据丢失
- [ ] 分裂视图拖拽流畅
- [ ] 快捷方式解析正确
- [ ] Markdown 上传解析闭环可用
- [ ] LLM 配置加密存储/解密可用
- [ ] 会话归档/恢复/删除生命周期正常
- [ ] **S1**: 修改 `.env.local` 中 `LLM_PROVIDERS` 后重启，前端正确反映变更
- [ ] **S2**: 点击每个域的创建类 action，显示动态生成的表单
- [ ] **S2**: 点击非创建类 action，显示确认界面（对象摘要 + 确认按钮）
- [ ] **S2**: 动态表单提交后正确创建/更新域对象
