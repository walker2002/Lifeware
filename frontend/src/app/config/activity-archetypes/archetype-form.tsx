/**
 * @file archetype-form
 * @brief Activity Archetype 新增/编辑表单（Dialog 内嵌）
 *
 * 字段：
 * - l1Category（L1 7 类 Select）
 * - l2Name（Input）
 * - energyCost 4 维（physical / mental / emotional / creative，1-10）
 * - activityLabel 6 维（enjoyment / typicalDuration / interruptTolerance /
 *   environment / location / parallelizable）
 *
 * 提交：createArchetype 或 updateArchetype（由 archetype.id 是否存在决定）。
 * 成功后回调 onSuccess（父组件关闭 Dialog + 刷新列表）。
 */

"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ActivityArchetype, EnergyCost, ActivityLabel } from "@/usom/activity-archetype/types";
import type { L1Category } from "@/usom/activity-archetype/l1-categories";
import {
  createArchetype,
  updateArchetype,
} from "@/app/actions/activity-archetype";

interface ArchetypeFormProps {
  /** 已存在 Archetype = 编辑模式；null = 新增模式 */
  archetype: ActivityArchetype | null;
  /** L1 中文值列表 */
  l1Categories: string[];
  /** 提交成功回调（父组件关闭 Dialog + 刷新列表） */
  onSuccess: () => void;
  /** 取消回调 */
  onCancel: () => void;
}

/** 默认 EnergyCost（4 维各 5） */
const DEFAULT_ENERGY: EnergyCost = { physical: 5, mental: 5, emotional: 5, creative: 5 };

/** 默认 ActivityLabel */
const DEFAULT_LABEL: ActivityLabel = {
  enjoyment: 5,
  typicalDuration: 30,
  interruptTolerance: "medium",
  environment: [],
  location: [],
  parallelizable: false,
};

/** 中断容忍度取值 */
type InterruptTolerance = "low" | "medium" | "high";

/** 中断容忍度选项 */
const INTERRUPT_OPTIONS: { value: InterruptTolerance; label: string }[] = [
  { value: "low", label: "低（不可中断）" },
  { value: "medium", label: "中（可短暂中断）" },
  { value: "high", label: "高（随时可中断）" },
];

