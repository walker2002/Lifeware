# [029] 逻辑日（Logical Day）设计与跨日期事件建模

- **日期**：2026-07-14
- **主题**：引入「逻辑日」概念解决跨日期事件（睡眠/夜猫子/加班到凌晨）的归属与建模问题；统一 habit/timebox/appointment 三域时间表达，支持「次日」
- **范围**：
  - 新增 `logical_days` 一等实体（日期桶 + 早计划/晚复盘数据列）
  - timebox / appointment 增 `logical_day_id` 归属
  - 统一相对时间模型 **LDM（Logical-Day relative Minutes）**，habit 列迁移 + TemplateRow 改造
  - 新增只读视图 `v_schedule_slots` 作为统计唯一入口
  - 三域 UI 支持「次日」时间选择
- **不在本次范围**（后续 phase）：`/timeboxes` 页面的「早计划卡 / 晚复盘卡」填写 UI（列本期建好，UI 后做）
- **SSOT**：本文档（设计源头）。实现 plan 随后由 writing-plans 产出。

---

## 1. 背景与问题

### 1.1 用户场景

系统里 habits / timebox / appointment 的事件可能**跨日期**：

- **睡眠 habit**：默认 23:30 开始，最迟可能到次日 00:30 —— 现有 HH:MM 字段表达不了「次日」
- **加班 timebox**：当日任务排期到凌晨（如 22:00–02:00）
- **夜猫子用户**：23:00 写方案、00:30 修改方案、02:00–09:00 睡眠 —— 这三件事用户心智里**都归属「头一天」**

核心矛盾：传统 calendar day（00:00 切日）把「周二 23:00」和「周三 02:00」切到两天，但用户规划视角下「我周二还没睡，这还是周二的事」。

### 1.2 业界做法（调研结论）

| 产品 | 跨日睡眠归属 | 范式 |
|---|---|---|
| Apple Health / Oura / Whoop / Garmin | **醒来那天**（wake-up date） | 回顾视角 |
| Google Calendar / Outlook / iCal | **开始那天**（start date），跨日 timed event 不切分 | 规划视角 |

> 两种范式无绝对优劣。Lifeware 是**规划导向**（用户睡前规划当日），故采用「规划视角」：**以用户选定的日期为归属，不做自动切日判定**。

### 1.3 现状地图（基于实读 `schema.ts` / `objects.ts`）

- **三域时间模型不一致**：habit 用 HH:MM 文本（本地挂钟）｜timebox 用 `timestamptz` 区间｜appointment 用 `timestamptz` 起点 + `durationMin` 派生
- **无任何「跨日 / 次日」概念**：仅靠 `check_timeboxes_end_after_start`（schema.ts:385）隐式允许跨日
- **appointment 不物化为 timebox**（schema.ts:419 注释，[026] D2=C 读时合并）—— 与 habit/task 物化 timebox 的模式不一致
- **多个 UI 有 OS-TZ 泄漏**（`appointment-filter-bar.tsx` `setHours`、`timebox-timeline.tsx` `getHours`）—— 属既有债，本设计不直接修，但 `v_schedule_slots` 统一入口可顺带收敛部分

---

## 2. 核心概念

### 2.1 Logical Day = 用户选定的「日期桶」，不是派生区间

> **关键决策（简化）**：逻辑日**不计算 start/end 边界**，**不做睡眠驱动的边界派生**，**不做重算**，**不做锁定**。逻辑日就是一个「用户选的日历日期 + 该日的计划/复盘数据」。

这是对最初「per-day 自动推边界」方案的**有意简化**（brainstorm 中用户在看到数据流复杂度后选择显式选择 > 自动判定）。代价：凌晨建事件需用户手动选归属日（夜猫子可接受）；收益：砍掉边界派生、重算级联、锁定、anchor 兜底等大量机械装置。

### 2.2 归属规则（通用默认）

```
logical_day = 显式指定的日期（UI 选定 / AI 规划目标日 / 用户覆盖）
              —— 若未提供，则默认 = date(startTime, user_tz)
```

**优先级**：显式 > 默认。一旦设定，**粘性（sticky）**——编辑物理时间**不会**自动改归属，需用户显式改。

### 2.3 「今日」语义

```
currentLogicalDay = logical_days 中 day_label = 今天日期(user_tz) 的那行
```

