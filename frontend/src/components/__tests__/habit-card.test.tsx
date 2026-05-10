import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { HabitCard } from "../habit-card"

describe("HabitCard", () => {
  const baseProps = {
    title: "晨跑",
    trackable: true,
    defaultTime: "07:00",
    earliestTime: "06:30",
    latestStartTime: "08:00",
    defaultDuration: 30,
    minDuration: 15,
    streak: 0,
  }

  describe("草稿习惯激活按钮", () => {
    it("草稿状态显示「激活」按钮", () => {
      render(<HabitCard {...baseProps} status="draft" onStatusChange={() => {}} />)
      expect(screen.getByRole("button", { name: "激活" })).toBeInTheDocument()
    })

    it("草稿状态同时显示「编辑」和「删除」按钮", () => {
      render(
        <HabitCard
          {...baseProps}
          status="draft"
          onEdit={() => {}}
          onStatusChange={() => {}}
        />,
      )
      expect(screen.getByRole("button", { name: "激活" })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: "编辑" })).toBeInTheDocument()
      expect(screen.getByRole("button", { name: "删除" })).toBeInTheDocument()
    })

    it("点击「激活」按钮调用 onStatusChange('activate')", async () => {
      const onStatusChange = vi.fn()
      render(
        <HabitCard
          {...baseProps}
          status="draft"
          onStatusChange={onStatusChange}
        />,
      )
      await userEvent.click(screen.getByRole("button", { name: "激活" }))
      expect(onStatusChange).toHaveBeenCalledWith("activate")
    })

    it("活跃状态不显示「激活」按钮", () => {
      render(
        <HabitCard
          {...baseProps}
          status="active"
          onStatusChange={() => {}}
        />,
      )
      expect(screen.queryByRole("button", { name: "激活" })).not.toBeInTheDocument()
    })
  })
})
