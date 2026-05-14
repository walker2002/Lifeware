# 可拖拽分栏 — 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为项目管理页和 OKR 管理页的左右两栏添加鼠标拖拽调整宽度能力

**Architecture:** 新建 `useResizablePanel` hook 封装拖拽状态管理与 localStorage 持久化逻辑，在两个页面的左右分栏之间插入分隔条 div 并绑定 hook 事件

**Tech Stack:** React 19, TypeScript, Vitest + @testing-library/react, localStorage

---

### Task 1: 创建 useResizablePanel hook

**Files:**
- Create: `frontend/src/hooks/use-resizable-panel.ts`
- Create: `frontend/src/hooks/__tests__/use-resizable-panel.test.ts`

- [ ] **Step 1: 编写测试文件**

```typescript
// frontend/src/hooks/__tests__/use-resizable-panel.test.ts
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest"
import { renderHook, act } from "@testing-library/react"
import { useResizablePanel } from "../use-resizable-panel"

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value }),
    removeItem: vi.fn((key: string) => { delete store[key] }),
    clear: vi.fn(() => { store = {} }),
  }
})()

Object.defineProperty(window, "localStorage", { value: localStorageMock })

beforeEach(() => {
  localStorageMock.clear()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe("useResizablePanel", () => {
  it("返回默认宽度（未存储时）", () => {
    const { result } = renderHook(() =>
      useResizablePanel({ storageKey: "test-key", defaultWidth: 400 })
    )
    expect(result.current.leftWidth).toBe(400)
  })

  it("从 localStorage 恢复已存储的宽度", () => {
    localStorage.setItem("test-key", "500")
    const { result } = renderHook(() =>
      useResizablePanel({ storageKey: "test-key", defaultWidth: 400 })
    )
    expect(result.current.leftWidth).toBe(500)
  })

  it("handleMouseDown 后通过 mousemove 更新宽度", () => {
    const { result } = renderHook(() =>
      useResizablePanel({ storageKey: "test-key", defaultWidth: 400, minWidth: 200 })
    )

    // 模拟 container ref
    const container = document.createElement("div")
    container.getBoundingClientRect = vi.fn(() => ({
      left: 0, right: 1200, width: 1200, top: 0, bottom: 800,
      x: 0, y: 0, height: 800, toJSON: () => {},
    }))
    Object.defineProperty(result.current, "containerRef", {
      value: { current: container },
      writable: true,
    })

    act(() => {
      result.current.handleMouseDown(
        new MouseEvent("mousedown", { clientX: 400 }) as unknown as React.MouseEvent
      )
    })

    act(() => {
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: 500 }))
    })

    expect(result.current.leftWidth).toBe(500)
    expect(localStorage.getItem("test-key")).toBe("500")
  })

  it("宽度不小于 minWidth", () => {
    const { result } = renderHook(() =>
      useResizablePanel({ storageKey: "test-key", defaultWidth: 400, minWidth: 200 })
    )

    const container = document.createElement("div")
    container.getBoundingClientRect = vi.fn(() => ({
      left: 0, right: 1200, width: 1200, top: 0, bottom: 800,
      x: 0, y: 0, height: 800, toJSON: () => {},
    }))
    Object.defineProperty(result.current, "containerRef", {
      value: { current: container },
      writable: true,
    })

    act(() => {
      result.current.handleMouseDown(
        new MouseEvent("mousedown", { clientX: 400 }) as unknown as React.MouseEvent
      )
    })

    act(() => {
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: 100 }))
    })

    expect(result.current.leftWidth).toBe(200)
  })

  it("宽度不超过 maxWidth（百分比模式）", () => {
    const { result } = renderHook(() =>
      useResizablePanel({ storageKey: "test-key", defaultWidth: 400, maxWidth: 0.5 })
    )

    const container = document.createElement("div")
    container.getBoundingClientRect = vi.fn(() => ({
      left: 0, right: 1200, width: 1200, top: 0, bottom: 800,
      x: 0, y: 0, height: 800, toJSON: () => {},
    }))
    Object.defineProperty(result.current, "containerRef", {
      value: { current: container },
      writable: true,
    })

    act(() => {
      result.current.handleMouseDown(
        new MouseEvent("mousedown", { clientX: 400 }) as unknown as React.MouseEvent
      )
    })

    act(() => {
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: 700 }))
    })

    expect(result.current.leftWidth).toBe(600) // 1200 * 0.5
  })

  it("mouseup 后停止拖拽", () => {
    const { result } = renderHook(() =>
      useResizablePanel({ storageKey: "test-key", defaultWidth: 400 })
    )

    const container = document.createElement("div")
    container.getBoundingClientRect = vi.fn(() => ({
      left: 0, right: 1200, width: 1200, top: 0, bottom: 800,
      x: 0, y: 0, height: 800, toJSON: () => {},
    }))
    Object.defineProperty(result.current, "containerRef", {
      value: { current: container },
      writable: true,
    })

    act(() => {
      result.current.handleMouseDown(
        new MouseEvent("mousedown", { clientX: 400 }) as unknown as React.MouseEvent
      )
    })

    act(() => {
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: 500 }))
    })

    act(() => {
      window.dispatchEvent(new MouseEvent("mouseup"))
    })

    // 之后的 mousemove 不应改变宽度
    act(() => {
      window.dispatchEvent(new MouseEvent("mousemove", { clientX: 700 }))
    })

    expect(result.current.leftWidth).toBe(500)
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd frontend && npx vitest run src/hooks/__tests__/use-resizable-panel.test.ts
```

