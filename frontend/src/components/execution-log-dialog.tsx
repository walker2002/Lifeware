"use client";

import { useState, useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { TimeboxSummary } from "@/usom/types/summaries";
import type { ExecutionRecord } from "@/usom/types/objects";
import { getCardBorderColor } from "@/lib/color-coding";

type CompletionStatus = "completed" | "partially_completed" | "not_completed";

const COMPLETION_OPTIONS: { value: CompletionStatus; label: string; color: string }[] = [
  { value: "completed", label: "已完成", color: "bg-green-100 text-green-800 border-green-300" },
  { value: "partially_completed", label: "部分完成", color: "bg-amber-100 text-amber-800 border-amber-300" },
  { value: "not_completed", label: "未完成", color: "bg-red-100 text-red-800 border-red-300" },
];

const RATING_LABELS = ["", "很差", "较差", "一般", "良好", "很好"];

interface ExecutionLogDialogProps {
  timebox: TimeboxSummary;
  open: boolean;
  onClose: () => void;
  onSubmit: (timeboxId: string, executionRecord: ExecutionRecord) => Promise<void>;
}

export function ExecutionLogDialog({ timebox, open, onClose, onSubmit }: ExecutionLogDialogProps) {
  const isReadOnly = timebox.status === "logged";
  const record = timebox.executionRecord;

  // 编辑模式状态
  const [completion, setCompletion] = useState<CompletionStatus>("completed");
  const [detailed, setDetailed] = useState(false);
  const [rating, setRating] = useState(3);
  const [actualOutput, setActualOutput] = useState("");
  const [deviationReasons, setDeviationReasons] = useState("");
  const [energyLevel, setEnergyLevel] = useState(3);
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // 自动计算实际时长和偏差
  const { actualDuration, plannedDuration, deviationMinutes } = useMemo(() => {
    const planned = Math.round(
      (new Date(timebox.endTime).getTime() - new Date(timebox.startTime).getTime()) / 60000
    );
    const started = timebox.startedAt ? new Date(timebox.startedAt).getTime() : new Date(timebox.startTime).getTime();
    const ended = timebox.endedAt ? new Date(timebox.endedAt).getTime() : Date.now();
    const actual = Math.round((ended - started) / 60000);
    return {
      actualDuration: actual,
      plannedDuration: planned,
      deviationMinutes: actual - planned,
    };
  }, [timebox]);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const base = {
        actualDuration,
        plannedDuration,
        deviationMinutes,
        loggedAt: new Date().toISOString(),
      };

      const executionRecord: ExecutionRecord = detailed
        ? {
            mode: "detailed",
            completionStatus: completion,
            ...base,
            completionRating: rating,
            actualOutput,
            deviationReasons: deviationReasons || undefined,
            energyLevel,
            notes: notes || undefined,
          }
        : {
            mode: "simple",
            completionStatus: completion,
            ...base,
          };

      await onSubmit(timebox.id, executionRecord);
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  const formatMins = (m: number) => {
    if (m < 60) return `${m}分钟`;
    const h = Math.floor(m / 60);
    const r = m % 60;
    return r > 0 ? `${h}小时${r}分钟` : `${h}小时`;
  };

  // ─── 只读模式（logged 状态查看记录） ────────────────────────
  if (isReadOnly && record) {
    return (
      <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{timebox.title} — 执行记录</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col gap-3 text-sm">
            {/* 颜色指示条 */}
            <div className={`h-1 rounded-full ${getCardBorderColor(record).replace("border-l-", "bg-").replace("transparent", "gray-200")}`} />
            <div className="flex items-center gap-2">
              <span className="text-body">完成状态：</span>
              <span className={COMPLETION_OPTIONS.find(o => o.value === record.completionStatus)?.color
                ?? "bg-gray-100 text-gray-800"}>
                {COMPLETION_OPTIONS.find(o => o.value === record.completionStatus)?.label ?? record.completionStatus}
              </span>
            </div>
            <div className="flex justify-between text-body">
              <span>计划时长：{formatMins(record.plannedDuration)}</span>
              <span>实际时长：{formatMins(record.actualDuration)}</span>
            </div>
            <div className="text-body">
              偏差：<span className={record.deviationMinutes > 0 ? "text-red-600" : record.deviationMinutes < 0 ? "text-green-600" : "text-ink"}>
                {record.deviationMinutes > 0 ? "+" : ""}{formatMins(Math.abs(record.deviationMinutes))}
              </span>
            </div>
            {record.mode === "detailed" && (
              <>
                {record.completionRating && (
                  <div className="text-body">评分：{RATING_LABELS[record.completionRating] ?? record.completionRating}</div>
                )}
                {record.actualOutput && <div className="text-body">产出：{record.actualOutput}</div>}
                {record.deviationReasons && <div className="text-body">偏差原因：{record.deviationReasons}</div>}
                {record.energyLevel && <div className="text-body">能量水平：{RATING_LABELS[record.energyLevel] ?? record.energyLevel}</div>}
                {record.notes && <div className="text-body">备注：{record.notes}</div>}
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  // ─── 编辑模式（ended 状态记录） ─────────────────────────────
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{timebox.title} — 记录执行结果</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {/* 时长信息 */}
          <div className="flex justify-between text-sm text-body">
            <span>计划：{formatMins(plannedDuration)}</span>
            <span>实际：{formatMins(actualDuration)}</span>
            <span className={deviationMinutes > 0 ? "text-red-600" : deviationMinutes < 0 ? "text-green-600" : "text-ink"}>
              偏差：{deviationMinutes > 0 ? "+" : ""}{formatMins(Math.abs(deviationMinutes))}
            </span>
          </div>

          {/* 完成度选择 */}
          <div className="flex gap-2">
            {COMPLETION_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setCompletion(opt.value)}
                className={`flex-1 rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                  completion === opt.value ? opt.color : "border-gray-200 bg-white text-body"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* 展开/收起详细模式 */}
          <button
            type="button"
            onClick={() => setDetailed(!detailed)}
            className="self-start text-sm text-body underline"
          >
            {detailed ? "收起详细记录" : "展开详细记录"}
          </button>

          {detailed && (
            <div className="flex flex-col gap-3 rounded-md border border-gray-200 p-3">
              {/* 评分 */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-body">评分：</span>
                {[1, 2, 3, 4, 5].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setRating(v)}
                    className={`rounded px-2 py-0.5 text-sm ${
                      rating === v ? "bg-ink text-white" : "bg-gray-100 text-body"
                    }`}
                  >
                    {v}
                  </button>
                ))}
                <span className="text-xs text-body">{RATING_LABELS[rating]}</span>
              </div>

              {/* 产出 */}
              <div>
                <label className="text-sm text-body">实际产出</label>
                <textarea
                  className="mt-1 w-full rounded-md border border-gray-200 p-2 text-sm"
                  rows={2}
                  value={actualOutput}
                  onChange={(e) => setActualOutput(e.target.value)}
                  placeholder="完成了什么？"
                />
              </div>

              {/* 偏差原因 */}
              {deviationMinutes !== 0 && (
                <div>
                  <label className="text-sm text-body">偏差原因</label>
                  <textarea
                    className="mt-1 w-full rounded-md border border-gray-200 p-2 text-sm"
                    rows={2}
                    value={deviationReasons}
                    onChange={(e) => setDeviationReasons(e.target.value)}
                    placeholder="为什么超时/提前？"
                  />
                </div>
              )}

              {/* 能量水平 */}
              <div className="flex items-center gap-2">
                <span className="text-sm text-body">能量：</span>
                {[1, 2, 3, 4, 5].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setEnergyLevel(v)}
                    className={`rounded px-2 py-0.5 text-sm ${
                      energyLevel === v ? "bg-ink text-white" : "bg-gray-100 text-body"
                    }`}
                  >
                    {v}
                  </button>
                ))}
              </div>

              {/* 备注 */}
              <div>
                <label className="text-sm text-body">备注</label>
                <textarea
                  className="mt-1 w-full rounded-md border border-gray-200 p-2 text-sm"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="其他想法..."
                />
              </div>
            </div>
          )}

          {/* 提交 */}
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={onClose} disabled={submitting}>
              取消
            </Button>
            <Button size="sm" onClick={handleSubmit} disabled={submitting}>
              {submitting ? "提交中..." : "确认记录"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
