/**
 * @file intent-input
 * @brief 意图输入组件
 * 
 * 用户输入自然语言文本，点击提交或按回车调用 onSubmit。
 * 加载时按钮显示 spinner，错误时在输入框下方显示错误信息。
 */

"use client";

import { useState, type FormEvent, type KeyboardEvent } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Send } from "lucide-react";

/**
 * IntentInput 组件属性
 */
interface IntentInputProps {
  /** 提交回调，接收用户原始输入和可选的确认标志 */
  onSubmit: (rawInput: string, confirmed?: boolean) => void;
  /** 是否正在加载 */
  isLoading: boolean;
  /** 错误信息，设置时显示在输入框下方 */
  error?: string;
}

export function IntentInput({ onSubmit, isLoading, error }: IntentInputProps) {
  const [inputValue, setInputValue] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = inputValue.trim();
    if (!trimmed || isLoading) return;
    onSubmit(trimmed);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      const trimmed = inputValue.trim();
      if (!trimmed || isLoading) return;
      onSubmit(trimmed);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Input
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="描述你想做的事..."
          disabled={isLoading}
          className="font-body"
          aria-label="意图输入"
        />
        <Button type="submit" disabled={isLoading || !inputValue.trim()}>
          {isLoading ? (
            <span className="flex items-center gap-1">
              <Loader2 className="size-4 animate-spin" />
              处理中
            </span>
          ) : (
            <span className="flex items-center gap-1">
              <Send className="size-4" />
              发送
            </span>
          )}
        </Button>
      </div>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