/** 将 textarea 逗号字符串转 string[] */
function parseCommaList(input: string): string[] {
  return input
    .split(/[,，;；\n]/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** 将 string[] 渲染为逗号分隔字符串 */
function joinCommaList(arr: string[] | undefined): string {
  return (arr ?? []).join(", ");
}

export function ArchetypeForm({
  archetype,
  l1Categories,
  onSuccess,
  onCancel,
}: ArchetypeFormProps) {
  const isEdit = archetype !== null;

  // ─── 表单状态 ────────────────────────────────────────────────
  const [l1Category, setL1Category] = useState<string>(archetype?.l1Category ?? l1Categories[0] ?? "");
  const [l2Name, setL2Name] = useState<string>(archetype?.l2Name ?? "");
  const [energy, setEnergy] = useState<EnergyCost>(archetype?.energyCost ?? DEFAULT_ENERGY);
  const [label, setLabel] = useState<ActivityLabel>(archetype?.activityLabel ?? DEFAULT_LABEL);

  // textarea 中间态（逗号分隔）
  const [envText, setEnvText] = useState<string>(joinCommaList(archetype?.activityLabel.environment));
  const [locText, setLocText] = useState<string>(joinCommaList(archetype?.activityLabel.location));
  const [synonymsText, setSynonymsText] = useState<string>(joinCommaList(archetype?.synonyms));

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 当 archetype prop 变化时同步（Dialog 复用场景）
  useEffect(() => {
    setL1Category(archetype?.l1Category ?? l1Categories[0] ?? "");
    setL2Name(archetype?.l2Name ?? "");
    setEnergy(archetype?.energyCost ?? DEFAULT_ENERGY);
    setLabel(archetype?.activityLabel ?? DEFAULT_LABEL);
    setEnvText(joinCommaList(archetype?.activityLabel.environment));
    setLocText(joinCommaList(archetype?.activityLabel.location));
    setSynonymsText(joinCommaList(archetype?.synonyms));
    setError(null);
  }, [archetype, l1Categories]);

  // ─── 提交 ────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // 基础校验
    if (!l2Name.trim()) {
      setError("L2 名称不能为空");
      return;
    }
    if (!l1Category) {
      setError("请选择 L1 分类");
      return;
    }
    const dims: (keyof EnergyCost)[] = ["physical", "mental", "emotional", "creative"];
    for (const dim of dims) {
      const v = energy[dim];
      if (!Number.isFinite(v) || v < 1 || v > 10) {
        setError(`${dim} 必须在 1-10 之间`);
        return;
      }
    }
    if (!Number.isFinite(label.enjoyment) || label.enjoyment < 1 || label.enjoyment > 10) {
      setError("enjoyment 必须在 1-10 之间");
      return;
    }
    if (!Number.isFinite(label.typicalDuration) || label.typicalDuration <= 0) {
      setError("typicalDuration 必须大于 0");
      return;
    }

    // 拼装 activityLabel（textarea → array）
    const finalLabel: ActivityLabel = {
      ...label,
      environment: parseCommaList(envText),
      location: parseCommaList(locText),
    };

    setSubmitting(true);
    try {
      if (isEdit && archetype) {
        const r = await updateArchetype(archetype.id, {
          l1Category: l1Category as L1Category,
          l2Name: l2Name.trim(),
          energyCost: energy,
          activityLabel: finalLabel,
          synonyms: parseCommaList(synonymsText),   // [023.11]
        });
        if (!r.success) {
          setError(r.error ?? "更新失败");
          return;
        }
      } else {
        const r = await createArchetype({
          l1Category: l1Category as L1Category,
          l2Name: l2Name.trim(),
          energyCost: energy,
          activityLabel: finalLabel,
          synonyms: parseCommaList(synonymsText),   // [023.11]
        });
        if (!r.success) {
          setError(r.error ?? "创建失败");
          return;
        }
      }
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : "提交失败");
    } finally {
      setSubmitting(false);
    }
  }

  // ─── 渲染 ────────────────────────────────────────────────────
  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* L1 + L2 */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="l1Category">L1 分类</Label>
          <Select value={l1Category} onValueChange={setL1Category}>
            <SelectTrigger id="l1Category" className="w-full">
              <SelectValue placeholder="选择 L1 分类" />
            </SelectTrigger>
            <SelectContent>
              {l1Categories.map((cat) => (
                <SelectItem key={cat} value={cat}>
                  {cat}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="l2Name">L2 名称</Label>
          <Input
            id="l2Name"
            value={l2Name}
            onChange={(e) => setL2Name(e.target.value)}
            placeholder="如：深度专注"
            required
          />
        </div>
      </div>

      {/* EnergyCost 4 维 */}
      <div className="space-y-2">
        <Label>能量消耗（1-10）</Label>
        <div className="grid grid-cols-4 gap-3">
          {(["physical", "mental", "emotional", "creative"] as const).map((dim) => (
            <div key={dim} className="space-y-1">
              <Label htmlFor={`energy-${dim}`} className="text-xs text-body">
                {dim === "physical"
                  ? "体力"
                  : dim === "mental"
                    ? "脑力"
                    : dim === "emotional"
                      ? "情绪"
                      : "创造"}
              </Label>
              <Input
                id={`energy-${dim}`}
                type="number"
                min={1}
                max={10}
                value={energy[dim]}
                onChange={(e) =>
                  setEnergy((prev) => ({ ...prev, [dim]: Number(e.target.value) }))
                }
              />
            </div>
          ))}
        </div>
      </div>

      {/* ActivityLabel: enjoyment / duration / interrupt */}
      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-2">
          <Label htmlFor="enjoyment">喜欢度</Label>
          <Input
            id="enjoyment"
            type="number"
            min={1}
            max={10}
            value={label.enjoyment}
            onChange={(e) =>
              setLabel((prev) => ({ ...prev, enjoyment: Number(e.target.value) }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="typicalDuration">典型时长（分钟）</Label>
          <Input
            id="typicalDuration"
            type="number"
            min={1}
            value={label.typicalDuration}
            onChange={(e) =>
              setLabel((prev) => ({ ...prev, typicalDuration: Number(e.target.value) }))
            }
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="interruptTolerance">中断容忍度</Label>
          <Select
            value={label.interruptTolerance}
            onValueChange={(v) =>
              setLabel((prev) => ({ ...prev, interruptTolerance: v as InterruptTolerance }))
            }
          >
            <SelectTrigger id="interruptTolerance" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {INTERRUPT_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* environment / location */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="environment">环境（逗号分隔）</Label>
          <Textarea
            id="environment"
            value={envText}
            onChange={(e) => setEnvText(e.target.value)}
            placeholder="安静, 电脑"
            rows={2}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="location">地点（逗号分隔）</Label>
          <Textarea
            id="location"
            value={locText}
            onChange={(e) => setLocText(e.target.value)}
            placeholder="办公室, 家"
            rows={2}
          />
        </div>
      </div>

      {/* [023.11] synonyms（同义词/范围描述） */}
      <div className="space-y-2">
        <Label htmlFor="synonyms">同义词/范围（逗号分隔）</Label>
        <Textarea
          id="synonyms"
          value={synonymsText}
          onChange={(e) => setSynonymsText(e.target.value)}
          placeholder="如：写代码, 编程, coding"
          rows={2}
        />
        <p className="text-xs text-body">
          用于 AI 从标题自动匹配活动原型；填同义词与该原型覆盖的具体活动
        </p>
        <p className="text-xs text-body">
          留空则下次运行 seed 可能会被默认值覆盖（系统内置条目）
        </p>
      </div>

      {/* parallelizable */}
      <div className="flex items-center gap-3">
        <Switch
          id="parallelizable"
          checked={label.parallelizable}
          onCheckedChange={(v) => setLabel((prev) => ({ ...prev, parallelizable: v }))}
        />
        <Label htmlFor="parallelizable" className="cursor-pointer">
          可与其他活动并行
        </Label>
      </div>

      {/* 操作按钮 */}
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          取消
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "提交中..." : isEdit ? "保存" : "创建"}
        </Button>
      </div>
    </form>
  );
}