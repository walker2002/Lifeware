# Data Model: OKR 核心管理 (004-okr-core)

**Date**: 2026-05-10 (updated 2026-05-11) | **Branch**: `004-okr-core`

## 1. 实体变更

### 1.1 Objective

**现有字段**: id, status, title, description, period{type,start,end}, parentId, keyResultIds, tags, createdAt, updatedAt, completedAt, archivedAt

**新增字段**:

| 字段 | 类型 | 说明 | 验证规则 |
|------|------|------|----------|
| `okrType` | `'visionary' \| 'committed'` | OKR 类型 | 默认 `'committed'` |
| `discardedAt` | `Timestamp?` | 废弃时间 | 仅 status=discarded 时有值 |

**状态枚举变更**:

```
现有: 'draft' | 'active' | 'paused' | 'completed' | 'archived'
新增: 'discarded'
最终: 'draft' | 'active' | 'paused' | 'completed' | 'discarded' | 'archived'
```

### 1.2 KeyResult

**现有字段**: id, objectiveId, title, description, targetValue, currentValue, unit, progressRate, status, dueDate, createdAt, updatedAt

**新增字段**:

| 字段 | 类型 | 说明 | 验证规则 |
|------|------|------|----------|
| `discardedAt` | `Timestamp?` | 废弃时间 | 仅 status=discarded 时有值 |

**状态枚举变更**: 与 Objective 同步新增 `'discarded'`

### 1.3 SystemEventType 新增

```
'ObjectiveCreated' | 'ObjectiveActivated' | 'ObjectivePaused' | 'ObjectiveResumed'
'ObjectiveCompleted' | 'ObjectiveDiscarded' | 'ObjectiveArchived'
'KeyResultUpdated' | 'KeyResultCompleted' | 'KeyResultProgressUpdated'
```

## 2. 状态转换

### 2.1 Objective 状态机

```
(null) ──create──→ draft ──activate──→ active ⇄ pause ──resume──→ active
                     │                   │        │
                     │              complete   discard
                     │                   │        │
                   discard          completed  discarded
                                       │        │
                                    archive  archive
                                       ↓        ↓
                                    archived ←──┘
```

**转换规则**:

| From | To | Action | 前置条件 |
|------|----|--------|----------|
| null | draft | create | title 非空 |
| draft | active | activate | ≥1 KR, periodEnd > periodStart, title 非空 |
| draft | discarded | discard | 无 |
| active | paused | pause | 无 |
| active | completed | complete | 无 |
| active | discarded | discard | 无 |
| paused | active | resume | 无 |
| paused | discarded | discard | 无 |
| completed | archived | archive | 无 |
| discarded | archived | archive | 无 |

### 2.2 KeyResult 联动

Objective 状态变更时，KR 状态同步：

| Objective Action | KR 状态变更 |
|-----------------|-------------|
| activate | draft KR → active |
| pause | active KR → paused |
| resume | paused KR → active |
| complete | active/paused KR → completed |
| discard | 所有 KR → discarded |
| archive | 所有 KR → archived |

KR 独立操作：
- `updateProgress`: 更新 currentValue, 重算 progressRate, 不改变状态
- currentValue ≥ targetValue 时: KR 自动 completed

## 3. 数据库变更

### 3.1 objectives 表

```sql
ALTER TABLE objectives ADD COLUMN okr_type TEXT NOT NULL DEFAULT 'committed';
ALTER TABLE objectives ADD COLUMN discarded_at TIMESTAMP WITH TIME ZONE;
-- status 枚举新增 'discarded'（通过 Drizzle 迁移处理）
```

### 3.2 key_results 表

```sql
ALTER TABLE key_results ADD COLUMN discarded_at TIMESTAMP WITH TIME ZONE;
-- status 枚举新增 'discarded'
```

### 3.3 无新表

所有变更通过修改现有表完成。事件记录复用 system_events 表。

