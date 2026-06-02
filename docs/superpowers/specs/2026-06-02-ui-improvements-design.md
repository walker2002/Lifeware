# UI 改进设计文档

**日期**: 2026-06-02
**状态**: 已批准
**涵盖需求**: `mydocs/dev/当前开发内容.md` [001] [002] [003]

---

## 概述

本文档定义三项 UI 改进的设计方案，涵盖 CN-UI 对话状态持久化、确认对话框遮罩优化和 Domain Page Banner 功能。三项改动相互独立，可并行实施。

---

## [001] CN-UI 过期状态后端持久化

### 问题

用户对 CN-UI surface 执行"保存"或"取消"后，刷新页面这些 surface 仍显示为可编辑状态。原因是 surface 状态仅存于 React state（内存），刷新即丢失。

### 方案：Session stateSnapshot 持久化

#### 数据流

```
用户点击"保存"或"取消"
       ↓
CnuiSurfaceWrapper → lifecycleActions.requestSave / requestCancel
       ↓
use-cnui-lifecycle 更新本地 state → 调用 onStateChange 回调
       ↓
useConversation.handleSurfaceStateChange → 更新本地 messages + 调用 saveSurfaceOutcome
       ↓
后端 saveSurfaceOutcome → 写入 session.stateSnapshot.cnuiSurfaceStates
       ↓
页面刷新
       ↓
ConversationView mount → 调用 getSessionSurfaceOutcomes(sessionId)
       ↓
合并后端恢复的状态与消息中的状态 → useCnuiLifecycle 初始化
       ↓
已完成的 surface → CnuiSurfaceWrapper 渲染只读视图（现有 isDone 分支）
```

#### 改动范围

| 文件 | 改动 |
|---|---|
| `app/actions/session.ts` | 新增 `saveSurfaceOutcome` 和 `getSessionSurfaceOutcomes` server actions |
| `hooks/use-conversation.ts` | `handleSurfaceStateChange` 改为 async，调用 `saveSurfaceOutcome` 持久化 |
| `components/layout/conversation-view.tsx` | 新增 `sessionId` prop，mount 时调用 `getSessionSurfaceOutcomes` 恢复状态 |
| `app/page.tsx` | 向 `ConversationView` 传递 `sessionId` |

#### 关键设计决策

1. **存储方式**：利用 `ai_sessions` 表已有的 `stateSnapshot`（jsonb）字段，在 `cnuiSurfaceStates` 键下存储 surface 最终状态。此字段原本用于会话状态快照，与 surface 状态的"会话级恢复"语义一致。
2. **未采用 session message 方案的原因**：session message（Memory Framework L1）是追加式消息流，适合对话内容记录；surface 状态需要按 surfaceId 覆盖更新，stateSnapshot 的键值结构更适合。两者都是合法的 session 数据存储方式，stateSnapshot 在实现上更简洁。
3. **前端恢复时机**：`ConversationView` 的 `useEffect` 在 mount / sessionId 变化时查询一次，与 `messages` 中提取的初始状态合并（后端状态优先级更高）。
4. **不新建数据库表**：复用 `ai_sessions.stateSnapshot` 字段。

#### 宪章合规性

- 符合 **III. Single-Writer Invariant**：session 写入通过 Memory Framework API。
- 符合 **VII. Bridge Layer Readiness**：Nexus 方法签名不依赖 HTTP 上下文。

---

## [002] CN-UI 确认对话框半透明遮罩

### 问题

暗色模式下 `--scrim: rgba(0,0,0,0.7)` 叠加在对话面板 `bg-surface-soft`（#1f1e1b）上，视觉上接近纯黑。Page 层的确认对话框因背景较浅，同样的遮罩看起来正常。

### 方案：CN-UI 上下文使用独立遮罩 token

#### 改动范围

| 文件 | 改动 |
|---|---|
| `app/globals.css` | 新增 CSS 变量 `--scrim-cnui` |
| `components/cnui/cnui-confirm-dialog.tsx` | overlay className 使用 `bg-[var(--scrim-cnui)]` 替代默认 `bg-scrim` |

#### 具体实现

**globals.css 新增：**

