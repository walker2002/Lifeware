# [020] 系统规则管理架构重设计

> **状态**：DESIGN — `/office-hours` 产出（2026-06-23），锁定 D1/D2/D3 三项核心决策。待 `/writing-plans` 展开 spec + plan，再经 `/plan-eng-review`。
> **上游**：`mydocs/dev/020-对于系统规则管理的设计.md`（用户初步需求）+ `.specify/amendments/revisit-manifest-rules-design-tensions.md`（待 revisit 存档：mutation_mode 正交轴裂缝 + manifest C/L 过度设计）。
> **下游影响**：constitution §IX 约束 2/3、§III 字段三分类；`docs/domain-development-guide.md`；`scripts/validate-manifest.ts` + `validate-domain-structure.ts`；Tasks/Habits 两域。

---

## 1. 问题

两个纠缠在一起的问题，本质都是「规则的定义、触发、归属」没在更高层理清：

### 1.1 规则执行：混合态字段绕过聚合校验（revisit 存档案题1，已确认为实案）

`mutation_mode`（FactField/ContentField/PresentationField）把两个正交轴绑死——「前端可 inline 编辑 + realtime 校验」与「后端写入校验粒度」。带跨字段约束的字段（如 habits `latestStartTime` 参与 `earliestTime ≤ defaultTime ≤ latestStartTime`）落在三值空档。

**实案（本次 office-hours 查证）**：`updateTask`（`app/actions/tasks.ts:108-123`）把 `task-edit-zone` 的批量 draft **拆成多次 `service.update` 单字段写**：

```typescript
for (const [field, value] of Object.entries(input)) {
  const res = await service.update(taskId, field, value, ...)  // 逐字段，只字段级校验
}
```

每次 `service.update` 只走 field-executor 字段级校验（enum/number/time，`field-executor/index.ts:72-107`），**不跑聚合校验，且无事务**。用户同时改 `startDate`/`dueDate` 时，`startDate ≤ dueDate` 全程不被检查，中途崩溃留半截改动。habits `updateHabit` 是否同病待 plan 阶段核对（habits handlers 走 `submitDynamicIntent`→executeIntent，可能已正确）。

### 1.2 manifest 区块 C/L 过度设计（revisit 存档案题2）

- **区块 C `field_metadata`**：`label`/`required`/`default_value`/`description` 零运行时消费（前端表单手写，不读 manifest）；`lifecycle_timestamp` 类型 `@deprecated`；`synonyms` TODO 未实现。仅 `type`/`options`/`mutation_mode` 被后端写入链路消费。
- **区块 L `rules`**：是 `rules-registry.ts` 的冗余镜像（`phase`/`message`/`fields`/`id` 全冗余）；声明式承诺（改规则不改代码）未兑现；CI `G-rule-integrity` cross-check 是循环论证；`get-realtime-rules` 绕道多余（registry 是 client-safe 纯 TS，前端可直 import）。
- **根因**：越过声明式配置合理边界（「须存在一个不改代码的消费方读它」）。区块 A/B/K/G 是真配置（公共层 nexus 消费），问题只在 C/L。

---

## 2. 目标（对齐 020，纠偏「动态」措辞）

- **规则分类清晰**：Business / Governance / Policy 三类，边界无歧义。
- **触发层次清晰**：UI realtime / submit 聚合 / Policy（defer）。
- **规则集中管理**（020 原文「更好的动态规则管理能力」纠偏）：指 **Business Rule 集中在域代码里好找好维护**（D1=B），**不是**运行时配置化。020 那句「动态」实际指向尚未开发的 Policy Rule（第三类），与本次 Business Rule 处理无关。

---

## 3. 核心决策（office-hours D1/D2/D3）

### D1 — Business Rule 集中管理进代码（砍 C/L 冗余）；「动态」指 Policy，本次不做
- Business Rule = 固定常识、Domain 内数据正确性 → 集中在域代码（registry/域文件），砍 manifest C/L 冗余。
- Policy Rule 的「动态管理」= 本次只留 TODO，等四域完善后另立规则注册引擎。

