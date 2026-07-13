/**
 * @file archetype-table
 * @brief Activity Archetype 配置表格（客户端组件）
 *
 * 功能：
 * - 按 L1 分类分组展示所有 Archetype
 * - 4 维能量条 + 喜欢度 + 中断容忍度摘要
 * - 新增 / 编辑（Dialog + ArchetypeForm）/ 删除（AlertDialog）
 * - Seed 按钮：导入默认词典（幂等）
 *
 * 数据流：
 * - 服务端 page 拉取 initialData → useState 本地维护
 * - CRUD 操作后调用对应 server action 并 revalidate 本地列表
 */

"use client";

import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ArchetypeForm } from "./archetype-form";
import { L1_CATEGORIES } from "@/usom/activity-archetype/l1-categories";
import type { ActivityArchetype, EnergyCost } from "@/usom/activity-archetype/types";
import {
  createArchetype,
  updateArchetype,
  deleteArchetype,
  seedArchetypes,
} from "@/app/actions/activity-archetype";

interface ArchetypeTableProps {
  /** 服务端预拉取的 Archetype 列表 */
  initialData: ActivityArchetype[];
}

/** L1 中文值列表（与 L1_CATEGORIES 顺序对齐） */
const L1_VALUES: string[] = Object.values(L1_CATEGORIES);

