import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IntentInput } from "@/components/intent-input";

describe("IntentInput", () => {
  it("渲染输入框和提交按钮", () => {
    render(<IntentInput onSubmit={vi.fn()} isLoading={false} />);

    expect(screen.getByPlaceholderText("描述你想做的事...")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "发送" })).toBeInTheDocument();
  });

  it("点击发送按钮时调用 onSubmit", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<IntentInput onSubmit={onSubmit} isLoading={false} />);

    const input = screen.getByPlaceholderText("描述你想做的事...");
    await user.type(input, "今天下午2点写代码2小时");
    await user.click(screen.getByRole("button", { name: "发送" }));

    expect(onSubmit).toHaveBeenCalledWith("今天下午2点写代码2小时");
  });

  it("按回车时调用 onSubmit", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<IntentInput onSubmit={onSubmit} isLoading={false} />);

    const input = screen.getByPlaceholderText("描述你想做的事...");
    await user.type(input, "早上9点开会1小时{Enter}");

    expect(onSubmit).toHaveBeenCalledWith("早上9点开会1小时");
  });

  it("加载时显示 spinner 并禁用按钮", () => {
    render(<IntentInput onSubmit={vi.fn()} isLoading={true} />);

    // 按钮应包含 "处理中" 文本
    expect(screen.getByText("处理中")).toBeInTheDocument();
    // 输入框应被禁用
    expect(screen.getByPlaceholderText("描述你想做的事...")).toBeDisabled();
  });

  it("设置 error 时显示错误信息", () => {
    render(
      <IntentInput
        onSubmit={vi.fn()}
        isLoading={false}
        error="AI 解析失败"
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("AI 解析失败");
  });

  it("空输入不触发提交", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<IntentInput onSubmit={onSubmit} isLoading={false} />);

    await user.click(screen.getByRole("button", { name: "发送" }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("纯空格输入不触发提交", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();

    render(<IntentInput onSubmit={onSubmit} isLoading={false} />);

    const input = screen.getByPlaceholderText("描述你想做的事...");
    await user.type(input, "   ");
    await user.click(screen.getByRole("button", { name: "发送" }));

    expect(onSubmit).not.toHaveBeenCalled();
  });
});
