---
id: TD-039
title: TZDate 在 RSC boundary 序列化丢失 class，server action 收到 plain object 报 start.toISOString
status: 新建
created: 2026-07-13
last_updated: 2026-07-13
---

# TD-039: TZDate 在 RSC boundary 序列化丢失 class，server action 收到 plain object 报 start.toISOString

> 摘要：`use-timebox.ts:53` `getDateRange` 用 `@date-fns/tz` 的 `tz()` 返回 `TZDate`（Date subclass）；Next.js 16 RSC boundary 序列化时丢失 class，server action 收到 plain object（无 `toISOString` 方法），`fetchTimeboxSummariesByRange` / `getAppointmentsByRange` 抛 `TypeError: start.toISOString is not a function`，`/timeboxes` 页面 500。MVP Shanghai-only 巧合 OK；任何有范围查询的 page 加载即爆。

## 元信息

| 字段 | 值 |
|---|---|
| 严重性 | 🟠 High |
| 类别 | 架构 / 兼容性 |
| 领域 | `lifeware-timebox` |
| 录入版本 | TZ-2.2 ([TZ-2.2]) |
| 负责人 | 暂未指派 |
| 修复目标版本 | 未知 |
| 关联 PR/分支 | main @ `f766066`（[TZ-2.2] merge）；根因 commit `5e36355` ([TZ-2.3]) |
| 关联 Constitution 条款 | N/A |

## 现象（What）

- `/timeboxes` 页面加载时 Server Action `getTimeboxesByRange(start, end)` 抛 `TypeError: start.toISOString is not a function`
- 同源问题影响 `/appointments` 页面的 `getAppointmentsByRange`
- 浏览器 console 显示：`[TimeboxesWorkspace] 加载失败 TypeError: start.toISOString is not a function at fetchTimeboxSummariesByRange`
- HTTP 500；UI 显示「今天还没有时间盒」空 state（因 fetch 失败被 swallow）
- Next.js dev indicator 显示 "1 Issue"

## 根因（Why）

- [TZ-2.3] 引入 `use-timebox.ts:53` `getDateRange(mode, date, tzName)` 改用 `startOfDay(date, { in: tz(tzName) })` 等 date-fns v4 `{ in: tz() }` option
- `@date-fns/tz` v1.4.1 的 `tz(tzName)` 返回 `TZDate`（Date 的 subclass，有 toISOString）
- 客户端调 `getDateRange` 返回 `TZDate` 实例（typeof Date，instanceof Date === true）
- 通过 Server Action 跨 RSC boundary 序列化时，Next.js 16 把 `TZDate` 当作 plain object 序列化（不识别 subclass prototype）
- Server 端 `getTimeboxesByRange(start, end)` 收到的 `start`/`end` 是 plain object（`{timeZone, internal}`），无 `toISOString` 方法
- `start.toISOString()` 抛 TypeError

**TZ-2.2 不引入此 bug**：TZ-2.2 仅改 `localDayKey` 内部实现（用 `getUserTzYear/Month/Date` 三个返回 number 的 helper），不触 `getDateRange` / `TZDate` 路径。

## 影响（Impact）

| 维度 | 影响 |
|---|---|
| 业务 | /timeboxes / /appointments 页面无法加载任何数据，UI 显示空 state；用户无法查看今天的约定 |
| 用户 | 100% 触发（任何打开 /timeboxes 的用户）；MVP Shanghai-only 范围内完全不可用 |
| 技术 | TZ-2.3 引入的 @date-fns/tz 集成未做 RSC boundary 测试；TZ-2.2 ship-then-verify 时漏掉 |
| 范围 | `frontend/src/app/actions/intent.ts:171` / `:856`；`frontend/src/hooks/use-timebox.ts:53` |
| 严重性依据 | 100% 触发；核心页面无法加载；ship-then-verify 时未发现（[feedback_post-ship-review-meta-pattern] 第 N 次累积） |

## 触发场景（When）

