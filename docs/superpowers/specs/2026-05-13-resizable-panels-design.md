# 可拖拽分栏 — 设计文档

**日期**：2026-05-13
**分支**：005-task-management
**需求**：[006] 项目/任务管理界面宽度改为可调整

## 目标

为项目管理页和 OKR 管理页的左右两栏添加鼠标拖拽调整宽度能力，解决左边栏拥挤问题。

## 方案

自定义 `useResizablePanel` hook，不引入新依赖。

## 涉及文件

| 文件 | 操作 | 说明 |
|---|---|---|
| `frontend/src/hooks/use-resizable-panel.ts` | 新建 | 拖拽状态管理与鼠标事件处理 |
| `frontend/src/app/projects/projects-client.tsx` | 修改 | 替换固定 `w-80` 为动态宽度，添加分隔条 |
| `frontend/src/components/okr/okr-workspace.tsx` | 修改 | 替换固定 `w-80` 为动态宽度，添加分隔条 |

## 行为参数

| 参数 | 值 | 说明 |
|---|---|---|
| 分隔条样式 | 6px 宽，中间 ⋮ 图标，hover 变蓝 | 视觉引导明确 |
| 默认宽度 | 400px | 比原 320px 宽，缓解拥挤 |
| 最小宽度 | 200px | 保证目录可读 |
| 最大宽度 | 容器宽度的 50% | 防止左栏占满屏幕 |
| 持久化 | localStorage，每页独立 key | 跟随现有 AI 面板模式 |

## Hook 接口

```typescript
function useResizablePanel(options: {
  storageKey: string        // localStorage key
  minWidth?: number         // 默认 200
  maxWidth?: number         // 默认 0.5（小数表示容器百分比）
  defaultWidth?: number     // 默认 400
}): {
  leftWidth: number
  handleMouseDown: (e: React.MouseEvent) => void
  containerRef: RefObject<HTMLDivElement>
}
```

## 分隔条组件

不抽独立组件——仅是一个带 `onMouseDown` 和样式的 `<div>`，直接内联在两页的 JSX 中。

```tsx
<div
  className="w-[6px] cursor-col-resize hover:bg-primary/30 active:bg-primary/50 shrink-0 flex items-center justify-center border-x border-hairline"
  onMouseDown={handleMouseDown}
>
  <span className="text-[10px] text-muted-foreground select-none">⋮</span>
</div>
```

## 拖拽流程

1. **mousedown** 在分隔条上 → 设置 `dragging` 标记，锁定 body cursor 为 `col-resize`，禁用 user-select
2. **mousemove**（document 级别）→ 计算新宽度：`e.clientX - containerRect.left`，钳位到 [min, max]
3. **mouseup** → 清除标记，恢复 cursor 和 user-select，移除事件监听

## localStorage key

- 项目管理：`lw-projects-left-width`
- OKR 管理：`lw-okr-left-width`
