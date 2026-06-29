# Design: [023] A2 — Timebox 域重写

> **状态**：已确认（brainstorming 2026-06-29），待 writing-plans 展开
> **前置**：A0（EnergyCurve SSOT + EnergyStateManager 骨架 + timebox rules-registry）+ A1（USOM Activity Archetype）已完成并进 main（dce3d56）
> **父设计**：`~/.gstack/projects/walker2002-lifeware/walker-feat-023-timebox-domain-reorg-design-20260627-174227.md`（[023] 整体 design doc，Approach A + UI Design Decisions 已锁定）
> **分支**：`feat/023-a2`（从 main 起）
> **需求**：`mydocs/dev/023-重组 Timebox Domain.md` + `mydocs/dev/023补充-关于能量管理的完善.md`

---

## 1. Problem Statement

Timebox Domain 开发较早（早于 CNUI 界面与 [018]/[019] Domain 范式重设），当前各类 action 多数无法执行、不符合现行 Domain 宪章（§IX）。A2 在 A0/A1 基础设施（EnergyCurve / Activity Archetype / rules-registry）之上，按现行范式重写 timebox 域的核心 UI 与写入口，使 5 个 action（create / start / end / cancel / log）全部走通 Nexus 链路，并与 Activity Archetype 词典打通。

## 2. 范围与边界

### 2.1 IN（8 tasks）

| # | Task | 主要产出 |
|---|---|---|
| 1 | schema + 迁移 | `timeboxes` 加 `activityArchetypeId` 外键（nullable，ON DELETE SET NULL）+ 手写 SQL 迁移 `0023_*` + `_journal.json` 登记 |
| 2 | `/schedule` page | `frontend/src/app/schedule/page.tsx`（standalone，参 022 OKRWorkspace + AppShell），复用 `timebox/components/*`（day-view/timebox-list/timebox-card）；左栏时间盒 CRUD + lifecycle，右栏 Drawer |
| 3 | Timebox Drawer | Variant C v2：右侧 520px 抽屉（mobile 全屏 bottom sheet）；字段序「标题 → 活动原型(嵌套 sub-card) → 时间 → 备注 → 关联 task/KR」；Archetype sub-card + 4 维 EnergyCost accordion 默认收起；3 模式（新建/编辑/模板批量 N 条） |
| 4 | createTimebox CNUI | 手写 surface，左右翻页多条待提交，二次确认，逐条走 Nexus |
| 5 | adjustSchedule CNUI | 手写 surface，按时间序列当天 timebox，仅提交有改动的，running/ended 不可取消 |
| 6 | logTimebox CNUI | 手写 surface，批量打卡三态（完成/未完成/跳过）+ 备注，二次确认 |
| 7 | `/timebox-templates` page | `frontend/src/app/timebox-templates/page.tsx`：7 段生存时间（起床/通勤/上班/三餐/睡眠等锚点；需求 `023-重组` 列 9 项时间锚点，writing-plans 阶段归并为 7 段并定稿）+ pull 模式订阅激活 habits/tasks/threads；**配置类，不走 Nexus** |
| 8 | manifest 清理 + 基线 | `intent_triggers` 收敛导航类、5 lifecycle action 走 SM、`view_routes` 标准化、`subscribed_events`；§IX 七层；vitest/tsc 零新增 |

### 2.2 OUT（明确不在 A2）

- ❌ **EnergyState 扣减 / applyEvent / dead_letter_events** — OQ-6 重写：MVP 不做自动扣减。logTimebox 只把 `activityArchetypeId`（+可选 EnergyCost 快照）作为 timebox 自身字段，走正常 mutation。（见 §3 决策 D1）
- ❌ **habitsTemplates 页面 + `habit_templates` 表硬删** — → A3。A2 只**新建** timebox-templates，旧 `app/habits/templates/` 与 `habit_templates` 表原样保留。
- ❌ **tasks / habits 表加 `activityArchetypeId`** + B→C 迁移（删 `EnergyProfile` enum）— → A3。
- ❌ **Timebox ↔ KR junction**（`contributor_type='timebox'`、ActiveTimeboxesProvider、OKR recompute TimeboxLogged）— → A4。
- ❌ **时间盒冲突深度校验** — 需求明确「留下一迭代」；A2 只判重叠并提示，**不禁止**（二次确认可通过）。

## 3. 关键架构决策（已锁定，源自父 design doc）

