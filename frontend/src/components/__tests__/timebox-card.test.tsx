/**
 * @file timebox-card.test
 * @brief [023.12] T8：TimeboxCard 按钮/徽章派生 + STATUS_STYLES 收敛测试
 *
 * 覆盖：
 * - planned / logged / cancelled 三种持久化状态渲染对应按钮
 * - 派生 displayStatus：planned+now 在窗口内→「进行中」徽章（额外 Badge）；planned+now 超过 endTime→「已超时」徽章
 * - 固定 now 用 vi.useFakeTimers + vi.setSystemTime 控制
 *
 * 注：T8 移除「开始 / 结束 / 记录」按钮，改为「打卡 / 取消 / 删除 / 回退 / 查看记录」。
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { render, screen, act } from "@testing-library/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TimeboxCard } from "@/domains/timebox/components/timebox-card";
import type { TimeboxSummary } from "@/usom/types/summaries";

/** 测试包装：TooltipProvider + TimeboxCard（notePreview 触发 Tooltip 必须有 provider） */
function renderInProvider(ui: React.ReactElement) {
  return render(<TooltipProvider>{ui}</TooltipProvider>);
}

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

const FROZEN_NOW = new Date("2026-05-03T09:00:00.000Z");

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN_NOW);
});
afterAll(() => {
  vi.useRealTimers();
});

describe("TimeboxCard", () => {
  it("渲染标题", () => {
    renderInProvider(<TimeboxCard timebox={createMockTimebox()} />);
    expect(screen.getByText("写代码")).toBeInTheDocument();
  });

  it("渲染时间范围", () => {
    renderInProvider(<TimeboxCard timebox={createMockTimebox()} />);
    const timeRange = screen.getByText(/\d{2}:\d{2}\s*[-–]\s*\d{2}:\d{2}/);
    expect(timeRange).toBeInTheDocument();
  });
});

describe("[023.12] T8 STATUS_STYLES 收敛 — 徽章", () => {
  it("planned 状态显示「已规划」徽章", () => {
    renderInProvider(<TimeboxCard timebox={createMockTimebox({ status: "planned" })} />);
    expect(screen.getByText("已规划")).toBeInTheDocument();
  });

  it("logged 状态显示「已记录」徽章", () => {
    renderInProvider(<TimeboxCard timebox={createMockTimebox({ status: "logged" })} />);
    expect(screen.getByText("已记录")).toBeInTheDocument();
  });

  it("cancelled 状态显示「已取消」徽章", () => {
    renderInProvider(<TimeboxCard timebox={createMockTimebox({ status: "cancelled" })} />);
    expect(screen.getByText("已取消")).toBeInTheDocument();
  });
});

describe("[023.12] T8 按钮分支", () => {
  it("planned 状态：渲染「打卡 / 取消 / 删除」三按钮", () => {
    renderInProvider(<TimeboxCard timebox={createMockTimebox({ status: "planned" })} />);
    expect(screen.getByRole("button", { name: "打卡" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "取消" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "删除" })).toBeInTheDocument();
  });

  it("logged 状态 + executionRecord：渲染「回退 / 查看记录」", () => {
    const tb = createMockTimebox({
      status: "logged",
      executionRecord: {
        mode: "detailed",
        notes: "完成",
      },
    });
    renderInProvider(<TimeboxCard timebox={tb} />);
    expect(screen.getByRole("button", { name: "回退" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "查看记录" })).toBeInTheDocument();
  });

  it("logged 状态无 executionRecord：仅渲染「回退」", () => {
    const tb = createMockTimebox({ status: "logged" });
    renderInProvider(<TimeboxCard timebox={tb} />);
    expect(screen.getByRole("button", { name: "回退" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "查看记录" })).toBeNull();
  });

  it("cancelled 状态：仅渲染「回退」", () => {
    renderInProvider(<TimeboxCard timebox={createMockTimebox({ status: "cancelled" })} />);
    expect(screen.getByRole("button", { name: "回退" })).toBeInTheDocument();
    // 不渲染「打卡 / 取消 / 删除 / 查看记录」
    expect(screen.queryByRole("button", { name: "打卡" })).toBeNull();
    expect(screen.queryByRole("button", { name: "取消" })).toBeNull();
    expect(screen.queryByRole("button", { name: "删除" })).toBeNull();
    expect(screen.queryByRole("button", { name: "查看记录" })).toBeNull();
  });
});

