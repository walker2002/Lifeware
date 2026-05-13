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

// 辅助函数：创建模拟容器并注入 containerRef
function setupContainer(result: { current: ReturnType<typeof useResizablePanel> }) {
  const container = document.createElement("div")
  container.getBoundingClientRect = vi.fn(() => ({
    left: 0, right: 1200, width: 1200, top: 0, bottom: 800,
    x: 0, y: 0, height: 800, toJSON: () => ({}),
  }))
  // 直接设置 ref 的 current
  ;(result.current as any).containerRef.current = container
  return container
}

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

    setupContainer(result)

    act(() => {
      result.current.handleMouseDown(
        new MouseEvent("mousedown", { clientX: 400 }) as unknown as React.MouseEvent
      )
    })

    act(() => {
      document.dispatchEvent(new MouseEvent("mousemove", { clientX: 500 }))
    })

    expect(result.current.leftWidth).toBe(500)
    expect(localStorage.getItem("test-key")).toBe("500")
  })

  it("宽度不小于 minWidth", () => {
    const { result } = renderHook(() =>
      useResizablePanel({ storageKey: "test-key", defaultWidth: 400, minWidth: 200 })
    )

    setupContainer(result)

    act(() => {
      result.current.handleMouseDown(
        new MouseEvent("mousedown", { clientX: 400 }) as unknown as React.MouseEvent
      )
    })

    act(() => {
      document.dispatchEvent(new MouseEvent("mousemove", { clientX: 100 }))
    })

    expect(result.current.leftWidth).toBe(200)
  })

  it("宽度不超过 maxWidth（百分比模式）", () => {
    const { result } = renderHook(() =>
      useResizablePanel({ storageKey: "test-key", defaultWidth: 400, maxWidth: 0.5 })
    )

    setupContainer(result)

    act(() => {
      result.current.handleMouseDown(
        new MouseEvent("mousedown", { clientX: 400 }) as unknown as React.MouseEvent
      )
    })

    act(() => {
      document.dispatchEvent(new MouseEvent("mousemove", { clientX: 700 }))
    })

    expect(result.current.leftWidth).toBe(600) // 1200 * 0.5
  })

  it("mouseup 后停止拖拽", () => {
    const { result } = renderHook(() =>
      useResizablePanel({ storageKey: "test-key", defaultWidth: 400 })
    )

    setupContainer(result)

    act(() => {
      result.current.handleMouseDown(
        new MouseEvent("mousedown", { clientX: 400 }) as unknown as React.MouseEvent
      )
    })

    act(() => {
      document.dispatchEvent(new MouseEvent("mousemove", { clientX: 500 }))
    })

    act(() => {
      document.dispatchEvent(new MouseEvent("mouseup"))
    })

    // 之后的 mousemove 不应改变宽度
    act(() => {
      document.dispatchEvent(new MouseEvent("mousemove", { clientX: 700 }))
    })

    expect(result.current.leftWidth).toBe(500)
  })
})
