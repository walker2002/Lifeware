# 待 revisit 架构议题：manifest 规则范式设计张力

> **状态**：🟡 **DEFERRED / 待 revisit（2026-06-23 存档）** — 已识别的设计张力，**未修订、未走 Amendment Procedure、未动代码**。本文件为存档，供未来架构讨论时召回。
> **关联宪法条款**：§IX Domain Development Paradigm 约束 2「跨字段红线」+ 约束 3「规则三层」；§III 业务事实写入口（字段三分类 `mutation_mode`）。两议题最终若要修，都触动 §IX/§III，须走 Amendment Procedure。
> **来源**：2026-06-23 session「系统规则检查及改进」两轮架构审视。用户判断：「需要在更高层次架构上讨论，而不是头痛医头」「先不动」。

---

## 议题 1：`mutation_mode` 把两个正交轴绑死（跨字段红线裂缝）

### 问题陈述

`mutation_mode`（`FactField`/`ContentField`/`PresentationField`）单个属性同时承载了两个**正交**维度：

| 维度 | 含义 | 本应由谁管 |
|---|---|---|
| 轴 A（前端 UX） | 字段能否 inline 编辑 + blur 跑 realtime rule | `realtime rule`（`phase: both`）+ `useManifestRules` |
| 轴 B（后端写入） | 写入走字段路径（字段级校验）还是 `executeIntent`（全量校验） | `mutation_mode` → 写入路径 |

三值的隐含契约是「**可 inline 编辑 ⟹ 只做字段级校验**」。但存在**混合态字段**——既有字段级校验需求（如时间格式 HH:MM），又参与跨字段不变量（如 `earliestTime ≤ defaultTime ≤ latestStartTime`）。这类字段要的是「**可 inline 编辑 + 写入触发全量校验**」，落在三值空档。

§IX 约束 2「跨字段红线」因此强行规定：带跨字段约束的字段禁止标 `FactField`/`ContentField`，必须走 `executeIntent`。但红线把「可 inline 编辑」和「FactField」绑在一起，使混合态字段**无法既 inline 又安全**。

### 证据（habits 现场）

- `domains/habits/manifest.yaml`（约 175–216 行）把 `latestStartTime`/`minDuration`/`defaultDuration`/`earliestTime` 标为 `FactField`
- `domains/habits/validation.ts:81-94, 104-105` 证明这些字段含**跨字段约束**：`earliestTime ≤ defaultTime ≤ latestStartTime`、`minDuration ≤ defaultDuration`
- `nexus/field-executor/index.ts:72-107` 的字段级校验**只做** enum 取值 / number 非负 / time 格式，完全不碰跨字段关系
- → 按 §IX 约束 2，habits 这些字段标 `FactField` 是**错的**：若开放 `mutationService.update` inline 写入，会静默绕过 `minDuration ≤ defaultDuration` 等约束。habits 创建走 `executeIntent`（状态转换，安全），隐患仅在 inline update 路径。

### 关键澄清

`realtime rule`（前端 blur 校验）与 `mutation_mode`（后端写入路径）是**正交**的。混合态字段完全可以「有 realtime rule 校验格式 + 后端走 `executeIntent` 全量」，二者不冲突——realtime rule 不依赖 `FactField` 标注。§2 决策树第一行措辞「*blur 改一个 FactField*」是诱导 habits 标错的根源（让人误以为「inline 编辑的字段就是 FactField」），但同表第二行其实限定了「FactField = 无跨字段约束的可 inline 字段」。

### 若修订的方向（revisit 时评估）

- **(A) 守范式**：混合态字段走 `executeIntent` 单字段 intent，不标 `mutation_mode`。不改范式，只修 habits 标注。代价：单字段写背全量校验成本。
- **(B) 扩范式**：`field-executor` 写完 FactField 后，追加跑「涉及该字段的 submit 聚合规则子集」——轻量（不全量）且保证不变量。这不是新 `mutation_mode`，而是给字段路径补可选「写后跨字段 revalidate」钩子。触动 §III。
- **推荐**：先 (A) 拉合规（范式已支持的安全态），(B) 待 inline 全量校验被测出是真瓶颈再立项。这正是 [018] `TENSION-4→4A` 的核心取舍（用「inline 写可能暂时违反跨字段不变量」换「inline 写的轻量」）——对 `title` 这类无跨字段字段合理，对硬不变量字段不可接受。

### revisit 触发条件（任一满足）

- habits 或其他域出现「inline 改跨字段字段 → 数据实际违反不变量」的实案
- 多个域出现混合态字段，(A) 的「单字段 intent 走全量」性能/语义成为负担
- 启动 okrs/timebox onboarding（届时会重新过字段分类，宜一并解决）

---

## 议题 2：manifest 区块 C / L 过度设计

### 问题陈述

manifest 把「本该是代码常量 / registry 的东西」放进声明式配置文件，**越过了声明式配置的合理边界**——该边界是「**须存在一个不改代码的消费方需要读它**」。越过此边界 = 「为声明而声明」，收获双处维护税，未兑现声明式收益。

### 证据

**区块 C `field_metadata`** —— 一半字段零运行时消费：

