# 宪法修订提案：§IX 规则三层范式收敛（registry 即 SSOT）+ 字段三分类澄清

> **状态**：✅ **EFFECTIVE（2026-06-24）** — 已实施，constitution v2.1.0
> **来源**：[020] 去 manifest C/L 范式重构（design doc `docs/superpowers/specs/2026-06-23-020-rules-management-redesign.md`）
> **版本影响**：**MINOR**——manifest `rules:` 声明层移除、registry 升为 SSOT（实质性治理扩展），2.0.0 → 2.1.0。

## 提案文本

### §IX 约束 2（跨字段红线）修正
删除现行第 531 行「否则 inline 编辑静默绕过业务规则」（诱导性措辞，把 inline 编辑与 FactField 绑死）。
修正后：「带跨字段/跨对象业务不变量的写入，禁止走字段路径（其不经全量 `onValidate`）；必须经 `executeIntent`（或显式 rule 校验 step）。」

### §IX 约束 3（规则三层）修正
删除「manifest `rules:` 声明规则」部分。
修正后：「每个有写路径的 Domain 必须在 `rules-registry` 注册处理器（registry 即 SSOT，自带 phase/fields/message meta）+ `onValidate` 委托 `evaluateDomainRules`。」

### §VIII 规则三层架构治理修正
删除「治理约束（manifest `rules:` 区块）」小节中「manifest 每个 `rule.id` 必须在域 registry 注册；`scripts/validate-manifest.ts` 强制」——manifest rules 区块已删，此约束自然消失。

### §III 字段三分类补充说明
在字段三分类表后补：「`FactField` ≠ 必须可 inline 编辑的字段——能否 inline 由是否存在 `phase: both` realtime rule 决定（UX 轴），与写入路径（mutation_mode 轴）正交。」

## Superseding Language
本提案 SUPERSEDE 现行 §IX 约束 3 中「manifest `rules:` 声明规则 + `rules-registry` 注册处理器」表述，改为「registry 即 SSOT」。跨字段红线（§IX 约束 2）原则不变，仅删诱导性措辞。

## Rationale
- 议题1：消除「inline 编辑 ⟹ FactField」诱导（mutation_mode 正交轴裂缝）。
- 议题2：manifest L 区 rules 是 registry 的冗余镜像，声明式承诺（改规则不改代码）未兑现，CI `G-rule-integrity` cross-check 是循环论证。

## Impact Analysis
- 原则冲突：无（registry 即 SSOT 不改变规则三层语义，仅消除冗余声明层）。
- 影响域：Tasks、Habits（完整迁移）；OKR/Timebox 维持旧范式，sunset 记债。
- 工具链：`scripts/validate-manifest.ts` 删区块 G；`integrity.ts` 删除。
- Tier-2 同步：`docs/domain-development-guide.md` 规则三层描述同步。

## 生效状态（✅ EFFECTIVE 2026-06-24）
- [x] 书面 rationale + impact analysis（上）✅
- [x] 无原则冲突核验（上）✅
- [x] 版本递增 MINOR 2.0.0→2.1.0 ✅（constitution.md 5e880fb）
- [x] constitution.md 更新 + Spec Kit 模板一致性传播 ✅
- [x] manifest.md 版本历史更新 ✅（Task 6.3）
