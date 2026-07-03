import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TimeboxList } from "@/domains/timebox/components/timebox-list";
import { timeboxToEvent, itineraryToEvent } from "@/domains/timebox/components/schedule-event";
import type { TimeboxSummary, ItinerarySummary } from "@/usom/types/summaries";

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

function createMockItinerary(
  overrides: Partial<ItinerarySummary> = {},
): ItinerarySummary {
  return {
    id: "it-001",
    title: "散步",
    startTime: "2026-05-03T15:00:00Z",
    durationMin: 60,
    status: "scheduled",
    ...overrides,
  };
}

describe("TimeboxList", () => {
  it("空列表显示空状态消息", () => {
    render(<TimeboxList events={[]} />);
    expect(screen.getByText("还没有时间盒")).toBeInTheDocument();
  });

  it("渲染多个时间盒卡片", () => {
    const events = [
      timeboxToEvent(createMockTimebox({ id: "tb-001", title: "写代码" })),
      timeboxToEvent(createMockTimebox({ id: "tb-002", title: "开会" })),
      timeboxToEvent(createMockTimebox({ id: "tb-003", title: "阅读" })),
    ];

    render(<TimeboxList events={events} />);

    expect(screen.getByText("写代码")).toBeInTheDocument();
    expect(screen.getByText("开会")).toBeInTheDocument();
    expect(screen.getByText("阅读")).toBeInTheDocument();
  });

  it("单个时间盒也能正确渲染", () => {
    const events = [
      timeboxToEvent(createMockTimebox({ id: "tb-001", title: "深度工作" })),
    ];

    render(<TimeboxList events={events} />);

    expect(screen.getByText("深度工作")).toBeInTheDocument();
    expect(screen.queryByText("还没有时间盒")).not.toBeInTheDocument();
  });

  // [026] A3.2 IRON RULE 测试：纯 timebox-only 输入时渲染与改动前一致
  it("渲染 itinerary 行程锁定卡（kind 分支）", () => {
    const events = [
      timeboxToEvent(createMockTimebox({ id: "tb-001", title: "深度工作" })),
      itineraryToEvent(createMockItinerary({ id: "it-001", title: "公园散步" })),
    ];

    render(<TimeboxList events={events} />);

    expect(screen.getByText("深度工作")).toBeInTheDocument();
    expect(screen.getByText("公园散步")).toBeInTheDocument();
  });
});
