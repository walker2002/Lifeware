import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TimeboxCard } from "../timebox-card";
import type { TimeboxSummary } from "@/usom/types/summaries";

// ─── 测试数据 ───────────────────────────────────────────────────

function createMockTimebox(
  overrides: Partial<TimeboxSummary> = {},
): TimeboxSummary {
  return {
    id: "tb-001",
    title: "写代码",
    status: "planned",
    startTime: "2026-05-03T10:00:00Z",
    endTime: "2026-05-03T12:00:00Z",
    taskIds: [],
    habitIds: [],
    ...overrides,
  };
}

describe("TimeboxCard", () => {
  it("渲染标题", () => {
    render(<TimeboxCard timebox={createMockTimebox()} />);
    expect(screen.getByText("写代码")).toBeInTheDocument();
  });

  it("渲染时间范围", () => {
    render(<TimeboxCard timebox={createMockTimebox()} />);
    // toLocaleTimeString 在不同环境下可能输出不同格式，使用正则匹配
    const timeRange = screen.getByText(/\d{2}:\d{2}\s*[-–]\s*\d{2}:\d{2}/);
    expect(timeRange).toBeInTheDocument();
  });

  it("planned 状态显示正确徽章", () => {
    render(<TimeboxCard timebox={createMockTimebox({ status: "planned" })} />);
    expect(screen.getByText("已规划")).toBeInTheDocument();
  });

  it("running 状态显示正确徽章", () => {
    render(<TimeboxCard timebox={createMockTimebox({ status: "running" })} />);
    expect(screen.getByText("进行中")).toBeInTheDocument();
  });

  it("ended 状态显示正确徽章", () => {
    render(<TimeboxCard timebox={createMockTimebox({ status: "ended" })} />);
    expect(screen.getByText("已结束")).toBeInTheDocument();
  });

  it("overtime 状态显示正确徽章", () => {
    render(<TimeboxCard timebox={createMockTimebox({ status: "overtime" })} />);
    expect(screen.getByText("已超时")).toBeInTheDocument();
  });
});