预期：所有测试 FAIL，报 "module not found"

- [ ] **Step 3: 编写 hook 实现**

```typescript
// frontend/src/hooks/use-resizable-panel.ts
"use client"

import { useState, useCallback, useEffect, useRef } from "react"

const DEFAULT_MIN_WIDTH = 200
const DEFAULT_MAX_WIDTH = 0.5
const DEFAULT_WIDTH = 400

interface UseResizablePanelOptions {
  storageKey: string
  minWidth?: number
  maxWidth?: number
  defaultWidth?: number
}

export function useResizablePanel(options: UseResizablePanelOptions) {
  const {
    storageKey,
    minWidth = DEFAULT_MIN_WIDTH,
    maxWidth = DEFAULT_MAX_WIDTH,
    defaultWidth = DEFAULT_WIDTH,
  } = options

  const [leftWidth, setLeftWidth] = useState(() => {
    if (typeof window === "undefined") return defaultWidth
    const stored = localStorage.getItem(storageKey)
    return stored ? Number(stored) : defaultWidth
  })

  const containerRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)

  useEffect(() => {
    localStorage.setItem(storageKey, String(leftWidth))
  }, [leftWidth, storageKey])

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      draggingRef.current = true
      document.body.style.cursor = "col-resize"
      document.body.style.userSelect = "none"

      const handleMouseMove = (e: MouseEvent) => {
        if (!draggingRef.current || !containerRef.current) return
        const rect = containerRef.current.getBoundingClientRect()
        let newWidth = e.clientX - rect.left

        const maxPx =
          maxWidth < 1 ? rect.width * maxWidth : maxWidth

        newWidth = Math.max(minWidth, Math.min(newWidth, maxPx))
        setLeftWidth(Math.round(newWidth))
      }

      const handleMouseUp = () => {
        draggingRef.current = false
        document.body.style.cursor = ""
        document.body.style.userSelect = ""
        document.removeEventListener("mousemove", handleMouseMove)
        document.removeEventListener("mouseup", handleMouseUp)
      }

      document.addEventListener("mousemove", handleMouseMove)
      document.addEventListener("mouseup", handleMouseUp)
    },
    [minWidth, maxWidth]
  )

  return { leftWidth, handleMouseDown, containerRef }
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd frontend && npx vitest run src/hooks/__tests__/use-resizable-panel.test.ts
```

预期：6 个测试全部 PASS

- [ ] **Step 5: 提交**

```bash
cd frontend && git add src/hooks/use-resizable-panel.ts src/hooks/__tests__/use-resizable-panel.test.ts
git commit -m "feat(hooks): 添加 useResizablePanel hook，支持拖拽调整分栏宽度"
```

---

### Task 2: 集成到项目管理页面

**Files:**
- Modify: `frontend/src/app/projects/projects-client.tsx`

- [ ] **Step 1: 修改 projects-client.tsx**

将现有的两栏布局改为使用 `useResizablePanel` hook 和分隔条。

修改内容：

1. 添加 import：
```typescript
import { useRef } from "react"  // 在现有 useState import 中增加 useRef
import { useResizablePanel } from "@/hooks/use-resizable-panel"
```

2. 在组件顶部（useState 之后）添加 hook 调用：
```typescript
const { leftWidth, handleMouseDown, containerRef } = useResizablePanel({
  storageKey: "lw-projects-left-width",
})
```

3. 将左侧栏的 `w-80 shrink-0` 替换为动态 style：
```tsx
{/* 左侧项目/任务树 */}
<div
  ref={containerRef as React.RefObject<HTMLDivElement>}
  className="flex h-full"
>
  <div
    className="shrink-0 border-r border-hairline bg-canvas flex flex-col"
    style={{ width: leftWidth }}
  >
```

