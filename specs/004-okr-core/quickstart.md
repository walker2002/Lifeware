# Quickstart: OKR 核心管理 (004-okr-core)

**Date**: 2026-05-10 (updated 2026-05-11) | **Branch**: `004-okr-core`

## 前置条件

- PostgreSQL 运行中 (`docker-compose up -d`)
- 现有数据库已迁移到最新版本

## 开发步骤

### 1. 数据模型更新

```bash
cd frontend

# 1. 更新 USOM 类型 → 2. 更新 Schema → 3. 生成迁移
npm run db:generate
npm run db:migrate
```

**顺序**: USOM 类型 → Schema 代码 → 迁移文件 → Tier 2 文档

### 2. Repository 扩展

在现有 `objective.repository.ts` 和 `key-result.repository.ts` 中新增方法：
- 按状态/周期查询
- 进度更新
- 批量状态变更

### 3. State Machine + Domain Plugin

1. 在 `transitions.ts` 中新增 Objective/KeyResult 转换定义
2. 创建 `domains/okrs/index.ts` 实现四钩子
3. 在 Orchestrator 中新增 `executeOKRIntent` 方法

### 4. UI 页面

1. `app/(main)/okr/page.tsx` — 列表页
2. `app/(main)/okr/new/page.tsx` — 创建页
3. `app/(main)/okr/[id]/page.tsx` — 详情页
4. `components/okr/` — 共享组件

### 5. 测试

```bash
# 领域插件测试
npx vitest run domains/okrs/__tests__/

# Repository 测试
npx vitest run lib/db/repositories/__tests__/
```

## 关键文件索引

| 变更类型 | 文件 |
|----------|------|
| USOM 类型 | `frontend/src/usom/types/objects.ts`, `primitives.ts` |
| DB Schema | `frontend/src/lib/db/schema.ts` |
| Repository | `frontend/src/lib/db/repositories/objective.repository.ts`, `key-result.repository.ts` |
| Mapper | `frontend/src/lib/db/repositories/mappers.ts` |
| State Machine | `frontend/src/nexus/core/state-machine/transitions.ts` |
| Domain Plugin | `frontend/src/domains/okrs/index.ts` |
| Orchestrator | `frontend/src/nexus/orchestrator/index.ts` |
| Tier 2 文档 | `docs/usom-design.md`, `docs/database-design.md` |

## 注意事项

- **顺序约束**: USOM 类型 → Schema → Repository → State Machine → Domain Plugin → UI
- **Tier 2 同步**: 每次 USOM/Schema 变更都必须先更新 `docs/usom-design.md` 和 `docs/database-design.md`
- **现有 FK**: `tasks.key_result_id` 和 `habits.key_result_id` 已存在，无需新增关联表
- **无 API Route**: MVP 阶段 UI 直接通过 Repository 访问数据，不走 route handler

---

## Enhancement Steps (2026-05-11)

### E1. Bug 修复（优先）

1. **Bug #1**: `irepository.ts` 新增 findAll → `objective.repository.ts` 实现 → `actions/okr.ts` 调用
2. **Bug #2**: `okr-detail.tsx` 编辑模式 initial prop 补充 keyResults
3. **Bug #3**: `use-okrs.ts` 新增 updateLocal → OKRWorkspace 统一管理状态

### E2. 数据模型扩展

```bash
cd frontend

# 顺序: USOM 类型 → Schema → Migration → Mapper → Repository → Actions
# 1. 更新 USOM: PeriodType + Objective 新增字段
# 2. 更新 Schema: objectives 新增列, period_type 枚举扩展
# 3. 生成迁移
npm run db:generate
npm run db:migrate
# 4. 更新 Mapper + Repository + Actions
```

### E3. UI 重设计

1. 新增确认弹窗（或直接用 AlertDialog）
2. 创建 OKRWorkspace 双栏容器
3. 创建 OKRDirectory 左栏目录
4. 创建 OKRPanel 右栏面板
5. 更新 OKRForm（priority + period 自动填充）
6. 更新 ObjectiveCard（编号 + 优先级）
7. 更新 useOKRs hook
8. 更新 page.tsx 入口

### E4. Tier 2 文档同步

- 更新 `docs/usom-design.md`（Objective 新增字段, PeriodType 新增 SemiAnnual）
- 更新 `docs/database-design.md`（objectives 新增列）

### E5. 验证

1. 创建 Objective 验证编号自动生成
2. 切换周期类型验证日期自动填充
3. 验证双栏联动（选择、编辑、操作切换）
4. 验证"全部"筛选显示所有非归档 OKR
5. 验证编辑保存后列表无空白闪烁
6. 验证删除/废弃操作弹出确认对话框
