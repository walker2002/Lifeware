/**
 * @file cycle-create-drawer.test
 * @brief [024] T10 CycleCreateDrawer 测试
 *
 * 覆盖：
 *  1. 提交时调用 onCreateCycle 并触发 onOpenChange(false)
 *  2. 必填字段通过 placeholder/label 暴露
 */

import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent, waitFor } from "@testing-library/react"
import { CycleCreateDrawer } from "../cycle-create-drawer"

describe("[024] CycleCreateDrawer", () => {
  it("提交调用 onCreateCycle 并关闭", async () => {
    const onCreateCycle = vi.fn().mockResolvedValue({ id: "c1" })
    const onOpenChange = vi.fn()
    render(
      <CycleCreateDrawer
        open
        onOpenChange={onOpenChange}
        onCreateCycle={onCreateCycle}
      />
    )
    fireEvent.change(screen.getByPlaceholderText("例如：2026 Q3"), {
      target: { value: "2026 Q3" },
    })
    fireEvent.click(screen.getByText("创建周期"))
    await waitFor(() => expect(onCreateCycle).toHaveBeenCalled())
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