纯日期查找，无区间搜索。深夜 23:00 调「规划今天」= 规划今天日期的逻辑日（其内 timebox 物理时间可跨到次日凌晨，归属仍是今天）—— **直接满足需求 #3「智能规划当日允许跨凌晨」**。

### 2.4 验证三个原始需求

| 需求 | 满足方式 |
|---|---|
| #1 睡眠是当日最后事件，23:00/00:30/02:00–09:00 全归前一天 | 用户在 `/timeboxes` 选定「周二」后建这些 timebox → 全部 logical_day=周二 |
| #2 通宵/夜班用户手动指定归属 | 同一机制：选定日期即归属，无需智能判定 |
| #3 智能规划「当日」允许跨凌晨 | 「今日」=今天日期；当日 timebox 物理时间可跨凌晨，归属不变 |

---

## 3. 数据模型

### 3.1 新表 `logical_days`（一等实体，薄表）

```ts
export const logicalDays = pgTable('logical_days', {
  id:        uuid('id').primaryKey().defaultRandom(),
  userId:    uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  dayLabel:  date('day_label').notNull(),           // 用户选定的逻辑日（纯日期标签，无区间）

  // ── 早计划输入（可选，起床后才知道；UI 后做）──
  wakeTime:             timestamp('wake_time', { withTimezone: true }),   // 起床时间
  sleepDurationMinutes: integer('sleep_duration_minutes'),                // 睡眠时长（分钟）
  energyBaseline:       integer('energy_baseline'),                       // 当日能量基准（单值 1-10）

  // ── 晚轻复盘输入（可选；UI 后做）──
  reviewRating: smallint('review_rating'),          // 自评 1-5 星
  reviewNotes:  text('review_notes'),               // 收获/心得/感悟

  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex('uniq_logical_days_user_label').on(table.userId, table.dayLabel),
  check('check_logical_days_energy',   sql`${table.energyBaseline} IS NULL OR (${table.energyBaseline} BETWEEN 1 AND 10)`),
  check('check_logical_days_rating',   sql`${table.reviewRating} IS NULL OR (${table.reviewRating} BETWEEN 1 AND 5)`),
])
```

- **无** `start_at` / `end_at` / `locked` / `boundarySource`（全删）。
- 计划/复盘列**本期建好**（数据有家），**填写 UI 是后续独立 phase**。
- constitution 合规：边界/时刻均为 `timestamptz`/`date` 实列（非 jsonb，满足 §DB JSONB Forbidden）✓；`user_id` 前置索引（满足 T-01..T-04）✓。

### 3.2 timebox / appointment 增归属 FK

```ts
// timeboxes & appointments 各加：
logicalDayId: uuid('logical_day_id').references(() => logicalDays.id, { onDelete: 'set null' }),
// 索引：
index('idx_<table>_user_logical_day').on(table.userId, table.logicalDayId),
```

- **不保留 `auto/user` 枚举**：简化模型无重算 → 归属创建时设定后**粘性**，无行为分支。如后续 UX 需区分「系统默认 vs 用户手选」可再加 provenance 列。
- `logical_day_id = null`：存量未回填事件（backfill 前的临时态）。

### 3.3 LDM（Logical-Day relative Minutes）——「次日」的统一相对时间模型

> **核心**：相对时间字段统一存「逻辑日 0 点起的分钟数」int。**值 ≥ 1440 即「次日」**，自动成立，无 flag、无 offset 伴随列。

| 时刻 | LDM 值 |
|---|---|
| 23:30 当日 | 1410 |
| 00:00 次日 | 1440 |
| 00:30 次日 | 1470 |
| 09:00 次日 | 1980 |

**应用范围**（关键区别）：

| 载体 | 时间存储方式 | 「次日」如何表达 | schema 改动 |
|---|---|---|---|
| **timebox** | 绝对 `timestamptz`（start/end） | 选次日的绝对时刻（周三 00:30） | **无**（已是绝对时间） |
| **appointment** | 绝对 `timestamptz`（start + duration） | datetime 跨天 | **无** |
| **habit** | 相对 `HH:MM` 文本（每日模板） | LDM int，≥1440=次日 | **改列类型** text→int |
| **TemplateRow** | 相对 `HH:MM`（jsonb 例行模板） | LDM int | **无 DDL**（jsonb） |

