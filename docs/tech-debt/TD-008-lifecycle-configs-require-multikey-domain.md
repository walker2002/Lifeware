---
id: TD-008
title: lifecycle-configs require('@/...') 多键域债(resolve/transition 仍动态)
status: 登记
created: 2026-07-06
last_updated: 2026-07-06
---

# TD-008: lifecycle-configs require('@/...') 多键域债(resolve/transition 仍动态)

> 摘要：`resolveObjectType` / `getTransitionFromManifest` 仍用 `require('@/...')` 动态导入,[025] Task3 修了同源一半,但 okrs / timebox 多键域的生产隐患未根治。

## 元信息

| 字段 | 值 |
|---|---|
| 严重性 | 🟡 Medium |
| 类别 | 架构 |
| 领域 | `cross-domain` |
| 录入版本 | v0.X.X ([023.10]) |
| 负责人 | 暂未指派 |
| 修复目标版本 | 未知 |
| 关联 PR/分支 | N/A(跨多 PR) |
| 关联 Constitution 条款 | C-NN(USOM 静态引用约束) |

## 现象（What）

`okrs` 域有多个状态机(goals / keyResults / initiatives),`timebox` 域有多个状态机(timeboxes / templates / sessions 等)。`resolveObjectType('okr.goal')` 和 `resolveObjectType('timebox.template')` 走 `require()` 动态加载,在 webpack bundling 时无法静态分析,生产环境偶发 `Cannot find module` 错误。

## 根因（Why）

- USOM 设计时考虑不周,所有域统一用 `require()` 模式做 lifecycle 配置加载
- 单键域(habits/tasks)问题不显,多键域(okrs/timebox)动态路径爆炸
- [025] Task3 修了同源一半(部分单键域迁到静态 import),多键域 defer

## 影响（Impact）

| 维度 | 影响 |
|---|---|
| 业务 | 偶发生产错误,影响用户操作 |
| 用户 | 罕见情况下遇到 "Cannot find module" 错误 |
| 技术 | bundler 静态分析失败,deploy 时可能漏打包 |
| 范围 | `frontend/src/usom/lifecycle-configs/resolve.ts` + 多处 transition 文件 |
| 严重性依据 | 生产隐患,出现频率 <1/1000 但难调试 |

## 触发场景（When）

- 触发条件：访问 okrs 或 timebox 域多键域对象 lifecycle
- 复现步骤：production deploy 后首次访问 `okr.goal` 状态机
- 出现频率：罕见(<1/1000),但一旦发生难定位

## 临时方案（Workaround）

- [025] Task3 修了同源一半后,问题暂时缓解
- 暂无自动 fallback

## 理想修复（Ideal Fix）

- **方案 A（推荐）**：所有 lifecycle config 改静态 import,build 时显式 enum
- **方案 B**：引入 registry 模式,集中所有 lifecycle config 静态注册
- **方案 C**：维持现状,接受偶发生产错误

## 修复成本评估

| 维度 | 评估 |
|---|---|
| 工作量 | 2-3 人日 |
| 风险 | 中(涉及多域 + build 配置) |
| 前置依赖 | 确认所有多键域清单 |
| 是否跨域 | 是 |
| 是否影响 manifest | 否 |
| 是否需要 Drizzle migration | 否 |
| 是否需要宪章修订 | 是(补"USOM 静态引用"条款) |

## 验收标准（Done Criteria）

- [ ] 全仓库 grep `require('@/usom/lifecycle-configs')` 命中 = 0
- [ ] 所有 lifecycle config 改静态 import 或 registry 注册
- [ ] vitest 测试覆盖所有多键域的 lifecycle 加载
- [ ] production deploy 后无 "Cannot find module" 错误
- [ ] 宪章补"USOM 静态引用"条款

## 跟踪记录（History）

- 2026-07-06 · [023.10] · 创建条目,源自 [025] Task3 同源修复历史
- 2026-06-XX · [025] Task3 修了同源一半

## 关联

- 相关技术债：[[TD-004]] (跨域写入口债,同根因:USOM/宪章约束未对齐)
- 相关 PR：N/A
- 相关 memory：`[[project-lifecycle-configs-require-debt]]` `[[project-025-cascade-decisions]]`