注意：原来的外层 `<div className="flex h-full">` 需要调整——`containerRef` 需要作为外层 flex 容器来获取容器宽度。现在结构变为：

```tsx
<div ref={containerRef as React.RefObject<HTMLDivElement>} className="flex h-full">
  {/* 左侧项目/任务树 */}
  <div
    className="shrink-0 border-hairline bg-canvas flex flex-col"
    style={{ width: leftWidth }}
  >
    <ProjectTree ... />
    <div className="border-t ..."> ... </div>
  </div>

  {/* 分隔条 */}
  <div
    className="w-[6px] cursor-col-resize hover:bg-primary/30 active:bg-primary/50 shrink-0 flex items-center justify-center border-x border-hairline"
    onMouseDown={handleMouseDown}
  >
    <span className="text-[10px] text-muted-foreground select-none leading-none">⋮</span>
  </div>

  {/* 右侧详情面板 */}
  <div className="flex-1 min-w-0 bg-canvas">
    <DetailPanel ... />
  </div>
</div>
```

完整修改后的文件结构（仅显示 JSX 返回部分的关键变化）：

原本第 84-144 行的 `return` 语句中：
- 第 84 行 `<div className="flex h-full">` → 改为 `<div ref={containerRef as React.RefObject<HTMLDivElement>} className="flex h-full">`
- 第 86 行左侧 div 的 `w-80 shrink-0 border-r` → 改为 `shrink-0`，width 通过 `style={{ width: leftWidth }}` 控制
- 在第 115 行 `</div>`（左侧栏结束）和 第 118 行（右侧栏开始）之间插入分隔条 div
- 第 118 行保持不变

- [ ] **Step 2: 验证构建通过**

```bash
cd frontend && npx tsc --noEmit
```

预期：无类型错误

- [ ] **Step 3: 提交**

```bash
cd frontend && git add src/app/projects/projects-client.tsx
git commit -m "feat(projects): 项目管理页左右分栏支持拖拽调整宽度"
```

---

### Task 3: 集成到 OKR 管理页面

**Files:**
- Modify: `frontend/src/components/okr/okr-workspace.tsx`

- [ ] **Step 1: 修改 okr-workspace.tsx**

与 Task 2 相同模式，将 OKR 工作区的两栏改为可拖拽。

修改内容：

1. 添加 import（第 1-3 行区域）：
```typescript
import { useState, useCallback, useRef } from "react"  // 增加 useRef
import { useResizablePanel } from "@/hooks/use-resizable-panel"
```

2. 在组件顶部（第 19 行，useOKRs 之后）添加 hook 调用：
```typescript
const { leftWidth, handleMouseDown, containerRef } = useResizablePanel({
  storageKey: "lw-okr-left-width",
})
```

3. 修改 JSX 返回部分（第 137-184 行）：

```tsx
return (
  <div ref={containerRef as React.RefObject<HTMLDivElement>} className="flex h-full">
    <div
      className="shrink-0 overflow-y-auto"
      style={{ width: leftWidth }}
    >
      <OKRDirectory
        objectives={filteredObjectives}
        selectedId={selectedId}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        onSelect={handleSelect}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onCreate={handleCreate}
        onImport={() => setImportOpen(true)}
      />
    </div>

    {/* 分隔条 */}
    <div
      className="w-[6px] cursor-col-resize hover:bg-primary/30 active:bg-primary/50 shrink-0 flex items-center justify-center border-x border-hairline"
      onMouseDown={handleMouseDown}
    >
      <span className="text-[10px] text-muted-foreground select-none leading-none">⋮</span>
    </div>

    <div className="flex-1 overflow-y-auto">
      {mode === "import" && importResult ? (
        <OKRImportPanel ... />
      ) : (
        <OKRPanel ... />
      )}
    </div>
    <OKRImportDialog ... />
  </div>
)
```

具体替换：
- 第 138 行：`<div className="flex h-full">` → 添加 `ref={containerRef as React.RefObject<HTMLDivElement>}`
- 第 139 行：`w-80 shrink-0 border-r` → 移除 `w-80` 和 `border-r`，改为 `style={{ width: leftWidth }}`
- 在第 151 行 `</div>`（左侧栏闭合）和第 152 行右侧栏之间插入分隔条
- 第 152 行保持不变

- [ ] **Step 2: 验证构建通过**

```bash
cd frontend && npx tsc --noEmit
```

预期：无类型错误

- [ ] **Step 3: 提交**

```bash
cd frontend && git add src/components/okr/okr-workspace.tsx
git commit -m "feat(okr): OKR 管理页左右分栏支持拖拽调整宽度"
```