> **洞察**：timebox/appointment 存**绝对时间**，「次日」只是 UI 选个次日的绝对时刻，零 schema 改动。只有 habit/template 存**相对时间**，才需要 LDM 表达 day offset。

**habit 列迁移**（`schema.ts:274-276`）：

```
default_time        text  → integer（LDM）  建议 rename default_start_ldm
earliest_time       text  → integer（LDM）  建议 rename earliest_start_ldm
latest_start_time   text  → integer（LDM）  建议 rename latest_start_ldm
```

- 类型 text→int 已强制所有 consumer 改造（HH:MM 串处理 → int），故**建议同时 rename** 带 `_ldm` 后缀以避免未来误读为 HH:MM。最终标识符由 plan 定。
- USOM `Habit` interface（`objects.ts:453-478`）对应字段类型 `string`→`number`，语义注释为 LDM。
- 既有 validator 的 `/^\d{2}:\d{2}$/` 正则改为 LDM 范围校验（如 `0..2880`，覆盖 2 天）。

**TemplateRow**（`schema.ts:738-755`）：`defaultStart / earliestStart / latestStart` 由 `HH:MM string` → `number`（LDM），jsonb 内，无 DDL。

### 3.4 只读视图 `v_schedule_slots`（统计唯一入口）

```sql
CREATE OR REPLACE VIEW public.v_schedule_slots AS
SELECT id, user_id, logical_day_id, title, start_time, end_time,
       activity_archetype_id, source_type, source_status, slot_state, people, tags
FROM (
  SELECT id, user_id, logical_day_id, title, start_time, end_time,
         activity_archetype_id, tags,
         'timebox'::text    AS source_type,
         status             AS source_status,
         CASE status WHEN 'logged'    THEN 'completed'
                     WHEN 'cancelled' THEN 'cancelled'
                     ELSE 'scheduled' END        AS slot_state,
         NULL::jsonb        AS people
  FROM timeboxes
  UNION ALL
  SELECT id, user_id, logical_day_id, title, start_time,
         start_time + (duration_min * interval '1 minute') AS end_time,
         activity_archetype_id, NULL::jsonb AS tags,
         'appointment'::text AS source_type,
         status              AS source_status,
         CASE status WHEN 'completed' THEN 'completed'
                     WHEN 'cancelled' THEN 'cancelled'
                     ELSE 'scheduled' END        AS slot_state,
         people
  FROM appointments
) s;

COMMENT ON VIEW v_schedule_slots IS
  '[029] 统一 schedule 统计入口。IRON RULE: 任何 schedule 统计/聚合必须查本视图，
   禁止裸查 timeboxes 或 appointments（会漏另一类导致统计错误）。
   appointment.end_time 为派生列(start+duration)，不可索引——范围查询请按 logical_day_id 过滤。';
```

- **`slot_state` 归一化** 3 态 `{scheduled, completed, cancelled}`，完成率等统计不必再各自映射两套状态机；`source_status` 保留原值。
- **已知限制**：appointment 的 `end_time` 派生不可索引 → 铁律：范围查询走 `logical_day_id`（两表均建索引，谓词下推）。
- **为何建视图**：timebox/appointment 分表，开发者易只查一类漏掉另一类 → 视图让「查全」成为默认。**必须让 repository 真的走它**（吸取 `v_running_timeboxes` 僵尸化教训，0036 注释明说 production 无人调用）。

---

## 4. 数据流

### 4.1 写路径（无重算）

```
创建 timebox/appointment
  → 按归属规则定 logical_day_id（显式选定 > date(startTime,tz)）
  → 物理时间存绝对 timestamptz（timebox: start/end；appointment: start+duration）
  → 懒建 logical_days 行（若该日期尚无行）
  → 落库（单事务）

编辑物理时间
  → logical_day_id 不变（粘性），除非用户显式改归属
```

### 4.2 读路径

```
【统计】  ScheduleSlotRepository.findByLogicalDay(id)
          → SELECT ... FROM v_schedule_slots WHERE logical_day_id = ?（走索引）

【今日】  getCurrentLogicalDay(userId)
          → day_label = 今天(user_tz) → 返回该 logical_day + 其 slot 列表
          → AI 规划 / 列表视图 / 编排 都消费它

【LDM→绝对】materialize(ldm, logicalDayLabel, tz)
          → start = tzLocalToUtcMs(label年月日, 0,0, tz) + ldm*60000
          → 复用 lib/tz.ts 既有 helper，次日自动滚入下一天
```