- **D1 — EnergyState 不扣减（OQ-6 重写）**：父 design doc §A2 正文 item 6/7（`EnergyStateRepository.updateWithVersion` + post-mutation 扣减 + dead_letter）已被同文档 OQ-6 重写 + A0 plan §A2 outline「关键约束：**不接 applyEvent 扣减**」取代。**A2 采纳后者**，故为 8 tasks（非 10）。扣减留待后续阶段评估。
- **D2 — 写入口全走 Nexus/Orchestrator**：create/adjust/log 经 manifest intent_trigger / lifecycle SM → Orchestrator → `timebox/hooks.ts onValidate`（委托 rules-registry）→ mutation service 原子写。复用 [025] 范式：mutation service 保留原子写 + server action 判别联合透传 NeedConfirm + 客户端二次确认弹窗。
- **D3 — timeboxTemplates 是配置类，不走 Nexus**：直接 Repository CRUD + `user_audit_log`（参 A1 `/config/activity-archetypes` 范式，OQ-7）。
- **D4 — CNUI 手写范式（[019.1] 合规）**：3 个新 surface 手写，不经 CnuiFormAdapter（已退役）。
- **D5 — Drawer = Variant C v2**（视觉验证锁定）：mockup `~/.gstack/projects/walker2002-lifeware/designs/lifeware-023-schedule-drawer-20260628/variant-c-v2.html` + `approved.json`。
- **D6 — 复用基线**：`timebox/components/*`（day/week/month-view、timeline、card、list、draft-editor）+ 022 OKRWorkspace standalone 接线模式 + [021] TaskCreateDrawer 抽屉范式。
- **D7 — manifest 路由收敛**：5 个 lifecycle action（createTimebox/startTimebox/endTimebox/cancelTimebox/logTimebox）走 SM 而非 AI intent；`/schedule`、`/timeboxTemplates` 收为导航类 view_route（`component: null` 标注模式参 022 RC-3）。
- **D8 — 防御性解耦**：scheduling-handler 现状已无 direct import `@/domains/tasks|habits`（A0 已修）；A2 task 8 加 ESLint `no-restricted-imports` 规则防止回退（N-1）。

## 4. 数据流

```
/schedule 抽屉(手动 CRUD/lifecycle) ─┐
CNUI surface(AI 助手 create/adjust/log) ─┤
                                     ↓
            manifest intent_trigger / lifecycle SM
                          ↓
                   Orchestrator（纯分发）
                          ↓
        timebox/hooks.ts onValidate → rules-registry（意图校验）
                          ↓
              mutation service 原子写 timeboxes（+activityArchetypeId）
                          ↓
   logTimebox：activityArchetypeId(+可选 EnergyCost 快照) 作 timebox 自身字段
   （不扣 EnergyState，D1）

/timebox-templates（配置）→ Repository CRUD + user_audit_log（不经 Nexus，D3）
```

## 5. UI 设计（引用父 design doc §UI Design Decisions）

- **视觉令牌**：UI-DESIGN-SPEC CSS 变量（`bg-canvas`/`text-ink`/`text-body`/`border-hairline`），禁 Tailwind 默认色。
- **Drawer（Variant C v2）**：520px 右抽屉；活动原型嵌套 sub-card（`bg-surface-card`/12px 圆角/20px 内边距），顶部 Archetype 名 + L1/L2 标签 +「更换」链接，其下 4 维 EnergyCost accordion 默认收起（header 显「8 / 2 / 3 / 5」当前值）；底部 coral primary「保存」+ secondary「取消」+ 编辑模式 destructive「删除」（删除前 confirmation dialog）。
- **3 CNUI surface 布局**：
  - createTimebox：左右翻页多条卡片（标题+时间+Archetype），底部「提交全部」coral +「上一步」text-link。
  - adjustSchedule：按时间序列当天 timebox，左右切换当前编辑，底部「应用修改」coral +「取消」。
  - logTimebox：批量打卡左右翻页 + 每条「完成/未完成/跳过」三态 + 备注，底部「提交打卡」coral。
