import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TopNav } from "../top-nav";
import { AiPanel } from "../ai-panel";
import { MainContent } from "../main-content";
import { AppShell } from "../app-shell";

// 模拟 Sheet 组件以避免 Radix Portal 问题
vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ children, open, onOpenChange }: { children: React.ReactNode; open: boolean; onOpenChange: (open: boolean) => void }) => (
    <div data-testid="sheet-mock" data-open={open}>
      <button data-testid="sheet-close" onClick={() => onOpenChange(false)}>
        关闭
      </button>
      {children}
    </div>
  ),
  SheetContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sheet-content-mock">{children}</div>
  ),
  SheetTitle: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="sheet-title-mock">{children}</div>
  ),
}));

describe("TopNav", () => {
  it("渲染 Lifeware 品牌标题", () => {
    render(<TopNav />);
    expect(screen.getByText("Lifeware")).toBeInTheDocument();
  });

  it("包含 banner 角色", () => {
    render(<TopNav />);
    expect(screen.getByRole("banner")).toBeInTheDocument();
  });

  it("无 onMenuClick 时不渲染汉堡按钮", () => {
    render(<TopNav />);
    expect(screen.queryByLabelText("打开菜单")).not.toBeInTheDocument();
  });

  it("传入 onMenuClick 时渲染汉堡按钮", () => {
    const onMenuClick = vi.fn();
    render(<TopNav onMenuClick={onMenuClick} />);
    expect(screen.getByLabelText("打开菜单")).toBeInTheDocument();
  });

  it("点击汉堡按钮调用 onMenuClick", async () => {
    const user = userEvent.setup();
    const onMenuClick = vi.fn();
    render(<TopNav onMenuClick={onMenuClick} />);

    await user.click(screen.getByLabelText("打开菜单"));
    expect(onMenuClick).toHaveBeenCalledTimes(1);
  });
});

describe("AiPanel", () => {
  it("渲染子元素", () => {
    render(<AiPanel>测试内容</AiPanel>);
    expect(screen.getByText("测试内容")).toBeInTheDocument();
  });

  it("包含 complementary 角色", () => {
    render(<AiPanel>内容</AiPanel>);
    expect(screen.getByRole("complementary")).toBeInTheDocument();
  });
});

describe("MainContent", () => {
  it("渲染子元素", () => {
    render(<MainContent>主内容测试</MainContent>);
    expect(screen.getByText("主内容测试")).toBeInTheDocument();
  });

  it("包含 main 角色", () => {
    render(<MainContent>内容</MainContent>);
    expect(screen.getByRole("main")).toBeInTheDocument();
  });
});

describe("AppShell", () => {
  it("渲染 TopNav 和两个面板内容", () => {
    render(
      <AppShell
        aiPanel={<div>AI 面板内容</div>}
        mainContent={<div>主内容区域</div>}
      />
    );

    // TopNav 存在
    expect(screen.getByText("Lifeware")).toBeInTheDocument();
    // 内容在桌面端和移动端 Sheet 中各渲染一次
    expect(screen.getAllByText("AI 面板内容").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("主内容区域").length).toBeGreaterThanOrEqual(2);
  });

  it("包含正确的 ARIA 角色", () => {
    render(
      <AppShell
        aiPanel={<div>左</div>}
        mainContent={<div>右</div>}
      />
    );

    expect(screen.getByRole("banner")).toBeInTheDocument();
    // AiPanel 在桌面端和 Sheet 中都有 complementary 角色
    expect(screen.getAllByRole("complementary").length).toBeGreaterThanOrEqual(2);
    // main 角色同理
    expect(screen.getAllByRole("main").length).toBeGreaterThanOrEqual(2);
  });

  it("渲染汉堡菜单按钮", () => {
    render(
      <AppShell
        aiPanel={<div>AI</div>}
        mainContent={<div>内容</div>}
      />
    );

    expect(screen.getByLabelText("打开菜单")).toBeInTheDocument();
  });

  it("点击汉堡按钮打开 Sheet", async () => {
    const user = userEvent.setup();
    render(
      <AppShell
        aiPanel={<div>AI 面板内容</div>}
        mainContent={<div>主内容</div>}
      />
    );

    // 点击汉堡按钮
    await user.click(screen.getByLabelText("打开菜单"));

    // Sheet 应该变为 open 状态
    const sheet = screen.getByTestId("sheet-mock");
    expect(sheet).toHaveAttribute("data-open", "true");
  });

  it("Sheet 关闭后可以重新打开", async () => {
    const user = userEvent.setup();
    render(
      <AppShell
        aiPanel={<div>AI 面板</div>}
        mainContent={<div>内容</div>}
      />
    );

    // 打开
    await user.click(screen.getByLabelText("打开菜单"));
    expect(screen.getByTestId("sheet-mock")).toHaveAttribute("data-open", "true");

    // 关闭
    await user.click(screen.getByTestId("sheet-close"));
    expect(screen.getByTestId("sheet-mock")).toHaveAttribute("data-open", "false");
  });
});