| 字段 | 运行时消费 | 说明 |
|---|---|---|
| `type` / `options` / `mutation_mode` | ✅ | 后端写入链路（field-executor / mutation-service / state-machine） |
| `label` / `required` / `default_value` / `description` | ❌ | 全域 grep 0 消费；前端表单（`habit-form.tsx`、`TaskCreationCard.tsx`）手写 label/options，**不读 manifest** |
| `lifecycle_timestamp` 类型 | ❌ | `nexus/orchestrator/lifecycle-configs.ts:214` 已 `@deprecated` |
| `synonyms` | ❌ | `nexus/core/intent-engine/routing-context.ts:13` TODO，未实现 |

→ C 混了「运行时配置」（type/options/mutation_mode）和「字段文档」（label/required 等），文档那半是死字段。消费方都在 nexus 后端，**无「跨层中立契约」兑现**（前端不读、AI 不读、外部工具不读）。

**区块 L `rules`** —— 是 `rules-registry.ts` 的冗余镜像：

| manifest `Rule` 字段 | registry 中已有的等价物 | 是否冗余 |
|---|---|---|
| `phase` | handler 挂在 `realtime` 还是 `submit` map（位置已隐含 phase） | 冗余 |
| `message` | handler 返回值自带（如 `'默认时长必须大于 0'`） | 冗余 |
| `fields` | realtime handler 是单字段且返回 `field` 名 | 冗余 |
| `id` | registry map 的 key | 冗余 |

- `nexus/rules/evaluate.ts:41-60` 按 manifest 顺序遍历 → 用 `rule.id` 查 registry → 用 `rule.phase` 决定走哪个 map；而 registry 自身的 map 结构已表达这一切。
- **声明式承诺未兑现**：manifest 卖点是「改规则不改代码」，但校验逻辑（`validateHabitFields` 等）必须在 registry 代码里，改规则必改代码。规则是固定常识，无「运行时变动」需求 → 无声明式收益。
- **CI cross-check 是循环论证**：`scripts/validate-manifest.ts:368` 的 `G-rule-integrity`（对应 C-DC `L3-2`）防「manifest 声明了 rule 但 registry 没 handler」。但 manifest 的存在本身制造了「两边不一致」风险，validator 再去查它；规则只存 registry 一处，风险与 validator **同时消失**。
- **`get-realtime-rules` 绕道多余**：`rules-registry.ts` 文件头注释明说「纯 TS 模块，client + server 皆可 import」——前端可直接 import registry 拿 message，不需 server action 中转 manifest。

### 根因（两议题共同病根）

C 与 L 同源于「**把 manifest 当万能声明层**」的倾向——以为越多东西放 manifest 越「声明式」、越「SSOT」。但声明式配置的合理边界是「有不改代码的消费方」。C 的 `label`/`required` 与 L 的 `rules` 都不满足：消费方要么不存在（前端不读 label），要么就是代码自己（registry 读 registry）。

### 公允对照（避免以偏概全）

**manifest 整体不是过度设计**。区块 A/B/K/G 是真配置——公共层 nexus 不硬编码地消费域数据的通道：

| 区块 | 不改代码的消费方 | 性质 |
|---|---|---|
| A `intent_triggers` | Intent Engine（公共层路由） | ✅ 真配置 |
| B `lifecycle` | State Machine（公共层转换） | ✅ 真配置 |
| K `cnui_surfaces` | CnuiRenderer（公共层发现 surface） | ✅ 真配置 |
| G `view_routes` | 构建时路由生成脚本 | ✅ 真配置 |
| **C `field_metadata`** | 无（前端不读，仅后端代码读） | ⚠️ 半配置半文档 |
| **L `rules`** | 无（registry 自己读自己） | ⚠️ 冗余镜像 |

问题只在 C/L 越过声明式边界，不在 manifest 机制本身。

### 若修订的方向（revisit 时评估）

- **C**：删 `label`/`required`/`default_value`/`description`/`lifecycle_timestamp`/`synonyms`（死字段），只留 `type`/`options`/`mutation_mode`；或干脆把这三者降级为 field-executor 旁的 TS 常量。
- **L**：`phase`/`fields`/`message` 并入 registry（每个 handler 自带 meta），manifest 只留「规则 id 清单」或连清单都不要（registry 即 SSOT）；删 `get-realtime-rules` server action 中转，前端直 import registry；`L3-2`/`G-rule-integrity` CI 随之简化（它是 manifest 制造又自己查的问题）。

### revisit 触发条件（任一满足）

- C/L 双处维护造成实际不一致 bug
- 新 Domain onboarding 时 manifest 模板负担过重，onboarding 成本被 manifest 拖累
- 与议题 1 合并处理（两者都触动 §III 字段三分类 + manifest `field_metadata`，宜一次性范式简化）

---

## 处置

- **当前不修订、不动代码**。功能债（okrs/timebox onboarding、[025] 级联、议题 1 的 habits 标注）优先级高于此处的「认知负担/双处维护税」问题。
- 两议题最终大概率**合并为一次 §IX/§III 范式简化修订**（都触动字段三分类 + manifest 声明边界），届时走 Amendment Procedure（参考 `.specify/amendments/proposed-IX-domain-paradigm.md` 的 Rationale / Impact Analysis / Superseding Language 流程）。
- 本存档列入 manifest.md 第三层索引；revisit 时从本文件起，不必回放 session。