### 4.3 三域创建路径的归属来源

| 创建路径 | logical_day 来源 |
|---|---|
| `/timeboxes` 页面（选定日期） | 页面选定日（显式） |
| `/createTimebox` CNUI | 表单日期字段（默认今天，可改；显式） |
| habit 每日物化 | 物化上下文的「今天」（显式） |
| AI ScheduleProposal | 规划目标日（显式） |
| task → timebox | date(startTime, tz)（默认） |
| 周期 timebox 展开 | date(startTime, tz)（默认） |

---

## 5. 「次日」UI（本次范围）

- **`/timeboxes` 页面**：左上大日期选择器 = 当前 LogicalDay；在该页添加的 timebox 归属此日。时间输入支持「次日」（LDM ≥1440）。
- **`/createTimebox` CNUI**：增**日期字段**（默认今天 user_tz，可改）；时间选择支持「次日」。
- **habit 表单**：3 个时间输入改为 LDM 感知（允许 ≥1440 / 「次日」toggle）。`<Input type="time">` 不再适用（不接受 ≥24:00），换自定义选择器。
- **appointment 表单**：datetime-local 本就跨天；确保 logical_day 用表单选定日。
- **timebox draft 编辑器**（`timebox-draft-editor.tsx`）：现有 +24h 手动跨日 hack（line 90）替换为正规 LDM。

---

## 6. 迁移与回填

### 6.1 迁移 `0038_029_logical_day.sql`（手写，遵循项目惯例；journal idx=38）

```
1. CREATE TABLE logical_days（含计划/复盘列 + CHECK + 索引）
2. ALTER timeboxes     ADD COLUMN logical_day_id + 索引
3. ALTER appointments  ADD COLUMN logical_day_id + 索引
4. ALTER habits:
     default_time / earliest_time / latest_start_time  text→integer
     存量转换: split_part(h,m)::int*60 + split_part → 分钟（HH:MM 均 <24:00 → <1440，全当日）
     （可选 rename 为 *_ldm）
5. CREATE VIEW v_schedule_slots + COMMENT 铁律
6. 登记 migrations/meta/_journal.json idx=38
```

> 注意：项目迁移**一律手写 SQL + psql + 登记 journal**（drizzle db:generate 跑不通，见 [project-drizzle-migrations-handwritten]）。

### 6.2 回填脚本 `scripts/backfill-logical-day.ts`（极简，幂等）

```
对每条 logical_day_id IS NULL 的 timebox/appointment:
  logical_day_id = 懒建(date(startTime, user_tz)) 的 logical_days.id
迁移后跑一次，可重跑（只补 null）。
```

无边界逻辑、无重算——纯日期派生。

---

## 7. 错误处理与边界

| 场景 | 处理 |
|---|---|
| **无锚用户**（无 logical_days 行） | 首次建事件时懒建该日期行 |
| **跨时区切换**（user_tz 变更） | 历史 `day_label` 是存储日期，**不重算**；仅新事件用新 tz。文档写明 |
| **越界归属**（事件归到很远未来/过去） | 允许（显式选择哲学）；v_schedule_slots 按 logical_day_id 分组自洽 |
| **LDM 溢出** | validator 限 `0..2880`（2 天）；超出拒绝 |
| **habit 存量转换** | 假定合法 HH:MM（列 NOT NULL）；`"23:30"`→1410，均 <1440 当日 |
| **未回填事件**（backfill 前） | v_schedule_slots 仍含（logical_day_id=null 行不属任何日）；backfill 必跑 |
| **物理时间与归属不一致** | 允许且粘性（特性，非 bug）；文档写明 |
| **appointment end_time 不可索引** | 铁律：范围查询按 logical_day_id，不按裸 end_time |

---

## 8. 测试策略

| 层 | 用例 |
|---|---|
| **LogicalDayResolver**（纯函数） | 显式 > 默认优先级；默认 = date(startTime,tz)；tz 正确性；粘性（编辑 startTime 不改归属） |
| **LDM 转换** | HH:MM↔分钟；次日边界（1439/1440/1470）；materialize→绝对时刻复用 tz helper |
| **habit 迁移** | 存量 `"23:30"`→1410；`"00:30"`→30（当日，因为存量都 <24:00） |
| **v_schedule_slots** | 完整性（seed timebox+appointment 同 logical_day → 返回 2 行）；slot_state 映射（timebox logged→completed、appointment completed→completed） |
| **ScheduleSlotRepository** | 按 logical_day 查返回两类；空 logical_day 返回空 |
| **回填** | 存量事件得到正确 logical_day；重跑幂等 |
| **UI** | `/timeboxes` 选定日 → 新 timebox 归属该日；`/createTimebox` 日期字段 + 次日；habit 时间 ≥1440 |

