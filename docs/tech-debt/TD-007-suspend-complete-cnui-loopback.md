---
id: TD-007
title: Suspend action 完整 CNUI 回环未闭环(双注册缺一层)
status: 登记
created: 2026-07-06
last_updated: 2026-07-06
---

# TD-007: Suspend action 完整 CNUI 回环未闭环(双注册缺一层)

> 摘要：`tasks` 域的 Suspend action 在 [018] G3 ④⑤ 判定模型落地后,server `surfaceHandlers` 注册了但 client `register-client-surfaces` 漏了,造成「未知卡片类型」运行时错误。

## 元信息

| 字段 | 值 |
|---|---|
| 严重性 | 🟡 Medium |
| 类别 | 架构 |
| 领域 | `lifeware-tasks` |
| 录入版本 | v0.X.X ([023.10]) |
| 负责人 | 暂未指派 |
| 修复目标版本 | 未知 |
| 关联 PR/分支 | N/A(跨多 PR) |
| 关联 Constitution 条款 | C-NN(CNUI 双注册约束) |

## 现象（What）

用户在 `/tasks` 页面对某个 task 点"Suspend",客户端弹出"未知卡片类型"错误,无法继续。Console 报错指向 `register-client-surfaces` 找不到 `task.suspend` 对应渲染器。

## 根因（Why）

- [018] G3 ④⑤ 落地时,只补了 server 端 `cnui/handlers.ts` 的 surfaceHandlers map
- 漏了 client 端 `register-client-surfaces` 的对应渲染器注册
- [[project-cnui-surface-dual-registration]] 约束在 PR review 时被忽略

## 影响（Impact）

| 维度 | 影响 |
|---|---|
| 业务 | task suspend 功能不可用 |
| 用户 | 用户尝试暂停 task 时看到错误,需手动改 status 字段 |
| 技术 | CNUI 双注册约束违反,系统性风险 |
| 范围 | `frontend/src/cnui/handlers.ts` + `frontend/src/cnui/register-client-surfaces.ts` |
| 严重性依据 | 影响所有想暂停 task 的用户,出现频率 100% |

## 触发场景（When）

- 触发条件：用户尝试 suspend task
- 复现步骤：1. 进入 `/tasks` 2. 选择某 task 3. 点击"Suspend" action
- 出现频率：100%(主路径)

## 临时方案（Workaround）

- 用户直接改 DB `tasks.status` 字段(需 SQL 访问)
- 暂无 UI 兜底

## 理想修复（Ideal Fix）

- **方案 A（推荐）**：补 client 端 `register-client-surfaces` 注册,按 [[project-cnui-surface-dual-registration]] 4 路闭合
- **方案 B**：将 Suspend 改为普通 form 提交(非 CNUI surface),绕开双注册约束
- **方案 C**：运行时降级,server 端 fallback 到 inline 渲染

## 修复成本评估

| 维度 | 评估 |
|---|---|
| 工作量 | 0.5 人日(纯前端补注册) |
| 风险 | 低 |
| 前置依赖 | 无 |
| 是否跨域 | 否 |
| 是否影响 manifest | 是(需补 manifest K-block) |
| 是否需要 Drizzle migration | 否 |
| 是否需要宪章修订 | 否(约束已存在) |

## 验收标准（Done Criteria）

- [ ] client 端 `register-client-surfaces` 注册 `task.suspend` 渲染器
- [ ] manifest K-block 补 `task.suspend`
- [ ] vitest CNUI surface 测试覆盖双注册场景
- [ ] `/browse` 真实 PG 下：点击 Suspend → 弹窗 → 确认 → status 变 suspended
- [ ] [[project-cnui-surface-dual-registration]] 自检清单走一遍

## 跟踪记录（History）

- 2026-07-06 · [023.10] · 创建条目,源自 [018] followup 历史遗留(Suspend ⑥ 未闭环)
- 2026-06-XX · G3 ④⑤ 判定模型落地(95c1907)

## 关联

- 相关技术债：[[TD-012]] (CNUI 表单分叉,suspect 同根)
- 相关 PR：95c1907(G3 ⑤)
- 相关 memory：`[[project-018-followup-todos]]`(Suspend ⑥ 段) `[[project-cnui-surface-dual-registration]]`(双注册约束)
- 相关约束：[[feedback_cnui-checkpoints]] CUC-01~CUC-12