- **4 维展示**：C.R2 默认收起（accordion）；C.R1 数字可输入 + 进度条仅可视化（`width: ${val*10}%`，input type=number min=0 max=10）。
- **Interaction States 4 维**（每屏必填）：empty/loading（骨架屏）/error/success（toast）。
- **Accessibility**：抽屉 `role="dialog" aria-modal="true"`；Cmd/Ctrl+Enter 提交、Esc 关抽屉；触摸目标 ≥40×40px；CNUI `role="region" aria-label`。
- **Responsive**：Desktop≥1024 三栏 AppShell；Tablet 768-1024 左面板可收起；Mobile<768 抽屉变全屏 bottom sheet、CNUI 单条全屏 swipe 切换。

## 6. 测试与验证策略

- **基线**：对比 main 的 base 失败集合，vitest/tsc 零新增（[feedback_change-gate-baseline]）。
- **单元**：rules-registry onValidate 委托、scheduling-handler 无 direct import（D8 ESLint 守卫）、3 CNUI handler 提取/翻页/二次确认逻辑、Drawer 4 维 accordion、manifest 路由收敛。
- **/browse E2E（真实 PG）**：/schedule 新建/编辑/删除/lifecycle 全状态流转；createTimebox 多条翻页+批量；adjustSchedule 改/取消（running/ended 拦截）；logTimebox 批量三态；/timebox-templates 7 段生存时间 + pull 订阅 habits/tasks/threads。
- **规范门禁**：§IX 七层 checklist + UI-DESIGN-SPEC §14（C-01~C-07）+ §11.10 CNUI 自检（CUC-01~CUC-12，[feedback_cnui-checkpoints]）。

## 7. 文档同步（Tier 2 强制，[feedback_tier2-sync]）

- `docs/usom-design.md`：timebox 引用 Activity Archetype + activityArchetypeId 字段语义。
- `docs/database-design.md`：`timeboxes.activityArchetypeId` 字段 + 7 段生存时间模板模型。
- `manifest.md`：[023] A2 条目。
- A2 plan 文件：`docs/superpowers/plans/2026-06-29-023-a2-timebox-rewrite.md`（writing-plans 产出）。

## 8. 验收标准（Success Criteria）

1. 5 个 action（create/start/end/cancel/log）在 /schedule 与 CNUI 双入口均可走通 Nexus 链路（真实 PG 落库）。
2. `timeboxes.activityArchetypeId` 外键就位，Drawer/CNUI 可选 Archetype 并随 timebox 持久化。
3. /timebox-templates 7 段生存时间 + pull 订阅可用，配置修改写 `user_audit_log`。
4. manifest lifecycle 走 SM、view_routes 标准化、ESLint 防回退 direct import 生效。
5. vitest/tsc 零新增失败；§IX 七层 + UI-DESIGN-SPEC §14 + §11.10 全过。
6. 时间重叠提示但不禁止（二次确认可通过）。
7. EnergyState 未被扣减（D1，符合预期）。

## 9. 风险与依赖

- **风险 R1（面积大）**：8 tasks 跨 page/Drawer/3 CNUI/templates/manifest，单分支较长。缓解：按 task 粒度 commit，每 task 末尾跑基线；task 顺序 1→2→3→4→5→6→7→8（schema 先行，Drawer 在 CNUI 前定形）。
- **风险 R2（manifest 路由收敛 breaking）**：lifecycle action 改走 SM 可能影响现有 GrowthMenu/AI 助手入口。缓解：writing-plans 阶段先 audit 现有 intent_triggers 调用方。
- **依赖**：A0 rules-registry、A1 Activity Archetype（含 Repository/配置页范式）、[025] mutation service+NeedConfirm 范式、022 OKRWorkspace standalone 模式、[021] TaskCreateDrawer。
- **drizzle 迁移手写**（[project-drizzle-migrations-handwritten]）：0023 SQL 手写 + psql + journal 登记；dev DB `lifeware_dev@localhost:5432`；prod 待 `./prod.sh --migrate`。
- **lifecycle-configs require 债**（[project-lifecycle-configs-require-debt]）：timebox transitions 若触发同源 require 债，task 8 注意（A3 才彻底解决 habits 侧）。

## 10. Self-Review（spec 自检）

- **Placeholder**：无 TBD/TODO。
- **一致性**：§2 OUT 与 §3 D1/D7 一致；§4 数据流与 D2/D3 一致；§8 验收 7 条映射 §2 IN 8 tasks。
- **范围**：单 plan 单分支 8 tasks，与 A1（7 tasks）规模相当，无需再拆。
- **歧义**：D1 明确「不扣减」消解父 doc 矛盾；habitsTemplates 边界（§2.2）消解需求文档与 A3 的重叠。
