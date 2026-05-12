# 项目文档清单与版本追踪

> 本文件为项目所有核心文档的索引与版本追踪表。
> Claude 在更新核心文档后 **MUST** 同步更新本文件的版本历史表。

## 文档归属模型

| 归属层 | 目录 | 维护者 | 规则 |
|---|---|---|---|
| **第一层：用户所有** | `mydocs/` | 用户编辑，Claude 只读 | 用户写指令后 Claude 才可更新 |
| **第二层：协同维护** | `docs/` | 用户定义意图，Claude 执行 | Claude 保证与代码一致性，用户不直接编辑 |
| **第三层：Claude 自动维护** | 根目录 + `.specify/` | Claude 维护，用户审批 | 包括本文件、CLAUDE.md、constitution.md、specs/ |

## 文档索引

### 第一层：用户所有 (`mydocs/`)

```
mydocs/core/
LW_overall_项目开发必读_2026_05_01.md          # 项目最高解释文档
LW_overall_总体设计_2026_05_02.md              # 架构设计-总体设计文档
LW_overall_技术栈设计演进_2026_03_18.md        # 技术栈选型与演进路径
LW_overall_意图驱动场景示例_2026_05_01.md      # 意图驱动场景流程示例（Nexus→Domain 全链路验证）
image-20260502091924536.png                    # 文档配图

mydocs/methodology/
LW_methodology_方法论落地设计规范_2026_03_18.md  # 方法论知识图谱梳理落地规划设计
LW_methodology_场景提示词设计方案_2026_04_06.md  # 方法论场景提示词方案（替代原知识库方案）
LW_methodology_冲突仲裁矩阵_2026_04_06.md       # 方法论原则冲突仲裁规则
```

### 第二层：协同维护 (`docs/`)

```
docs/
usom-design.md         # USOM 对象定义文档（由 LW_USOM_详细设计 演化）
database-design.md     # 数据库表结构与设计规范（由 LW_database_数据库设计 演化）
```

### 第三层：Claude 自动维护

```
/manifest.md                                # 本文件 — 文档索引与版本追踪
/CLAUDE.md                                  # Claude Code 开发指引
/.specify/memory/constitution.md            # 项目宪章
/specs/                                     # speckit 工作流生成的特性文档
```

## 文档更新规范

> **重要**：每次更新核心文档后，必须同步更新本文件的版本历史表。

### 更新流程

**第一层文档变更时：**
1. 用户直接编辑 mydocs/ 下的文档
2. 用户发出指令，Claude 根据变更同步更新第二层、第三层相关文件
3. Claude 更新本 manifest 的版本历史表

**第二层文档变更时（用户定义意图 → Claude 执行）：**
1. 用户描述意图（新增对象、修改字段等）
2. Claude 更新 `docs/usom-design.md` 和/或 `docs/database-design.md`
3. Claude 同步更新 Schema 代码
4. Claude 更新本 manifest 的版本历史表

**第三层文档变更时：**
1. Claude 更新对应文件
2. Claude 更新本 manifest 的版本历史表（如涉及核心文档变更）

## 版本历史

| 文档 | 当前版本 | 上一版本 | 主要变更 |
|---|---|---|---|
| 项目开发必读 | 2026_05_01 | 2026_03_18 | （待用户更新变更记录） |
| 总体设计 | 2026_05_02 | 2026_03_18 | 增加附录 TODO，列出可能的下一步核心扩展设计（非 MVP 考虑） |
| 技术栈设计演进 | 2026_03_18 | 2026_02_27 | 各阶段追加 Bridge Layer 实现时序、新增约束5、风险表新增2条 |
| 方法论落地设计规范 | 2026_03_18 | 无 | 创建 |
| USOM 详细设计 | 2026_05_12 | 2026_03_21 | 新增 Project/ProjectTemplate/TaskTemplate 类型；TaskStatus 扩展 in_progress/on_hold 状态、deprecated scheduled；Task 新增 parentId/projectId/时间窗口/频率等 10 个字段 |
| 数据库设计 | 2026_05_12 | 2026_03_21 | 新增 projects/project_templates/task_templates 表；tasks 表扩展状态枚举、新增 parent_id/project_id/时间窗口/频率等列和索引 |
| 场景提示词设计方案 | 2026_04_06 | 无 | 创建。确定场景提示词方案方向，替代原知识库方案 |
| 冲突仲裁矩阵 | 2026_04_06 | 无 | 创建。定义10条方法论冲突仲裁规则和5条仲裁原则 |
| 意图驱动场景示例 | 2026_05_01 | 无 | 创建。通过两个场景案例验证 Nexus→Domain 全链路 |
