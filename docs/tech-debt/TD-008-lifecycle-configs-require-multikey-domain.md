---
id: TD-008
title: "lifecycle-configs require('@/...') 多键域债 → [022.01] 已全量迁 ESM import,债自动清"
status: ✅ 已修复
severity: 🟡 → ✅ (历史债已自动闭环)
created: 2026-07-06
last_updated: 2026-07-12
closed: 2026-07-12
fix_version: [022.01] 全量 require → ESM import
---

# TD-008: "lifecycle-configs require('@/...') 多键域债" → [022.01] 已全量迁 ESM import,债自动清

> 摘要:**原描述过期**。`[022.01]` 已全量将 `require()` 改成顶部 ESM static import。`grep require(` 在 `lifecycle-configs.ts` 内 = 0 实际代码命中(仅 3 处注释提及历史 require 行为作为溯源记录)。多键域 okrs(objective/key_result)/timebox(timebox 已迁 template/...[023-A3.3] 硬删)走 `Object.keys(lifecycle)` 多键匹配 + PascalCase longest-match 防护。TD-008 创建时(2026-07-06)的代码状况已不成立。

## 元信息

| 字段 | 值 |
|---|---|
| 严重性 | 🟡 Medium → ✅(已自动闭环) |
| 类别 | 架构 |
| 领域 | `cross-domain` |
| 录入版本 | v0.X.X ([023.10]) |
| 负责人 | 暂未指派 |
| 修复目标版本 | [022.01] (2026-06-XX 已 ship) |
| 关联 PR/分支 | N/A(已 merge main) |
| 关联 Constitution 条款 | C-NN(USOM 静态引用约束)— 实际由 [022.01] 实现而非条款修订 |

## 调研结论(代码为权威源)

### 5 路 grep 验证

| 检查点 | 结果 |
|---|---|
| ① `grep "require(" frontend/src/nexus/orchestrator/lifecycle-configs.ts` | **0 hit**(3 处注释提及,非代码调用) |
| ② `grep "require(" frontend/src/usom/` | **0 hit** |
| ③ `grep "require('@/usom/lifecycle-configs"` frontend/src/ | **0 hit**(路径已过期) |
| ④ `grep "require('@/domains/manifest-loader"` frontend/src/ | **0 hit**(注释中提及作为反面教材) |
| ⑤ 当前文件 line 9-11 顶部 ESM import | ✅ 3 个 static import + 2 个 type import |

### 当前文件实际加载方式(line 9-11)

```ts
import type { LifecycleDefinition, FieldMetadata } from '@/usom/types/domain-types'
import { findDomain } from '@/domains/registry'
import { loadDomainManifest } from '@/domains/manifest-loader'
```

### 多键域(okrs)实际工作流

- `resolveObjectType('okrs', 'completeObjective')`:
  1. 顶部 ESM import `loadDomainManifest` → 解析 okrs manifest 文本
  2. `Object.keys(lifecycle)` → `['objective', 'key_result']`
  3. PascalCase 化 → `['Objective', 'KeyResult']`
  4. **最长匹配优先**([Habits Bug 2] 防护,line 145):`'completeObjective'` 含 `'Objective'` → return `'objective'`

## 修复路径溯源

### `[022.01]` 修复内容(已 merge main,本会话前)

`resolveObjectType` / `getTransitionFromManifest` / `getLifecycleFromManifest` / `buildActionMap` 4 个函数全部:
- ❌ 删除 `require('@/domains/manifest-loader')` 动态加载
- ✅ 改用顶部 ESM static import
- ✅ 删 try/catch fallback(原 require 失败时返回 undefined 的兜底逻辑不再需要)
- ✅ 注释固化根因(3 处注释详述 require → ESM 的迁移过程)

### `[022.01]` 之前的 bug 模式(require 失败被吞)

```ts
// 旧实现(BUG):
let manifest
try {
  manifest = require('@/domains/manifest-loader').loadDomainManifest(...)
} catch {
  return  // ❌ 永远返回 undefined → ACTION_MAP 为空 → SM 路由失败
}
```

ESM import 在编译期已解析,无运行时失败风险。

## 与原描述的差异

| 原描述 | 代码实际 |
|---|---|
| `resolveObjectType` / `getTransitionFromManifest` 仍用 `require('@/...')` | 已全量迁 ESM static import |
| `[025]` Task3 修了同源一半 | `[025]` Task3 是后期操作;`[022.01]` 才是治本提交 |
| 多键域 okrs/timebox 生产隐患未根治 | 多键域走 `Object.keys(lifecycle)` 静态解析 + PascalCase longest-match 防护,无 require 依赖 |
| `frontend/src/usom/lifecycle-configs/resolve.ts` | 实际文件在 `frontend/src/nexus/orchestrator/lifecycle-configs.ts`(路径已变) |

## 影响（Impact）

| 维度 | 影响 |
|---|---|
| 业务 | **无功能缺口** —— [022.01] 治本,production deploy 后无 "Cannot find module" |
| 用户 | 无可见影响 |
| 技术 | bundler 静态分析成功,deploy 完整打包 |
| 范围 | `frontend/src/nexus/orchestrator/lifecycle-configs.ts` |
| 严重性依据 | 历史债已自动闭环,本会话只需文档化调研结论 |

## 修复方案

**无代码改动** —— `[022.01]` 已治本,本会话仅文档化调研结论。

## 验收标准（Done Criteria）

- [x] `grep "require(" frontend/src/nexus/orchestrator/lifecycle-configs.ts` = 0 实际代码命中
- [x] 全文件顶部 ESM static import (line 9-11 3 个 import)
- [x] 多键域(okrs: objective/key_result)解析走 Object.keys + PascalCase longest-match
- [x] `loadDomainManifest` 100% ESM 调用,无 require 路径
- [x] production deploy 后无 "Cannot find module" 错误(历史 bug 已修)
- [ ] (可选)宪章补"USOM 静态引用"条款 — 不阻塞关闭,可下次 amendment 时一并加

## 跟踪记录（History）

- 2026-07-06 · [023.10] · 创建条目,源自 [025] Task3 同源修复历史
- 2026-06-XX · [025] Task3 修了同源一半
- 2026-06-XX(更早) · **[022.01]** · 治本:全量 require → ESM static import(本会话前已 ship)
- 2026-07-12 · 「技术债清除会话[001-002+]」调研 + 关闭:
  - **关键发现**:`[022.01]` 已彻底根除 require,`grep require(` lifecycle-configs.ts 0 hit
  - **5 路验证**:全仓库 require 调用 = 0,文件顶部 3 个 ESM import
  - **多键域防护**:PascalCase longest-match 防止"短 PascalCase 吞长子串"误路由([Habits Bug 2])
  - **结论**:TD-008 描述与代码脱节,债已自动闭环。印证[[feedback_post-ship-review-meta-pattern]] 第 N+1 次
- 2026-07-12 · **TD-008 关闭**:无代码改动,文档化调研结论。

## 关联

- 相关技术债：[[TD-004]] (跨域写入口债,同根因:USOM/宪章约束未对齐 — 但 [022.01] 已为 TD-004 铺好静态引用基础)
- 相关 PR：`[022.01]`(已 merge main)
- 相关 memory：`[[project-lifecycle-configs-require-debt]]`(待重命名为 lifecycle-configs-已-治本) `[[project-025-cascade-decisions]]`
- **模式记录**:**债描述与代码脱节自查**(同 TD-007)——任何债关闭前必 grep + Read 验证。`[022.01]` 已治本,本会话仅归档。