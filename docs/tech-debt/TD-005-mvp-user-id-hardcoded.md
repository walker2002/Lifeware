---
id: TD-005
title: MVP_USER_ID 硬码(占位用户身份未走认证)
status: 登记
created: 2026-07-06
last_updated: 2026-07-06
---

# TD-005: MVP_USER_ID 硬码(占位用户身份未走认证)

> 摘要：MVP 阶段 user_id 在代码中以 `'mvp_user'` 硬编码常量形式存在,未走认证系统。所有读写操作隐式归到该用户,造成数据隔离测试无法做、多用户场景无法演示。

## 元信息

| 字段 | 值 |
|---|---|
| 严重性 | 🟡 Medium |
| 类别 | 架构 |
| 领域 | `infra` |
| 录入版本 | v0.X.X ([023.10]) |
| 负责人 | 暂未指派 |
| 修复目标版本 | 未知(取决于认证模块何时落地) |
| 关联 PR/分支 | N/A(pre-existing) |
| 关联 Constitution 条款 | T-01 ~ T-04(多租户约束) |

## 现象（What）

- 所有 repository 方法调用未传 user_id,内部自动用 `MVP_USER_ID = 'mvp_user'`
- 多用户切换测试需手动改常量
- `T-01 ~ T-04` 多租户约束实质上未生效

## 根因（Why）

- MVP 阶段简化设计,跳过认证模块,user_id 用常量兜底
- 设计时假设"上线前会接 NextAuth 等认证",但认证模块一直未排期
- 涉及面广(几乎所有 handler),没人愿意专门做迁移

## 影响（Impact）

| 维度 | 影响 |
|---|---|
| 业务 | 单用户演示可以,多用户场景无法演示 |
| 用户 | 无直接用户影响 |
| 技术 | 宪章 T-01 ~ T-04 多租户约束在代码层面失效 |
| 范围 | 全仓库 grep `MVP_USER_ID` 命中处 |
| 严重性依据 | MVP 阶段可控,但阻塞多租户场景测试 |

## 触发场景（When）

- 触发条件：尝试做多用户隔离测试 / 演示
- 复现步骤：grep -r "MVP_USER_ID" frontend/src
- 出现频率：100%(代码中存在)

## 临时方案（Workaround）

- 手动修改常量值做临时多用户测试
- 测试后改回 `'mvp_user'`

## 理想修复（Ideal Fix）

- **方案 A（推荐）**：引入认证模块(NextAuth 或自研),所有 handler 强制从 session 取 user_id,移除 `MVP_USER_ID` 常量
- **方案 B**：临时方案升级,user_id 从 query string / header 取(纯演示用)
- **方案 C**：维持现状,延后到上线前再做

## 修复成本评估

| 维度 | 评估 |
|---|---|
| 工作量 | 5-10 人日(认证 + 全仓库迁移) |
| 风险 | 高(全仓库扫,涉及安全) |
| 前置依赖 | 认证模块选型 + 数据迁移策略 |
| 是否跨域 | 是(跨所有域) |
| 是否影响 manifest | 否 |
| 是否需要 Drizzle migration | 否 |
| 是否需要宪章修订 | 否(T-01~T-04 已存在) |

## 验收标准（Done Criteria）

- [ ] 认证模块接入(mvp 先用 mock provider)
- [ ] 全仓库 grep `MVP_USER_ID` 命中 = 0
- [ ] vitest 多用户隔离测试通过(用户 A 操作不影响用户 B)
- [ ] 宪章 T-01~T-04 实际生效

## 跟踪记录（History）

- 2026-07-06 · [023.10] · 创建条目
- 2026-07-12 · 「技术债清除会话[001-002]」调研 + 决策:
  - **实际数据**:`grep -rn MVP_USER_ID frontend/src` = 283 处引用,**全部使用同一 canonical UUID** = `'00000000-0000-0000-0000-000000000001'`(位于 `scripts/seed-mvp-user.ts` 作为 source of truth)。
  - **TD-005 创建时描述的"mvp_user"字符串已过期** — [023.10] 之后迭代到 UUID 形式(supabase auth 兼容)。
  - **MVP 阶段评估**:单用户演示需求下,283 处引用同一 canonical 常量是**合理设计意图**,不是 bug。`T-01~T-04` 多租户约束在 multi-user 启用时才真正生效。
  - **决策**:本会话不动代码。MVP 阶段多用户场景尚未启用,等认证模块(NextAuth / Supabase Auth)进入 plan 才整体性迁。
  - **潜在 fix 路径**(留待 multi-user 启用时统一治理):
    - 抽 `lib/auth/user-context.ts` 导出 `getCurrentUserId()` (env var / session-aware)
    - 调用点改 import 路径(283 处机械改动)
    - mock middleware 为认证过渡预留 hook
    - 评估归 [[project-domain-paradigm-tech-debt]] 跨域治理(与 [[td-035]] updateFields helper 同根因)
- 2026-07-12 · **TD-005 状态维持登记**:MVP 设计意图 + 多用户场景未启用 + 改动涉及面广;不做早动作。,源自 Codex cold read(2026-07-05 [023.07] 7 PRE-EXISTING 债)
- 2026-05-XX · MVP 阶段简化设计引入

## 关联

- 相关技术债：[[TD-004]] (跨域写入口债,同 root:认证/权限架构未落地)
- 相关 PR：N/A(pre-existing)
- 相关 memory：`[[project-023-07-pre-existing-cleanup]]`
- 相关约束：`.specify/memory/constitution.md` T-01~T-04 多租户约束