describe("[023.12] T8 派生 displayStatus 徽章", () => {
  it("planned + now < startTime：无 running/overtime 派生徽章（仅「已规划」）", () => {
    // FROZEN_NOW = 2026-05-03T09:00:00Z，startTime = 10:00
    renderInProvider(
      <TimeboxCard
        timebox={createMockTimebox({
          status: "planned",
          startTime: "2026-05-03T10:00:00Z",
          endTime: "2026-05-03T12:00:00Z",
        })}
      />,
    );
    expect(screen.getByText("已规划")).toBeInTheDocument();
    expect(screen.queryByText("进行中")).toBeNull();
    expect(screen.queryByText("已超时")).toBeNull();
  });

  it("planned + now 在窗口内：派生「进行中」徽章", () => {
    // 把系统时间推进到 startTime 之后
    const inWindow = new Date("2026-05-03T10:30:00.000Z");
    vi.setSystemTime(inWindow);
    renderInProvider(
      <TimeboxCard
        timebox={createMockTimebox({
          status: "planned",
          startTime: "2026-05-03T10:00:00Z",
          endTime: "2026-05-03T12:00:00Z",
        })}
      />,
    );
    // 「已规划」是 STATUS_STYLES 基础徽章 + 「进行中」派生徽章并存
    expect(screen.getByText("已规划")).toBeInTheDocument();
    expect(screen.getByText("进行中")).toBeInTheDocument();
  });

  it("planned + now > endTime：派生「已超时」徽章", () => {
    const past = new Date("2026-05-03T13:00:00.000Z");
    vi.setSystemTime(past);
    renderInProvider(
      <TimeboxCard
        timebox={createMockTimebox({
          status: "planned",
          startTime: "2026-05-03T10:00:00Z",
          endTime: "2026-05-03T12:00:00Z",
        })}
      />,
    );
    expect(screen.getByText("已规划")).toBeInTheDocument();
    expect(screen.getByText("已超时")).toBeInTheDocument();
  });

  it("logged 状态：派生 displayStatus 永远为 null（不显示 running/overtime 徽章）", () => {
    const inWindow = new Date("2026-05-03T10:30:00.000Z");
    vi.setSystemTime(inWindow);
    renderInProvider(
      <TimeboxCard
        timebox={createMockTimebox({
          status: "logged",
          startTime: "2026-05-03T10:00:00Z",
          endTime: "2026-05-03T12:00:00Z",
        })}
      />,
    );
    expect(screen.getByText("已记录")).toBeInTheDocument();
    expect(screen.queryByText("进行中")).toBeNull();
    expect(screen.queryByText("已超时")).toBeNull();
  });
});

describe("[023.12] T8 onAction 回调", () => {
  it("点击「打卡」触发 onAction(timeboxId, 'log')", () => {
    const onAction = vi.fn();
    renderInProvider(
      <TimeboxCard
        timebox={createMockTimebox({ status: "planned" })}
        onAction={onAction}
      />,
    );
    act(() => {
      screen.getByRole("button", { name: "打卡" }).click();
    });
    expect(onAction).toHaveBeenCalledWith("tb-001", "log");
  });

  it("点击「回退」触发 onAction(timeboxId, 'revert')", () => {
    const onAction = vi.fn();
    renderInProvider(
      <TimeboxCard
        timebox={createMockTimebox({ status: "cancelled" })}
        onAction={onAction}
      />,
    );
    act(() => {
      screen.getByRole("button", { name: "回退" }).click();
    });
    expect(onAction).toHaveBeenCalledWith("tb-001", "revert");
  });

  it("点击「删除」触发 onAction(timeboxId, 'delete')", () => {
    const onAction = vi.fn();
    renderInProvider(
      <TimeboxCard
        timebox={createMockTimebox({ status: "planned" })}
        onAction={onAction}
      />,
    );
    act(() => {
      screen.getByRole("button", { name: "删除" }).click();
    });
    expect(onAction).toHaveBeenCalledWith("tb-001", "delete");
  });
});
