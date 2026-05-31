"use client";

import { useState, type FormEvent } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

/** 表单提交的字段值 */
export interface TemplateFormFields {
  title: string;
  startTime: string;
  duration: number;
}

/** 验证错误映射 */
interface ValidationErrors {
  title?: string;
  startTime?: string;
  duration?: string;
}

interface IntentFormProps {
  /** 提交回调，接收已验证的表单字段和可选的确认标志 */
  onSubmit: (fields: TemplateFormFields, confirmed?: boolean) => void;
  /** 是否正在加载 */
  isLoading: boolean;
  /** 服务端错误信息 */
  error?: string;
}

/**
 * IntentForm — 表单模式的意图输入组件
 *
 * 提供标题、开始时间、时长三个字段，带前端验证。
 * 验证规则：所有字段必填，时长范围 5-480 分钟。
 */
export function IntentForm({ onSubmit, isLoading, error }: IntentFormProps) {
  const [title, setTitle] = useState("");
  const [startTime, setStartTime] = useState("");
  const [duration, setDuration] = useState("");
  const [validationErrors, setValidationErrors] = useState<ValidationErrors>(
    {},
  );

  /** 前端字段验证 */
  function validate(): ValidationErrors {
    const errors: ValidationErrors = {};

    if (!title.trim()) {
      errors.title = "请输入标题";
    }

    if (!startTime) {
      errors.startTime = "请选择开始时间";
    }

    if (!duration) {
      errors.duration = "请输入时长";
    } else {
      const num = Number(duration);
      if (isNaN(num) || num < 5) {
        errors.duration = "最短 5 分钟";
      } else if (num > 480) {
        errors.duration = "最长 480 分钟";
      }
    }

    return errors;
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (isLoading) return;

    const errors = validate();
    setValidationErrors(errors);

    // 有验证错误则不提交
    if (Object.keys(errors).length > 0) return;

    onSubmit({
      title: title.trim(),
      startTime,
      duration: Number(duration),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3" noValidate>
      {/* 标题 */}
      <div className="flex flex-col gap-1">
        <Label htmlFor="intent-title" className="text-sm text-ink">
          标题
        </Label>
        <Input
          id="intent-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="你要做什么？"
          disabled={isLoading}
          aria-invalid={!!validationErrors.title}
          className="font-body"
        />
        {validationErrors.title && (
          <p className="text-xs text-destructive" role="alert">
            {validationErrors.title}
          </p>
        )}
      </div>

      {/* 开始时间 */}
      <div className="flex flex-col gap-1">
        <Label htmlFor="intent-start-time" className="text-sm text-ink">
          开始时间
        </Label>
        <Input
          id="intent-start-time"
          type="datetime-local"
          value={startTime}
          onChange={(e) => setStartTime(e.target.value)}
          disabled={isLoading}
          aria-invalid={!!validationErrors.startTime}
          className="font-body"
        />
        {validationErrors.startTime && (
          <p className="text-xs text-destructive" role="alert">
            {validationErrors.startTime}
          </p>
        )}
      </div>

      {/* 时长 */}
      <div className="flex flex-col gap-1">
        <Label htmlFor="intent-duration" className="text-sm text-ink">
          时长（分钟）
        </Label>
        <Input
          id="intent-duration"
          type="number"
          min={5}
          max={480}
          value={duration}
          onChange={(e) => setDuration(e.target.value)}
          placeholder="5 - 480"
          disabled={isLoading}
          aria-invalid={!!validationErrors.duration}
          className="font-body"
        />
        {validationErrors.duration && (
          <p className="text-xs text-destructive" role="alert">
            {validationErrors.duration}
          </p>
        )}
      </div>

      {/* 提交按钮 */}
      <Button type="submit" disabled={isLoading} className="mt-1">
        {isLoading ? (
          <span className="flex items-center gap-1">
            <Loader2 className="size-4 animate-spin" />
            处理中
          </span>
        ) : (
          "创建时间盒"
        )}
      </Button>

      {/* 服务端错误 */}
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}