/** 渲染 4 维能量条（每条 10 格，按值填充） */
function EnergyBars({ cost }: { cost: EnergyCost }) {
  const dims: { key: keyof EnergyCost; label: string }[] = [
    { key: "physical", label: "体" },
    { key: "mental", label: "脑" },
    { key: "emotional", label: "情" },
    { key: "creative", label: "创" },
  ];

  return (
    <div className="flex gap-2 items-center">
      {dims.map(({ key, label }) => {
        const v = cost[key];
        return (
          <div key={key} className="flex items-center gap-1" title={`${key}: ${v}/10`}>
            <span className="text-[10px] text-muted-foreground w-3">{label}</span>
            <div className="flex gap-[2px]">
              {Array.from({ length: 10 }).map((_, i) => (
                <span
                  key={i}
                  className={`block w-[3px] h-3 rounded-sm ${
                    i < v ? "bg-primary" : "bg-muted"
                  }`}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** 中断容忍度徽章变体 */
function interruptVariant(v: "low" | "medium" | "high"): "destructive" | "secondary" | "outline" {
  if (v === "low") return "destructive";
  if (v === "medium") return "secondary";
  return "outline";
}

function interruptLabel(v: "low" | "medium" | "high"): string {
  if (v === "low") return "低";
  if (v === "medium") return "中";
  return "高";
}

export function ArchetypeTable({ initialData }: ArchetypeTableProps) {
  const [list, setList] = useState<ActivityArchetype[]>(initialData);

  // Dialog 状态
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ActivityArchetype | null>(null);

  // 删除确认状态
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // 操作反馈
  const [seedFeedback, setSeedFeedback] = useState<string | null>(null);

  // ─── 按 L1 分组 ──────────────────────────────────────────────
  const grouped = useMemo(() => {
    const map = new Map<string, ActivityArchetype[]>();
    for (const cat of L1_VALUES) {
      map.set(cat, []);
    }
    for (const a of list) {
      const arr = map.get(a.l1Category) ?? [];
      arr.push(a);
      map.set(a.l1Category, arr);
    }
    return map;
  }, [list]);

  // ─── 刷新列表 ────────────────────────────────────────────────
  async function refresh() {
    // 走 server action 取最新（避免每次刷新整个页面）
    const { getArchetypes } = await import("@/app/actions/activity-archetype");
    const r = await getArchetypes();
    if (r.success && r.data) setList(r.data);
  }

  // ─── 新增 ────────────────────────────────────────────────────
  function onCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  // ─── 编辑 ────────────────────────────────────────────────────
  function onEdit(a: ActivityArchetype) {
    setEditing(a);
    setDialogOpen(true);
  }

  // ─── 删除 ────────────────────────────────────────────────────
  async function onConfirmDelete() {
    if (!deletingId) return;
    const r = await deleteArchetype(deletingId);
    if (r.success) {
      setList((prev) => prev.filter((a) => a.id !== deletingId));
    } else {
      // 即便失败也提示（用 seedFeedback 复用提示槽）
      setSeedFeedback(r.error ?? "删除失败");
    }
    setDeletingId(null);
  }

  // ─── Seed ────────────────────────────────────────────────────
  async function onSeed() {
    const r = await seedArchetypes();
    if (r.success) {
      setSeedFeedback(
        r.data?.inserted
          ? `已导入 ${r.data.inserted} 条默认 Archetype`
          : "默认词典已全部存在",
      );
      await refresh();
    } else {
      setSeedFeedback(r.error ?? "导入失败");
    }
  }

  // ─── Dialog 关闭后回调（form submit success） ────────────────
  async function onFormSuccess() {
    setDialogOpen(false);
    setEditing(null);
    await refresh();
  }

  // ─── 渲染 ────────────────────────────────────────────────────
  const deletingArchetype = deletingId ? list.find((a) => a.id === deletingId) : null;

  return (
    <div className="space-y-4">
      {/* 顶部工具栏 */}
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">
          共 {list.length} 条 Archetype
          {seedFeedback && <span className="ml-3 text-foreground">{seedFeedback}</span>}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={onSeed}>
            导入默认词典
          </Button>
          <Button onClick={onCreate}>新增 Archetype</Button>
        </div>
      </div>

      {/* 分组表格 */}
      {list.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground border-hairline-soft">
          暂无 Archetype。点击「导入默认词典」快速开始，或「新增 Archetype」自定义条目。
        </Card>
      ) : (
        <div className="space-y-6">
          {L1_VALUES.map((l1) => {
            const rows = grouped.get(l1) ?? [];
            if (rows.length === 0) return null;
            return (
              <Card key={l1} className="p-4 space-y-3 border-hairline-soft">
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold text-ink">{l1}</h2>
                  <Badge variant="secondary">{rows.length}</Badge>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>L2 名称</TableHead>
                      <TableHead>来源</TableHead>
                      <TableHead>能量消耗（体/脑/情/创）</TableHead>
                      <TableHead>喜欢度</TableHead>
                      <TableHead>中断容忍</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell className="font-medium">{a.l2Name}</TableCell>
                        <TableCell>
                          {a.isSystem ? (
                            <Badge variant="secondary">系统</Badge>
                          ) : (
                            <Badge variant="outline">自定义</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <EnergyBars cost={a.energyCost} />
                        </TableCell>
                        <TableCell>{a.activityLabel.enjoyment}/10</TableCell>
                        <TableCell>
                          <Badge variant={interruptVariant(a.activityLabel.interruptTolerance)}>
                            {interruptLabel(a.activityLabel.interruptTolerance)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => onEdit(a)}
                              title="编辑"
                            >
                              编辑
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setDeletingId(a.id)}
                              disabled={a.isSystem}
                              title={a.isSystem ? "系统内置，不可删除" : "删除"}
                              className="text-destructive hover:text-destructive"
                            >
                              删除
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </Card>
            );
          })}
        </div>
      )}

      {/* 新增/编辑 Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editing ? "编辑 Archetype" : "新增 Archetype"}</DialogTitle>
            <DialogDescription>
              {editing
                ? `修改 "${editing.l2Name}" 的能量与执行特征。`
                : "为词典新增一条活动原型。系统默认词典可在「导入默认词典」一键加载。"}
            </DialogDescription>
          </DialogHeader>
          <ArchetypeForm
            archetype={editing}
            l1Categories={L1_VALUES}
            onSuccess={onFormSuccess}
            onCancel={() => setDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* 删除确认 AlertDialog */}
      <AlertDialog
        open={deletingId !== null}
        onOpenChange={(open) => !open && setDeletingId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>删除 Archetype？</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingArchetype
                ? `即将删除 "${deletingArchetype.l2Name}"（${deletingArchetype.l1Category}）。此操作不可撤销。`
                : "确认删除？"}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirmDelete} className="bg-destructive text-white hover:bg-destructive/90">
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}