### D2 — Tasks+Habits 完整做；OKR/Timebox 用 sunset 豁免显式记债
- 去 C/L 是范式级改动（动 §IX/§III + validator + 四域模板）。Tasks+Habits 先完整迁新范式；OKR/Timebox 复用 [019] 已落地的 §4.1 sunset 豁免机制托管（validator 兼容旧两域 + 标 sunset 截止条件），分叉可见可控，不重蹈 [019] 前的暗箱分叉。

### D3 — 批量编辑走聚合事务 + 聚合校验；**不保留**「单字段触发相关规则」
- 现状「批量 UI + 逐字段底层」错配 → 底层改为匹配 UI 的批量意图：批量编辑在**单事务**内写多字段，且**写入前跑聚合校验**（`evaluateDomainRules`）。
- **020 原文「为了修改单一字段，避免全局 validate，可以触发只涉及该字段相关的规则」作废**——该诉求预设的「单字段即时写」在当前 UI（`task-edit-zone` 批量 draft）里并不存在；批量场景天然在 submit 跑聚合，不需要字段→规则依赖图。
- `service.update`（顶层单字段 API）的去留在 plan 阶段评估：若两域确无「真单字段即时写」场景，则它是议题2 的下一个清理对象；`field-executor` + `mutation_mode` 仍作为 `service.execute` 聚合事务内 field step 的执行组件保留。

---

## 4. 规则三分类 + 判据

| 类别 | 归属 | 判据 | 触发 | 本次 |
|---|---|---|---|---|
| **Business Rule** | Domain（域代码 + onValidate） | Domain 内数据正确性；判定**需查库/读其他记录** | UI realtime（字段级）+ submit（聚合） | ✅ 做 |
| **Governance Rule** | manifest.Lifecycle + StateMachine | **纯状态图**，判定**不查库**（archived→draft 非法） | SM 转换守卫 | ✅ 已较好，维持 |
| **Policy Rule** | Nexus.RuleEngine（未来） | **跨域综合决策策略**（时间冲突/能量超载/OKR 过载） | RuleEngine | ⏸ TODO，defer |

**Business Rule 子类**（按查库范围递增）：
- 字段级（时间格式、非空、>0、枚举）：读当前字段，不查库 → realtime + submit
- 多字段聚合（开始<结束）：读当前 intent 多字段，不查库 → submit
- 记录层（归档前检查活跃下级）：**查本域其他记录** → submit only
- 跨对象（习惯时间重叠）：**查本域其他对象** → submit only

**边界澄清**：Business「记录层/跨对象」与 Governance 都可能卡在状态转换点，判据是**判定时是否查库**——查库的归 Business（submit 校验），纯状态图不查库的归 Governance（SM）。Business「跨对象」（同域数据正确性）与 Policy「跨域决策」（如时间冲突）的判据是**是否跨域综合**。

---

## 5. 触发机制

- **UI realtime**：字段级规则在 Page/CNUI 表单 blur 时跑（`useManifestRules` + registry realtime check，单字段纯函数，fail-OPEN 提示）。
- **submit 聚合**：action 提交后跑聚合校验（`evaluateDomainRules` 折叠 submit 规则，fail-CLOSED 阻断）。批量编辑 = 单事务内先聚合校验通过再写。按 action 类型（create/update/archive/delete…）触发其相关规则。
- **Policy 层**：跨域决策（OKR 评估/周总结/时间盒编排），本次不实现，后续可能需专门规则注册引擎。

---

## 6. 实现方案（方向，细节留 plan）

### 6.1 去 manifest C/L
- **C**：删死字段（`label`/`required`/`default_value`/`description`/`lifecycle_timestamp`/`synonyms`）。`type`/`options`/`mutation_mode` 保留 manifest（field-executor 已消费，移代码是额外工作无增量收益）——plan 阶段复核。
- **L**：`phase`/`fields`/`message` 并入 registry（每个 handler 自带 meta），manifest 不再声明 rules（registry 即 SSOT）。删 `get-realtime-rules` server action 中转，前端直 import registry 拿 realtime 元数据。

### 6.2 规则代码化组织
- 延续 `rules-registry.ts`（client-safe 纯 TS，realtime + submit 两 map），按 6.1 让 handler 自带 meta（phase/fields/message）。
- Business 子类（字段级/聚合/记录层/跨对象）的组织粒度（单 registry 文件 vs 按子类分文件）plan 阶段定。

