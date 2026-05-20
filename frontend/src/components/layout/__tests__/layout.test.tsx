import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { TopNav } from "../top-nav";
import { MainContent } from "../main-content";
import { AppShell } from "../app-shell";
import { LeftPanel } from "../left-panel";

vi.mock("@/components/ui/sheet", () => ({
  Sheet: ({ children, open, onOpenChange }: { children: React.ReactNode; open: boolean; onOpenChange: (open: boolean) => void }) => (
    <div data-testid="sheet-mock" data-open={open}>
      <button data-testid="sheet-close" onClick={() => onOpenChange(false)}>关闭</button>
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

  it("传入 onMenuClick 时渲染菜单按钮", () => {
    const onMenuClick = vi.fn();
    render(<TopNav onMenuClick={onMenuClick} isPanelOpen={true} />);
    expect(screen.getByLabelText("收起 AI 面板")).toBeInTheDocument();
  });

  it("点击菜单按钮调用 onMenuClick", async () => {
    const user = userEvent.setup();
    const onMenuClick = vi.fn();
    render(<TopNav onMenuClick={onMenuClick} isPanelOpen={true} />);
    await user.click(screen.getByLabelText("收起 AI 面板"));
    expect(onMenuClick).toHaveBeenCalledTimes(1);
  });
});

describe("LeftPanel", () => {
  it("渲染 Home 按钮和 Tab", () => {
    const onTabChange = vi.fn();
    const onHomeClick = vi.fn();
    render(
      <LeftPanel activeTab="assistant" onTabChange={onTabChange} onHomeClick={onHomeClick}>
        <div>面板内容</div>
      </LeftPanel>
    );
    expect(screen.getByText("Home")).toBeInTheDocument();
    expect(screen.getByText("AI 助手")).toBeInTheDocument();
    expect(screen.getByText("成长领域")).toBeInTheDocument();
    expect(screen.getByText("面板内容")).toBeInTheDocument();
  });

  it("点击 Home 调用 onHomeClick", async () => {
    const user = userEvent.setup();
    const onHomeClick = vi.fn();
    render(
      <LeftPanel activeTab="assistant" onTabChange={vi.fn()} onHomeClick={onHomeClick}>
        <div>内容</div>
      </LeftPanel>
    );
    await user.click(screen.getByLabelText("回到主页"));
    expect(onHomeClick).toHaveBeenCalledTimes(1);
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
  it("渲染 TopNav 和内容", () => {
    render(
      <AppShell
        activeTab="assistant"
        onTabChange={vi.fn()}
        onHomeClick={vi.fn()}
        leftPanelContent={<div>左面板内容</div>}
        mainContent={<div>主内容区域</div>}
      />
    );
    expect(screen.getByText("Lifeware")).toBeInTheDocument();
    expect(screen.getAllByText("左面板内容").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("主内容区域").length).toBeGreaterThanOrEqual(1);
  });

  it("包含正确的 ARIA 角色", () => {
    render(
      <AppShell
        activeTab="assistant"
        onTabChange={vi.fn()}
        onHomeClick={vi.fn()}
        leftPanelContent={<div>左</div>}
        mainContent={<div>右</div>}
      />
    );
    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getAllByRole("main").length).toBeGreaterThanOrEqual(1);
  });
});
