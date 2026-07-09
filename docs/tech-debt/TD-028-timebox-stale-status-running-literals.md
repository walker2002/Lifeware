---
id: TD-028
title: "[026.02.3.1] post-review — Timebox 'running' status literals 在 JS 层仍残留"
status: 新建
created: 2026-07-09
last_updated: 2026-07-09
---

# TD-028: Timebox 'running' status 字符串残留 (JS 层 drift)

> 摘要: `[026.02.3.1]` ship 后, 全局 whole-branch code review (opus, 2026-07-09) 抓出 4 处遗留 — `t.status === 'running'` 比较在 [023.12] (2026-07-06) timebox.status 6→3 态收敛后已无人可能命中,但代码未跟随更新。与 `TD-025 v_running_timeboxes view stale filter` (本次修复的 SQL 视图层) 同源,只是这次在 JS 应用层。

## 元信息

| 字段 | 值 |
|---|---|
| 严重性 | 🟠 Medium — user-facing 隐式退行为 (matchTarget 返 null / 按钮文案分支失效) |
| 类别 | 行为退化 / 类型 drift |
| 领域 | `lifeware-timebox` + `nexus/intent` |
| 录入版本 | v0.X.X (在 `[026.02.3.1]` ship 后立即发现) |
| 负责人 | 暂未指派 |
| 修复目标版本 | 下次涉及 timebox 状态查询或 display-status 派生的 session |
| 关联 PR/分支 | `[026.02.3.1]` (commit 0c1cfbe head, 已 ship) |
| 关联 Constitution | N/A |
| 关联 SD | TD-025 (已修) + TD-024 (已修, 同 session) |

## 同源历史

- **TD-025 v_running_timeboxes view stale filter** (本次 1 PR 内修复): SQL view `WHERE status IN ('running','overtime')` 引用 [023.12] 已删除 status。修法: view 重写为派生 `status='planned' AND start_time<=NOW() AND end_time>=NOW()` + 0036 migration.
- **TD-028 (本条)**: JS 层 4 个 `'running'` 字面量与 0 个持久化行匹配, 实际等价 dead code / always-false branch.

## 4 处遗留 (按 I-1 列表 verbatim)

### Site 1 — `frontend/src/app/actions/intent.ts:649-650`
- `intent.ts:649-651` `matchTarget()` `target.type === "current" || target.value === "running"` → `timeboxes.find(t => t.status === "running")`
- **行为影响**: user 输入 "current" / "running" 触发 matchTarget 返 null (因 status='running' 行不存在), graceful fall-through 但语义错误
- **修复模式**: 用 `derive-display-status.ts` 找 `displayStatus === 'running'` (planned AND now ∈ [start,end])

### Site 2 — `frontend/src/hooks/use-auto-trigger.ts:53`
- `if (tb.status === "running" && endTime <= now) { ... }`
- **行为影响**: 自动触发永远不进入此分支 (无 'running' 行的数据基础)
- **修复模式**: 改 `displayStatus === 'running' || displayStatus === 'overtime'` (派生), 或直接 `tb.status === 'planned' && new Date(tb.endTime) <= new Date()` 走实时推导

### Site 3 — `frontend/src/app/actions/timebox.ts:299`
- `throw new Error(`该时间盒${tb.status === 'running' ? '进行中' : 'logged' : ...}`)`
- **行为影响**: 三元表达式第一个分支永远 false, 用户错误信息永远是 "已记录" 或 "已结束" — 但代码读起来像有 3 种可能
- **修复模式**: 删 `'running'` 分支 (simplest), 或保留 + 改为 `derive-display-status` 派生

### Site 4 — `frontend/src/domains/timebox/__tests__/createSmartTimeboxes-integration.test.ts:116`
- `fakeTimeboxStore.values().filter(t => t.status === 'running')`
- **行为影响**: 集成测试 fixture 永远返空集, 测试断言失去意义
- **修复模式**: fixture 改 `t.status === 'planned'` (semantic correct post-[023.12])

## 修复路径

下次涉及 timebox status 派生 / orchestration handler 改写时一并处理:
1. 共修方案: 抽 `findRunningTimeboxes(timeboxes): Timebox[]` shared helper 同时覆盖 Site 1 + Site 2
2. 单独方案: 4 处逐一改 `as AppointmentActionResult` typed-style 替换成 `derive-display-status` 调用
3. 推荐: 方案 1 — 与 TD-028 同 PR, 加 helper + grep 全 codebase 删除 `'running'` 字面量

## 状态

- [x] 已提交技术债 ledger (本文件)
- [ ] Site 1 fix — pending next session
- [ ] Site 2 fix — pending next session
- [ ] Site 3 fix — pending next session
- [ ] Site 4 fix — pending next session

## 关联

- 整批发现: whole-branch code review (opus, 2026-07-09) commit 0c1cfbe
- 同源已修: TD-025 (SQL view 层) + TD-024 (USOM 6 值)
- 邻近已 ship: [026.02.3.1] T1 + T2 修复了这个 drift 的 USOM/DB 同步层, 留 JS 应用层待跟进