```css
:root {
  --scrim-cnui: rgba(20,20,19,0.3);
}
.dark {
  --scrim-cnui: rgba(0,0,0,0.4);
}
```

**CnuiConfirmDialog 修改：**

通过 `AlertDialogOverlay` 的 className 覆盖默认 `bg-scrim` 为 `bg-[var(--scrim-cnui)]`。

#### 设计决策

1. **不修改全局 `--scrim`**：Page 层的半透明效果正常，只针对 CN-UI 上下文调整。
2. **新增独立 token**：`--scrim-cnui` 作为 CN-UI 专属遮罩色，不影响其他 AlertDialog 使用场景。

#### UI-DESIGN-SPEC 合规

- 使用 CSS 变量 token（C-01）
- 不引入硬编码颜色值（C-07）

---

## [003] Domain Page Banner

### 问题

部分 Domain Page 缺少顶部 banner，视觉效果不够美观。

### 方案：共享 PageBanner 组件 + 文件名前缀匹配

#### 组件接口

```typescript
interface PageBannerProps {
  /** Domain 标识，用于匹配 banner 图片前缀。home → banner-lifeware* */
  domainId: string
  /** 页面标题 */
  title: string
}
```

#### 图片匹配逻辑

定义静态映射 `DOMAIN_BANNER_MAP: Record<string, string[]>`，列出每个 domainId 可用的图片数组：

```
domainId = "habits" → ["/banner-habits1.png", "/banner-habits2.png", "/banner-habits3.png"]
domainId = "home"   → ["/banner-lifeware1.png", "/banner-lifeware2.png"]
domainId = "okrs"   → ["/banner-OKRs1.png", "/banner-OKRs2.png"]
domainId = "tasks"  → ["/banner-tasks1.png", "/banner-tasks2.png", "/banner-tasks3.png"]
domainId = "timebox" → ["/banner-timebox1.png", "/banner-timebox2.png"]
```

组件 mount 时通过 `useEffect` + `Math.random()` 选一张（client-side only，避免 SSR 水合不匹配）。

#### 标题来源

- **当前实现**：标题通过 `title` prop 传入，由调用方决定。
- **Home 页面**：固定标题为 `"我的时间盒"`。
- **Habits 页面**：固定标题为 `"习惯管理"`。
- **未来改进**：从 Domain manifest 注册信息中读取 `displayName`，通过 domain registry accessor 方法获取。当前 manifest 尚未包含 `displayName` 字段，待后续补充后迁移。

#### 样式规格

| 属性 | 值 |
|---|---|
| 宽度 | 100% 自适应容器 |
| 高度 | 固定 80px |
| 图片渲染 | `object-cover`，等比例裁剪填满 |
| 标题位置 | 图片下方 |
| 标题样式 | 使用 `text-ink` 等 design token |

#### 改动范围

| 文件 | 改动 |
|---|---|
| `components/layout/page-banner.tsx` | **新建**：共享 PageBanner 组件 |
| `domains/habits/pages/HabitListPage.tsx` 等 | 引入 `<PageBanner>` |
| `app/page.tsx`（Home） | 引入 `<PageBanner domainId="home" title="我的时间盒" />` |
| Domain manifest | 新增 `displayName` 字段 |

#### 可扩展性

新 Domain 接入只需三步：
1. 在 `public/` 放入 `banner-{domainId}*.png` 图片
2. 在 Domain manifest 中声明 `displayName`
3. 在 Page 组件中引入 `<PageBanner domainId="..." title={...} />`

#### 宪章合规性

- 标题通过 domain registry accessor 读取，不在前端硬编码（Manifest Runtime Consumption）。
- 组件使用 UI-DESIGN-SPEC 定义的 CSS 变量 token（C-01）。

#### UI-DESIGN-SPEC 合规

- 颜色使用 CSS 变量令牌（C-01）
- 组件符合现有 Page 布局规范（C-04）
- 响应式宽度自适应（C-05）

---

## 实施顺序建议

1. **[002]** 遮罩修复（最简单，独立改动，可立即验证）
2. **[003]** Page Banner（纯展示组件，无后端依赖）
3. **[001]** CN-UI 状态持久化（涉及后端改动，复杂度最高）