## 4. 验证规则

### Objective 创建/更新

| 字段 | 规则 |
|------|------|
| title | 非空, ≤ 200 字符 |
| okrType | 枚举值 `'visionary' \| 'committed'` |
| periodStart | 激活时必须有值 |
| periodEnd | 激活时必须有值且 > periodStart |

### KeyResult 创建/更新

| 字段 | 规则 |
|------|------|
| title | 非空, ≤ 200 字符 |
| targetValue | > 0 |
| currentValue | [0, targetValue] |
| unit | 非空, ≤ 20 字符 |

### 激活前置条件

1. 至少 1 个 draft KeyResult
2. periodStart 和 periodEnd 已设置
3. periodEnd > periodStart
4. title 非空

---

## Enhancement Data Model (2026-05-11)

### 5. Objective 新增字段

| 字段 | 类型 | 说明 | 验证规则 |
|------|------|------|----------|
| `objectiveNumber` | `string` | 自动生成编号，如 26Q1-O1 | 用户级唯一，创建时自动生成，不可手动修改 |
| `priority` | `'P0' \| 'P1' \| 'P2'` | 重要程度 | 默认 `'P1'`，P0=必须完成，P1=应该完成，P2=有余力则做 |

### 6. PeriodType 枚举扩展

```
现有: Daily | Weekly | Monthly | Quarterly | Annual
新增: SemiAnnual
最终: Daily | Weekly | Monthly | Quarterly | SemiAnnual | Annual
```

OKR 表单仅展示: Annual | SemiAnnual | Quarterly | Monthly（不展示 Daily/Weekly）

### 7. 编号生成规则

| 层次 | 前缀计算 | 示例 |
|------|----------|------|
| annual | `YY` + 'Y' | 26Y-O1, 26Y-O2 |
| semi_annual | `YY` + 'H1'/'H2'（按 periodStart 判断） | 26H1-O1, 26H2-O1 |
| quarterly | `YY` + 'Q1'~'Q4'（按 periodStart 月份计算） | 26Q1-O1, 26Q1-O2 |
| monthly | `YY` + 'M' + `MM` | 26M05-O1 |

序号规则: 同一 userId + 同一前缀下，按已有 O 数量自增。编号一旦分配不再变更，删除不重排。

### 8. 数据库迁移 (0004_okr_enhance.sql)

```sql
-- objectives 新增字段
ALTER TABLE objectives ADD COLUMN objective_number TEXT;
ALTER TABLE objectives ADD COLUMN priority TEXT NOT NULL DEFAULT 'P1';

-- period_type 枚举扩展
ALTER TABLE objectives ALTER COLUMN period_type TYPE TEXT;
-- (Drizzle text enum 无需 ALTER TYPE，直接扩展即可)

-- 回填已有数据的编号
-- (需在迁移后通过应用逻辑执行)
```

### 9. 周期自动填充规则

| 周期类型 | 起始日期 | 结束日期 |
|----------|----------|----------|
| 年度 | YYYY-01-01 | YYYY-12-31 |
| 半年度 | 1-6月: YYYY-01-01, 7-12月: YYYY-07-01 | 1-6月: YYYY-06-30, 7-12月: YYYY-12-31 |
| 季度 | Q1: 01-01, Q2: 04-01, Q3: 07-01, Q4: 10-01 | Q1: 03-31, Q2: 06-30, Q3: 09-30, Q4: 12-31 |
| 月度 | YYYY-MM-01 | 当月最后一天 |

判断规则均基于当前日期自动计算，用户可手动微调。

### 10. 验证规则扩展

| 字段 | 规则 |
|------|------|
| priority | 枚举值 `'P0' \| 'P1' \| 'P2'`，默认 P1 |
| objectiveNumber | 系统生成，不可为空（创建后） |
| periodType (OKR 表单) | 仅允许 annual/semi_annual/quarterly/monthly |