> vitest 须在 `frontend` cwd 跑（`@/` 映射）；配 tsc 双验证（vitest 不做类型检查）。

---

## 9. 范围切分

| 本次 [029] | 后续 phase（登记为 follow-up） |
|---|---|
| logical_days 表 + 计划/复盘**列** | 计划/复盘**填写 UI**（/timeboxes 早计划卡 + 晚复盘卡） |
| timebox/appointment logical_day_id | 能量基准 4 维化（如需，对齐 archetype EnergyCost） |
| LDM + habit 列迁移 + 三域次日 UI | habit 最早/最迟窗口的进一步跨日细化 |
| v_schedule_slots + Repository | OS-TZ 泄漏点（filter-bar/timeline）顺带收敛 |
| 回填脚本 | — |

---

## 10. constitution 合规

- **R-01..R-04** Repository Pattern：`ScheduleSlotRepository` 包装视图；logical_days 经 Repository 访问 ✓
- **T-01..T-04** Multi-Tenancy：`logical_days.user_id` NOT NULL，索引前置 user_id ✓
- **§DB JSONB Forbidden**：时间/边界均为实列（timestamptz/date/integer），非 jsonb ✓；LDM 是 integer 实列 ✓
- **§II Single-Writer**：归属写入在单事务内 ✓
- **Tier-2 文档同步**：`database-design.md` + `usom-design` 必须登记 logical_days 表、LDM 模型、v_schedule_slots 视图及铁律

---

## 11. 验收标准

- **AC-1**：建睡眠 habit（LDM start=1410/23:30, latest=1470/次日00:30）→ 物化 timebox 跨日正确，logical_day=当日
- **AC-2**：`/timeboxes` 选「周二」建 22:00–次日02:00 timebox → logical_day=周二；手动改归属到周三生效且粘性
- **AC-3**：`/createTimebox` CNUI 日期字段默认今天、可改；选次日时间正确物化
- **AC-4**：`v_schedule_slots` 对同一天返回 timebox+appointment 两类；slot_state 归一正确
- **AC-5**：AI「规划今天」（深夜 23:00 调）→ 规划今天日期逻辑日，含跨凌晨 timebox
- **AC-6**：backfill 后无 logical_day_id=null 的事件
- **AC-7**：vitest base/head 零回归（按被改文件集合对比）；tsc 0 新增错误
- **AC-8**：dev server `/timeboxes` HTTP 200，0 RSC 错误

---

## 12. 关键决策日志（brainstorm 阶段）

| # | 决策 | 理由 |
|---|---|---|
| D1 | 逻辑日 = 日期桶，**不**做边界派生 | 显式选择 > 自动判定；砍掉重算/锁定/anchor 等机械装置 |
| D2 | 不物化 appointment→timebox | appointment 永不周期 → 物化=纯复制+同步负担；用 `v_schedule_slots` 视图拿统一视图 |
| D3 | LDM（int 相对分钟）表达「次日」 | 三域统一、次日自动（≥1440）、无 flag/offset 列 |
| D4 | timebox/appointment 零 schema 改动支持次日 | 已存绝对 timestamptz，次日=选次日的绝对时刻 |
| D5 | habit 3 列 text→int（LDM）+ 建议 rename | 类型变已强制 consumer 改造，顺带 rename 避免 HH:MM 误读 |
| D6 | logical_days 留薄表（A） | 保住复盘锚点 + 视图稳定 FK，零边界逻辑 |
| D7 | 计划/复盘列本期建、UI 后做 | 数据有家，控制本次爆破半径 |
| D8 | 删 is_day_boundary_marker / dayAnchorHour | 无边界派生 → 两者无用 |
| D9 | 不保留 auto/user assignment 枚举 | 无重算 → 归属粘性，无行为分支 |
| D10 | 「次日」建模纳入本次（option 2 全包） | 用户选择一个 spec/plan 全包，含 habit 列迁移 + 三域 UI |
