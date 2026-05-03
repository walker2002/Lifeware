import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TimeboxList } from "../timebox-list";
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

describe("TimeboxList", () => {
  it("空列表显示空状态消息", () => {
    render(<TimeboxList timeboxes={[]} />);
    expect(screen.getByText("还没有时间盒")).toBeInTheDocument();
  });

  it("渲染多个时间盒卡片", () => {
    const timeboxes = [
      createMockTimebox({ id: "tb-001", title: "写代码" }),
      createMockTimebox({ id: "tb-002", title: "开会" }),
      createMockTimebox({ id: "tb-003", title: "阅读" }),
    ];

    render(<TimeboxList timeboxes={timeboxes} />);

    expect(screen.getByText("写代码")).toBeInTheDocument();
    expect(screen.getByText("开会")).toBeInTheDocument();
    expect(screen.getByText("阅读")).toBeInTheDocument();
  });

  it("单个时间盒也能正确渲染", () => {
    const timeboxes = [
      createMockTimebox({ id: "tb-001", title: "深度工作" }),
    ];

    render(<TimeboxList timeboxes={timeboxes} />);

    expect(screen.getByText("深度工作")).toBeInTheDocument();
    expect(screen.queryByText("还没有时间盒")).not.toBeInTheDocument();
  });
});
