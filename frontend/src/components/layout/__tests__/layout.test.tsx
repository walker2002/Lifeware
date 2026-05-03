import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { TopNav } from "../top-nav";
import { AiPanel } from "../ai-panel";
import { MainContent } from "../main-content";
import { AppShell } from "../app-shell";

describe("TopNav", () => {
  it("渲染 Lifeware 品牌标题", () => {
    render(<TopNav />);
    expect(screen.getByText("Lifeware")).toBeInTheDocument();
  });

  it("包含 banner 角色", () => {
    render(<TopNav />);
    expect(screen.getByRole("banner")).toBeInTheDocument();
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
  it("渲染 TopNav 和两个面板", () => {
    render(
      <AppShell
        aiPanel={<div>AI 面板内容</div>}
        mainContent={<div>主内容区域</div>}
      />
    );

    // TopNav 存在
    expect(screen.getByText("Lifeware")).toBeInTheDocument();
    // AiPanel 内容
    expect(screen.getByText("AI 面板内容")).toBeInTheDocument();
    // MainContent 内容
    expect(screen.getByText("主内容区域")).toBeInTheDocument();
  });

  it("包含正确的 ARIA 角色", () => {
    render(
      <AppShell
        aiPanel={<div>左</div>}
        mainContent={<div>右</div>}
      />
    );

    expect(screen.getByRole("banner")).toBeInTheDocument();
    expect(screen.getByRole("complementary")).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
  });
});
