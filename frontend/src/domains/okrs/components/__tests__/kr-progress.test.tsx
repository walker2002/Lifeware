/**
 * @file kr-progress.test
 * @brief [024] G2 KRProgress 信心度 UI 测试
 *
 * 覆盖：
 *  1. 显示信心百分比（70%）
 *  2. editable + onConfidenceUpdate 时点击「更新信心」进入编辑态，初始值 70
 */

import { describe, it, expect, vi } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { KRProgress } from "../kr-progress"

describe("[024] KRProgress 信心", () => {
  const kr = {
    id: "kr1",
    title: "KR1",
    targetValue: 100,
    currentValue: 40,
    unit: "%",
    confidence: 70,
    status: "active",
    progressRate: 0.4,
    objectiveId: "o1",
    createdAt: "",
    updatedAt: "",
  } as any

  it("显示信心百分比", () => {
    render(<KRProgress kr={kr} />)
    expect(screen.getByText(/70%/)).toBeInTheDocument()
  })

  it("editable 时点击进入信心编辑", () => {
    render(<KRProgress kr={kr} editable onConfidenceUpdate={vi.fn()} />)
    fireEvent.click(screen.getByText("更新信心"))
    expect(screen.getByDisplayValue("70")).toBeInTheDocument()
  })
})