### 6.3 修字段编辑写入路径（D3 落地，最高优先——是真 bug）
- `updateTask`（及核对后的 `updateHabit`）从「逐字段 `service.update`」改为「批量聚合事务 + 写前聚合校验」。
- 候选落点（plan 阶段定）：(a) 走 `executeIntent('updateTask', draft)`（自带 onValidate 聚合校验 + SM）；(b) 走 `service.execute` 并扩一个 validate step。关键约束：**写入前必须跑聚合校验 + 单事务原子**。

### 6.4 validator 改
- `G-rule-integrity`（manifest rules.id ↔ registry）随 L 简化删除（循环论证消除）。
- `mutation_mode` 合法值检查、`L3-2` 等按 C/L 去留调整。
- OKR/Timebox sunset 豁免清单加「C/L 旧范式」条目，标 sunset = 各自 onboarding。

### 6.5 constitution 修订
- §IX 约束 2（跨字段红线）+ 约束 3（规则三层）+ §III 字段三分类按本 design 走 Amendment Procedure（参考 `proposed-IX-domain-paradigm.md` 流程）。修订点：规则三层从「manifest 声明 + registry 处理」收敛为「registry 即 SSOT」；跨字段红线措辞修正（消除「inline 编辑 ⟹ FactField」的诱导）。

---

## 7. 范围 + sunset

- **本次完整做**：Tasks、Habits（去 C/L + 规则代码化 + 修 updateTask/updateHabit + 规则梳理编码 + 触发机制 UI/submit）。
- **sunset 记债**：OKR、Timebox 维持现状（C/L 旧范式），进 §4.1 豁免清单，sunset = 各自 onboarding。
- **defer**：Policy Rule（第三类）仅 TODO。

---

## 8. 已记录的 bug

- ✅ **`updateTask` 逐字段 `service.update` 无事务**（`app/actions/tasks.ts`）—— revisit 存档案题1 的实案。**2026-06-23 已修**：改为 `service.execute` 单事务聚合写（对齐 `updateHabit` intent.ts:910），TDD 覆盖（`update-task.integration.test.ts` 原子性：含非法字段 → 合法字段也未落库）。**本次只修事务原子性**；聚合校验缺失（部分字段聚合校验通用难题）仍留 D3。
- ✅ **`updateThread` 同病**（`app/actions/tasks.ts:371` 逐字段 `service.update`）—— **2026-06-24 已修**：同样改为 `service.execute` 单事务聚合写（`objectType='thread'`，对齐 updateTask），TDD 覆盖（`update-thread.integration.test.ts` 原子性）。两 tasks 写入口（task/thread）现已统一聚合事务路径，不再有两域分叉；聚合校验仍留 D3。

---

## 9. Alternatives（office-hours Phase 4 记录）

- **范围（D2）**：四域同步改（最干净但拖 onboarding，工作量爆炸）/ 两域完整+sunset（✅ 选）/ 最小子集（最稳但只解决一半）。
- **字段写机制（D3）**：批量聚合事务（✅ 选，匹配 UI + 修 bug）/ 单字段即时+写后跑相关规则（020 字面，建依赖图+改 UI，需求存疑）/ 维持逐字段+末尾补全量（打补丁，无事务）。
- **「动态」含义（D1）**：开发时集中管理（✅ 选）/ 运行时配置化（与 revisit 存档冲突）/ 混合预留（重蹈为声明而声明）。

---

## 10. Assignment（下一步）

1. **先修 `updateTask` bug**（独立、高优先、是真 bug）：改为批量聚合写 + 写前聚合校验。可作为本范式重构的首个落地验证 case。
2. 随后 `/writing-plans` 基于本 design doc 展开 spec + plan（去 C/L、规则代码化、validator、constitution 修订）。
3. plan 经 `/plan-eng-review` 后进 `/subagent-driven-dev+TDD`。

---

*本文为 `/office-hours` 产出，与 `mydocs/dev/020-对于系统规则管理的设计.md`（用户意图）+ revisit 存档（问题诊断）对齐。*