- 触发条件：客户端组件调 `useTimebox().getDateRange()` 或 `timeboxes-workspace.tsx:138` `loadRange()` → 返回 `TZDate` → 跨 Server Action boundary
- 复现步骤：
  1. `npm run dev` 启动 Next.js 16
  2. 浏览器访问 `http://localhost:3000/timeboxes`
  3. 等 ~2s 看 console + Next.js dev indicator
- 出现频率：100%

## 临时方案（Workaround）

- 无（页面 500 被 swallow 显示空 state，无 user-visible error）
- TZ-2.2 ship-then-verify 时漏掉此 bug（[feedback_post-ship-review-meta-pattern] 第 N 次累积 → 本次 QA 抓到）

## 理想修复（Ideal Fix）

- **方案 A（推荐）**：`getDateRange` 返回前显式 `.toISOString()` 转 ISO 字符串，下游 server action 接受 `string` 而非 `Date`
  - 改动：`use-timebox.ts:53` 返回类型改为 `{ start: string; end: string }`；`intent.ts:171,856` 去掉 `.toISOString()` 调用直接传 `string`
  - 优点：根治，类型契约清晰
  - 风险：API 改动需要全链路 caller 同步更新
- **方案 B**：在 `intent.ts:171,856` 入口加 `instanceof Date` 判断兜底（plain object → 转 ISO string）
  - 优点：改动最小（仅 intent.ts）
  - 风险：治标；其他 caller（如 Server Action 单独调用）仍可能踩坑
- **方案 C**：`getDateRange` 返回前 `.getTime()` 转 number ms，server action 入口再 `new Date(ms)`
  - 优点：保留 Date 类型，跨 boundary 走 primitive
  - 风险：API 仍非 string，需 caller 协同

## 修复成本评估

| 维度 | 评估 |
|---|---|
| 工作量 | 方案 A: 0.5 人日（getDateRange + use-timebox + workspace + intent + 测试）；方案 B: 0.25 人日 |
| 风险 | 中（API 改动触多文件，需 vitest + 浏览器双验证） |
| 前置依赖 | 无 |
| 是否跨域 | 否（仅 timebox 域） |
| 是否影响 manifest | 否 |
| 是否需要 Drizzle migration | 否 |
| 是否需要宪章修订 | 否（建议补一段「RSC boundary TZDate 序列化陷阱」到 `lib/tz.ts` 注释） |

## 验收标准（Done Criteria）

- [ ] vitest 新增「TZDate 跨 server action boundary 不丢 class」测试用例覆盖根因场景
- [ ] tsc 无新增报错
- [ ] `/timeboxes` + `/appointments` 在真实 PG + dev server 下复现 → 修复后 HTTP 200 + 数据正常加载
- [ ] `/qa` 浏览器端验证 TZ-2.2 派生 badge（插入 today scheduled appointment 后 appointment locked card 显示「执行中」）
- [ ] 已删除临时方案的兜底代码（如有）

## 跟踪记录（History）

- 2026-07-13 · [TZ-2.2] · 创建条目（QA pass 时发现：`.gstack/qa-reports/qa-report-tz22-2026-07-13.md` ISSUE-001）
- 2026-07-13 · [TZ-2.2] · 经 baseline 对比确认 pre-existing（commit `62aebf3` pre-TZ-2.2 同样错误），根因在 TZ-2.3 (`5e36355` + `db7569b`)

## 关联

- 相关技术债：无
- 相关 PR：gitee PR !16（TZ-2.1 + TZ-2.3）→ `62aebf3`
- 相关 spec/plan：
  - `docs/superpowers/specs/2026-07-04-023-04-timebox-cnui-optimization-design.md`（[TZ-2.3] 的设计前身）
  - `docs/superpowers/plans/2026-07-12-tz-2-2-localdaykey-iana-tz.md`
- 相关 memory：
  - `[[project-tz-2-full-shipment]]`
  - `[[project-tz-2-3-use-timebox-tz-aware]]`
  - `[[feedback-post-ship-review-meta-pattern]]`（post-ship /qa 抓漏 +1）
- 触发的设计讨论：`/qa` 输出 `.gstack/qa-reports/qa-report-tz22-2026-07-13.md` ISSUE-001
- QA 报告：`.gstack/qa-reports/qa-report-tz22-2026-07-13.md`